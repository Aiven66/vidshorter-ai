const http = require('node:http');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const PROXY_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Amazon 反爬体系（实测 2026-09）：
 *  - 桌面 UA（无论 Node 还是 Chromium 网络栈）一律返回 "automated access" 挑战页；
 *  - Node TLS 指纹 + 移动 UA 只拿到 JS 壳页（无 SSR 商品数据）；
 *  - Chromium 网络栈 + iPhone 移动 UA：IP 未被标记时拿到完整 SSR 商品页；
 *  - IP 被标记后（频繁抓取触发风控）移动 UA 也会被拦，此时唯一可靠通道：
 *    隐藏 BrowserWindow 先访问 amazon.com 首页建立 session cookies，
 *    再以「同 session cookies + 移动 UA」发起 net 请求（实测 1.5MB 完整页）。
 */
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

// 必须 persist: 前缀的持久 session：无前缀的内存 session 会随预热窗口
// 销毁而被回收，此时再以其发起 net.request 会 native crash（主进程闪退）
const AMAZON_WARMUP_PARTITION = 'persist:amazon-warmup';
/** 预热会话有效期：10 分钟内复用，避免每次请求都重新预热 */
const WARMUP_TTL_MS = 10 * 60 * 1000;
let amazonWarmupAt = 0;
/** 预热窗口模块级复用、永不销毁：destroy 后立即以其 session 发 net 请求会挂死 */
let amazonWarmupWin = null;

/** 判定返回内容是否为 Amazon 反爬挑战页 */
function isAmazonChallengeHtml(html) {
  if (!html) return true;
  if (/api-services-support@amazon/i.test(html)) return true;
  // 挑战页极短且不含商品节点
  if (html.length < 12000 && !/productTitle/i.test(html) && /amazon\.com/i.test(html.slice(0, 2000))) return true;
  return false;
}

/**
 * 用隐藏 BrowserWindow 访问 amazon.com 首页，建立反爬认可的 session cookies。
 * 复用持久化 partition，10 分钟内的多次请求共享同一批 cookies。
 */
async function warmupAmazonSession() {
  if (Date.now() - amazonWarmupAt < WARMUP_TTL_MS) return;
  const { BrowserWindow } = require('electron');
  if (!amazonWarmupWin || amazonWarmupWin.isDestroyed()) {
    amazonWarmupWin = new BrowserWindow({
      show: false,
      width: 420,
      height: 860,
      webPreferences: { partition: AMAZON_WARMUP_PARTITION },
    });
  }
  const win = amazonWarmupWin;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('warmup timeout')), 20000);
      win.webContents.loadURL('https://www.amazon.com/', { userAgent: MOBILE_UA })
        .then(() => { clearTimeout(timer); resolve(); })
        .catch((e) => { clearTimeout(timer); reject(e); });
    });
    // 等待 JS 写入 cookies
    await new Promise((r) => setTimeout(r, 2500));
    amazonWarmupAt = Date.now();
  } catch {
    // 预热失败不缓存，下次重试
  }
}

/**
 * Fetch a page through Electron's Chromium network stack (real Chrome TLS
 * fingerprint). Anti-bot CDNs (Amazon etc.) block Node's TLS fingerprint
 * with a challenge page ~100% of the time, while Chrome's fingerprint
 * passes — this is the only reliable way to scrape such pages from the
 * desktop app.
 */
