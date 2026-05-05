const http = require('node:http');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

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