function electronNetGet(targetUrl, timeoutMs = 20000, maxBytes = 8 * 1024 * 1024, session = null, acceptLanguage = '') {
  return new Promise((resolve, reject) => {
    let netModule = null;
    try { netModule = require('electron').net; } catch {}
    if (!netModule) { reject(new Error('electron net unavailable')); return; }
    let finalUrl = targetUrl;
    const isAmazon = /amazon\./i.test(targetUrl);
    const req = session
      ? netModule.request({ url: targetUrl, useSessionCookies: true, session })
      : netModule.request(targetUrl);
    req.setHeader('User-Agent', isAmazon ? MOBILE_UA : PROXY_UA);
    req.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    req.setHeader('Accept-Language', acceptLanguage || 'zh-CN,zh;q=0.9,en;q=0.8');
    req.on('redirect', (ev) => { finalUrl = ev.url || finalUrl; });
    const timer = setTimeout(() => {
      try { req.abort(); } catch {}
      reject(new Error(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };
    req.on('response', (resp) => {
      const chunks = [];
      let size = 0;
      let aborted = false;
      resp.on('data', (c) => {
        if (aborted) return;
        size += c.length;
        if (size > maxBytes) {
          aborted = true;
          try { req.abort(); } catch {}
          finish(reject, new Error('response too large'));
          return;
        }
        chunks.push(c);
      });
      resp.on('end', () => finish(resolve, {
        statusCode: resp.statusCode || 0,
        contentType: String(resp.headers['content-type'] || ''),
        finalUrl,
        buffer: Buffer.concat(chunks),
      }));
      resp.on('error', (e) => finish(reject, e));
    });
    req.on('error', (e) => finish(reject, e));
    req.end();
  });
}

/** 解压 net 响应体（gzip/br/deflate）；若已是明文则原样返回 */
function decodeResponseBody(buf) {
  const zlib = require('node:zlib');
  // 明文 HTML 直接返回
  const head = buf.subarray(0, 200).toString('latin1');
  if (head.includes('<') || head.toLowerCase().includes('<!doctype')) return buf;
  // gzip magic bytes
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try { return zlib.gunzipSync(buf); } catch {}
  }
  // 尝试 brotli / deflate（无法靠 magic bytes 判断，逐个试）
  try { return zlib.brotliDecompressSync(buf); } catch {}
  try { return zlib.inflateSync(buf); } catch {}
  return buf;
}

/**
 * Amazon 专用抓取（三级递进）：
 *  1. net + 移动 UA 直连（IP 干净时最快路径）
 *  2. 被拦 → BrowserWindow 首页预热建立 cookies → net 带同 session cookies 重试
 *  3. 仍被拦 → 再预热一次（强制刷新）重试
 */
async function amazonFetch(targetUrl, timeoutMs = 20000, acceptLanguage = '') {
  const debug = (m) => { if (process.env.AMAZON_FETCH_DEBUG) console.log(`[amazonFetch] ${m}`); };
  // 第 1 级：直连
  try {
    debug('level1 direct');
    const r = await electronNetGet(targetUrl, timeoutMs, 8 * 1024 * 1024, null, acceptLanguage);
    const html = decodeResponseBody(r.buffer).toString('utf8');
    debug(`level1 len=${html.length} challenge=${isAmazonChallengeHtml(html)}`);
    if (!isAmazonChallengeHtml(html)) {
      return { statusCode: r.statusCode, contentType: r.contentType, finalUrl: r.finalUrl, html };
    }
  } catch (e) { debug(`level1 err ${e.message}`); }
  // 第 2/3 级：预热 + 带 cookies 重试
  const { session } = require('electron');
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1) amazonWarmupAt = 0; // 强制重新预热
    debug(`level${2 + attempt} warmup begin`);
    await warmupAmazonSession();
    debug(`level${2 + attempt} warmup done`);
    try {
      const ses = session.fromPartition(AMAZON_WARMUP_PARTITION);
      debug(`level${2 + attempt} net with cookies`);
      const r = await electronNetGet(targetUrl, timeoutMs, 8 * 1024 * 1024, ses, acceptLanguage);
      const html = decodeResponseBody(r.buffer).toString('utf8');
      debug(`level${2 + attempt} len=${html.length} challenge=${isAmazonChallengeHtml(html)}`);
      if (!isAmazonChallengeHtml(html)) {
        return { statusCode: r.statusCode, contentType: r.contentType, finalUrl: r.finalUrl, html };
      }
    } catch (e) { debug(`level${2 + attempt} err ${e.message}`); }
  }
  throw new Error('Amazon anti-bot challenge could not be bypassed');
}


function createMediaServer(opts = {}) {
  const baseDir = '/tmp/generated-clips';
  const uploadDir = '/tmp/video-cache/uploads';
  const downloadDir = '/tmp/video-cache/downloads';
  const uiDir = typeof opts.uiDir === 'string' ? opts.uiDir : '';
  try { fsSync.mkdirSync(uploadDir, { recursive: true }); } catch {}
  try { fsSync.mkdirSync(downloadDir, { recursive: true }); } catch {}

  let baseUrl = '';
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Headers', 'range, content-type, accept, origin, x-filename, authorization, access-control-request-private-network');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const headerName = typeof req.headers['x-filename'] === 'string' ? req.headers['x-filename'] : '';
      const decoded = (() => {
        try { return decodeURIComponent(headerName); } catch { return headerName; }
      })();
      const safeName = path.basename(String(decoded || 'video.mp4')).replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'video.mp4';
      const storedName = `${Date.now()}-${randomUUID()}-${safeName}`;
      const filePath = path.join(uploadDir, storedName);
      try {
        const out = fsSync.createWriteStream(filePath);
        req.pipe(out);
        out.on('finish', () => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ url: `${baseUrl}/api/local-video/${storedName}` }));
        });
        out.on('error', () => {
          res.statusCode = 500;
          res.end('write failed');
        });
      } catch {
        res.statusCode = 500;
        res.end('write failed');
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/proxy-fetch') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        try {
          const parsedBody = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          const target = typeof parsedBody.url === 'string' ? parsedBody.url.trim() : '';
          if (!/^https?:\/\//i.test(target)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'invalid url' }));
            return;
          }
          // Amazon 走三级递进抓取（直连 → 预热 cookies → 强制预热重试）
          if (/amazon\./i.test(target)) {
            const acceptLanguage = typeof parsedBody.acceptLanguage === 'string' ? parsedBody.acceptLanguage.slice(0, 60) : '';
            const r = await amazonFetch(target, 20000, acceptLanguage);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              ok: r.statusCode >= 200 && r.statusCode < 400,
              status: r.statusCode,
              contentType: r.contentType,
              finalUrl: r.finalUrl,
              html: r.html,
            }));
            return;
          }
          const r = await electronNetGet(target, 20000);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            ok: r.statusCode >= 200 && r.statusCode < 400,
            status: r.statusCode,
            contentType: r.contentType,
            finalUrl: r.finalUrl,
            html: r.buffer.toString('utf8'),
          }));
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String((e && e.message) || e) }));
        }
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/process-video') {
      try {
        if (typeof opts.onProcessVideo === 'function') {
          opts.onProcessVideo(req, res, {
            baseUrl,
            dirs: { baseDir, uploadDir, downloadDir },
          });
          return;
        }
      } catch {}
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    if (uiDir && req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/_next/') || url.pathname.startsWith('/assets/') || url.pathname === '/favicon.ico' || url.pathname === '/robots.txt' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.json') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.ico') || url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.jpeg') || url.pathname.endsWith('.webp') || url.pathname.endsWith('.woff2'))) {
      const rel = url.pathname === '/' ? '/index.html' : url.pathname;
      const safeRel = path.posix.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
      const filePath = path.join(uiDir, safeRel);
      try {
        const stat = fsSync.statSync(filePath);
        if (!stat.isFile()) throw new Error('not file');
        const ext = path.extname(filePath).toLowerCase();
        const ct = ext === '.html' ? 'text/html; charset=utf-8'
          : ext === '.js' ? 'application/javascript; charset=utf-8'
            : ext === '.css' ? 'text/css; charset=utf-8'
              : ext === '.json' ? 'application/json; charset=utf-8'
                : ext === '.svg' ? 'image/svg+xml'
                  : ext === '.ico' ? 'image/x-icon'
                    : ext === '.png' ? 'image/png'
                      : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
                        : ext === '.webp' ? 'image/webp'
                          : ext === '.woff2' ? 'font/woff2'
                            : 'application/octet-stream';
        res.statusCode = 200;
        res.setHeader('Content-Type', ct);
        res.setHeader('Content-Length', String(stat.size));
        fsSync.createReadStream(filePath).pipe(res);
        return;
      } catch {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
    }

    const serveMatch = url.pathname.match(/^\/api\/serve-clip\/([^/]+)$/);
    const localMatch = url.pathname.match(/^\/api\/local-video\/([^/]+)$/);
    const name = serveMatch?.[1] || localMatch?.[1] || '';
    if (!name) { res.statusCode = 404; res.end('not found'); return; }
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) { res.statusCode = 400; res.end('bad request'); return; }
    const filePath = serveMatch
      ? path.join(baseDir, path.basename(name))
      : path.join(uploadDir, path.basename(name));
    try {
      const stat = fsSync.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.jpg' || ext === '.jpeg') res.setHeader('Content-Type', 'image/jpeg');
      else if (ext === '.mp4') res.setHeader('Content-Type', 'video/mp4');
      else res.setHeader('Content-Type', 'application/octet-stream');

      if (req.method === 'HEAD') { res.statusCode = 200; res.setHeader('Content-Length', String(stat.size)); res.end(); return; }

      const range = req.headers.range || '';
      if (typeof range === 'string' && range.startsWith('bytes=')) {
        const [a, b] = range.replace('bytes=', '').split('-');
        const start = Math.max(0, parseInt(a || '0', 10) || 0);
        const end = Math.min(stat.size - 1, parseInt(b || String(stat.size - 1), 10) || (stat.size - 1));
        if (start >= stat.size) { res.statusCode = 416; res.end(); return; }
        res.statusCode = 206;
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        res.setHeader('Content-Length', String(end - start + 1));
        fsSync.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Length', String(stat.size));
      fsSync.createReadStream(filePath).pipe(res);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });

  server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`;
    if (readyResolve) readyResolve();
  });

  return {
    server,
    ready,
    getBaseUrl: () => baseUrl,
    dirs: { baseDir, uploadDir, downloadDir },
    close: async () => {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = { createMediaServer };
