const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function resolveAppBundlePath() {
  try {
    const p = String(process.execPath || '');
    const idx = p.indexOf('/Contents/MacOS/');
    if (idx > 0) return p.slice(0, idx);
  } catch {}
  return '';
}

function resolveYtDlpBinPath() {
  const override = String(process.env.VIDSHORTER_YTDLP_PATH || process.env.YT_DLP_BIN_PATH || '').trim();
  if (override) return override;
  try {
    const electron = require('electron');
    const app = electron && electron.app;
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'bin', 'yt-dlp');
    }
  } catch {}
  return path.join(os.tmpdir(), 'yt-dlp');
}

function resolveBundledYtDlpPath() {
  const override = String(process.env.VIDSHORTER_BUNDLED_YTDLP_PATH || '').trim();
  if (override) return override;
  try {
    const root = process.resourcesPath || '';
    if (root) {
      return path.join(root, 'app.asar.unpacked', 'bin', 'yt-dlp');
    }
  } catch {}
  return path.join(__dirname, 'bin', 'yt-dlp');
}

const YT_DLP_BIN_PATH = resolveYtDlpBinPath();
const YT_DLP_BUNDLED_PATH = resolveBundledYtDlpPath();
const YT_DLP_DARWIN_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
const HAS_EXPLICIT_YTDLP_PATH = !!String(process.env.VIDSHORTER_YTDLP_PATH || process.env.YT_DLP_BIN_PATH || '').trim();

function isDarwin() {
  return process.platform === 'darwin';
}

async function isLocalPortOpen(port) {
  return await new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, timeout: 200 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function resolveHttpProxy() {
  const envProxy = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || '').trim();
  if (envProxy) return envProxy;
  if (await isLocalPortOpen(7890)) return 'http://127.0.0.1:7890';
  return '';
}

async function fetchToFile(url, filePath, proxy, redirectsLeft = 5) {
  const { HttpsProxyAgent } = require('https-proxy-agent');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await new Promise((resolve, reject) => {
    const out = fsSync.createWriteStream(filePath);
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
    const req = https.get(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location && redirectsLeft > 0) {
        const nextUrl = new URL(res.headers.location, url).toString();
        try { res.resume(); } catch {}
        out.close(() => {
          fs.rm(filePath, { force: true }).catch(() => {}).finally(() => {
            fetchToFile(nextUrl, filePath, proxy, redirectsLeft - 1).then(resolve, reject);
          });
        });
        return;
      }
      if (code >= 300) {
        reject(new Error('HTTP ' + code));
        try { res.resume(); } catch {}
        return;
      }
      res.pipe(out);
      out.on('finish', () => resolve());
    });
    req.on('error', reject);
    out.on('error', reject);
  });
}

async function sniffFilePrefix(filePath, bytes = 16) {
  const fd = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fd.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fd.close().catch(() => {});
  }
}

function looksLikeMachO(prefix) {
  if (!prefix || prefix.length < 4) return false;
  const x = prefix.readUInt32BE(0);
  const y = prefix.readUInt32LE(0);
  return (
    x === 0xcafebabe
    || x === 0xcefaedfe
    || x === 0xcffaedfe
    || y === 0xfeedface
    || y === 0xfeedfacf
    || y === 0xbebafeca
  );
}

function looksLikeHtml(prefix) {
  const s = Buffer.isBuffer(prefix) ? prefix.toString('utf8').toLowerCase() : '';
  return s.includes('<!doctype html') || s.includes('<html');
}

async function validateYtDlpFile(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error('not a file');
  if (stat.size < 500_000) throw new Error(`file too small (${stat.size} bytes)`);
  const prefix = await sniffFilePrefix(filePath, 16);
  if (looksLikeHtml(prefix)) throw new Error('downloaded html instead of binary');
  if (!looksLikeMachO(prefix) && prefix.toString('utf8').slice(0, 2) !== '#!') {
    throw new Error('unknown binary format');
  }
}

async function tryDequarantine(filePath) {
  if (!filePath) return;
  try {
    await execFileAsync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', filePath], { timeout: 5000 });
  } catch {}
}

async function tryExecYtDlpVersion(filePath, timeout) {
  await tryDequarantine(filePath);
  return await execFileAsync(filePath, ['--version'], { timeout });
}

async function ensureBundledYtDlpInstalled() {
  try {
    if (!fsSync.existsSync(YT_DLP_BUNDLED_PATH)) return;
    await validateYtDlpFile(YT_DLP_BUNDLED_PATH);
  } catch {
    return;
  }

  try {
    await validateYtDlpFile(YT_DLP_BIN_PATH);
    return;
  } catch {}

  try {
    await fs.mkdir(path.dirname(YT_DLP_BIN_PATH), { recursive: true });
    const tmp = `${YT_DLP_BIN_PATH}.tmp`;
    await fs.rm(tmp, { force: true }).catch(() => {});
    await fs.copyFile(YT_DLP_BUNDLED_PATH, tmp);
    await fs.chmod(tmp, 0o755);
    await tryDequarantine(tmp);
    await validateYtDlpFile(tmp);
    await fs.rename(tmp, YT_DLP_BIN_PATH);
    await tryDequarantine(YT_DLP_BIN_PATH);
  } catch {}
}

let ytDlpCommand = null;
let ytDlpUseModule = false;
let nodeJsPath = null;

async function findNodeJs() {
  if (nodeJsPath) return nodeJsPath;
  const candidates = [
    process.execPath,
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    '/Users/aiven/.deskclaw/node/bin/node',
    '/Users/aiven/.nvm/versions/node/*/bin/node',
  ];
  for (const c of candidates) {
    try {
      if (c.includes('*')) continue;
      await fs.access(c, fsSync.constants.X_OK);
      nodeJsPath = c;
      return c;
    } catch {}
  }
  try {
    const { stdout } = await execFileAsync('which', ['node'], { timeout: 5000 });
    const p = stdout.trim();
    if (p) {
      nodeJsPath = p;
      return p;
    }
  } catch {}
  return null;
}

async function canUseSystemYtDlp() {
  const candidates = [
    '/Users/aiven/.local/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/opt/homebrew/bin/yt-dlp',
  ];
  for (const c of candidates) {
    try {
      const { stdout } = await execFileAsync(c, ['--version'], { timeout: 10_000 });
      if (stdout && stdout.trim()) {
        ytDlpCommand = c;
        ytDlpUseModule = false;
        return true;
      }
    } catch {}
  }
  try {
    const { stdout } = await execFileAsync('yt-dlp', ['--version'], { timeout: 10_000 });
    if (stdout && stdout.trim()) {
      ytDlpCommand = 'yt-dlp';
      ytDlpUseModule = false;
      return true;
    }
  } catch {}
  return false;
}

async function canUsePythonYtDlpModule() {
  const pythonPaths = ['/usr/bin/python3', '/usr/local/bin/python3', 'python3'];
  for (const pythonPath of pythonPaths) {
    try {
      await execFileAsync(pythonPath, ['-m', 'yt_dlp', '--version'], {
        timeout: 10_000,
        env: { ...process.env, PYTHONWARNINGS: 'ignore' },
      });
      ytDlpCommand = pythonPath;
      ytDlpUseModule = true;
      return true;
    } catch {}
  }
  return false;
}

async function ensureYtDlp() {
  if (ytDlpCommand) return;

  if (HAS_EXPLICIT_YTDLP_PATH) {
    await tryExecYtDlpVersion(YT_DLP_BIN_PATH, 30_000);
    ytDlpCommand = YT_DLP_BIN_PATH;
    ytDlpUseModule = false;
    return;
  }

  try {
    if (await canUseSystemYtDlp()) return;
  } catch {}

  try {
    if (await canUsePythonYtDlpModule()) return;
  } catch {}

  await tryDequarantine(resolveAppBundlePath());
  await ensureBundledYtDlpInstalled();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await validateYtDlpFile(YT_DLP_BIN_PATH);
      try {
        await tryExecYtDlpVersion(YT_DLP_BIN_PATH, 30_000);
      } catch (e) {
        const signal = e && typeof e.signal !== 'undefined' ? String(e.signal) : '';
        if (signal === 'SIGTERM') await tryExecYtDlpVersion(YT_DLP_BIN_PATH, 180_000);
        else throw e;
      }
      ytDlpCommand = YT_DLP_BIN_PATH;
      ytDlpUseModule = false;
      return;
    } catch {
      if (attempt === 0) await fs.rm(YT_DLP_BIN_PATH, { force: true }).catch(() => {});
    }
  }

  if (!isDarwin()) throw new Error('yt-dlp not available');

  const proxy = await resolveHttpProxy();
  const tmpPath = `${YT_DLP_BIN_PATH}.download`;
  await fs.rm(tmpPath, { force: true }).catch(() => {});
  await fs.rm(YT_DLP_BIN_PATH, { force: true }).catch(() => {});
  await fetchToFile(YT_DLP_DARWIN_URL, tmpPath, proxy);
  await fs.chmod(tmpPath, 0o755);
  await tryDequarantine(tmpPath);
  try {
    await validateYtDlpFile(tmpPath);
    await fs.rename(tmpPath, YT_DLP_BIN_PATH);
  } catch (e) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw e;
  }
  await tryDequarantine(YT_DLP_BIN_PATH);
  try {
    try {
      await tryExecYtDlpVersion(YT_DLP_BIN_PATH, 30_000);
    } catch (e) {
      const signal = e && typeof e.signal !== 'undefined' ? String(e.signal) : '';
      if (signal === 'SIGTERM') await tryExecYtDlpVersion(YT_DLP_BIN_PATH, 180_000);
      else throw e;
    }
  } catch (e) {
    const stderr = e && typeof e.stderr === 'string' ? e.stderr.trim() : '';
    const code = e && typeof e.code !== 'undefined' ? String(e.code) : '';
    const signal = e && typeof e.signal !== 'undefined' ? String(e.signal) : '';
    const detail = [
      code ? `code=${code}` : '',
      signal ? `signal=${signal}` : '',
      stderr ? stderr.slice(0, 300) : '',
    ].filter(Boolean).join('\n');
    await fs.rm(YT_DLP_BIN_PATH, { force: true }).catch(() => {});
    throw new Error(`yt-dlp is not executable at ${YT_DLP_BIN_PATH}${detail ? '\n' + detail : ''}`);
  }
  ytDlpCommand = YT_DLP_BIN_PATH;
  ytDlpUseModule = false;
}

function isYouTubeUrl(url) {
  return url && (url.includes('youtube.com') || url.includes('youtu.be'));
}

function browserCookieStoreExists(browser) {
  if (process.env.VIDSHORTER_TEST_ENABLE_COOKIE_STRATEGIES === '1') return true;
  const home = os.homedir();
  const candidatesByBrowser = {
    chrome: [path.join(home, 'Library', 'Application Support', 'Google', 'Chrome')],
    chromium: [path.join(home, 'Library', 'Application Support', 'Chromium')],
    brave: [path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser')],
    edge: [path.join(home, 'Library', 'Application Support', 'Microsoft Edge')],
    firefox: [path.join(home, 'Library', 'Application Support', 'Firefox', 'Profiles')],
    safari: [path.join(home, 'Library', 'Containers', 'com.apple.Safari'), path.join(home, 'Library', 'Safari')],
  };
  const candidates = candidatesByBrowser[browser] || [];
  return candidates.some((p) => {
    try { return fsSync.existsSync(p); } catch { return false; }
  });
}

function parsePercent(chunk) {
  const text = String(chunk || '');
  const matches = [...text.matchAll(/(?:\[download\]\s*)?(\d+(?:\.\d+)?)%/g)];
  if (!matches.length) return null;
  const n = Number(matches[matches.length - 1][1]);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

function makeCommandFailure(cmd, args, code, signal, stdout, stderr, timedOut, strategyName) {
  const detail = stderr.trim() || stdout.trim() || `exit ${code ?? signal ?? 'unknown'}`;
  const err = new Error(`yt-dlp ${strategyName ? `(${strategyName}) ` : ''}failed: ${timedOut ? 'timed out' : detail.slice(0, 500)}`);
  err.code = code;
  err.signal = signal;
  err.stdout = stdout;
  err.stderr = stderr;
  err.timedOut = timedOut;
  err.cmd = cmd;
  err.args = args;
  return err;
}

async function execYtDlpStreaming(cmd, cmdArgs, options, strategyName) {
  const timeoutMs = Math.max(5_000, options.timeoutMs || 180_000);
  const maxBuffer = options.maxBuffer || 30 * 1024 * 1024;
  const env = { ...process.env, PYTHONWARNINGS: 'ignore', ...(options.env || {}) };

  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let lastPercent = -1;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const handleChunk = (source, chunk) => {
      const text = String(chunk || '');
      if (source === 'stdout') stdout += text;
      else stderr += text;
      if (stdout.length + stderr.length > maxBuffer) {
        try { child.kill('SIGKILL'); } catch {}
        finish(reject, makeCommandFailure(cmd, cmdArgs, null, 'MAXBUFFER', stdout, stderr, false, strategyName));
        return;
      }
      if (typeof options.onOutput === 'function') options.onOutput(text, source, strategyName);
      const pct = parsePercent(text);
      if (pct !== null && pct > lastPercent) {
        lastPercent = pct;
        if (typeof options.onProgress === 'function') options.onProgress(pct, strategyName);
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => {
        if (!settled) {
          try { child.kill('SIGKILL'); } catch {}
        }
      }, 1500).unref?.();
    }, timeoutMs);

    child.stdout.on('data', (b) => handleChunk('stdout', b));
    child.stderr.on('data', (b) => handleChunk('stderr', b));
    child.on('error', (e) => finish(reject, e));
    child.on('close', (code, signal) => {
      if (code === 0) finish(resolve, { stdout, stderr });
      else finish(reject, makeCommandFailure(cmd, cmdArgs, code, signal, stdout, stderr, timedOut, strategyName));
    });
  });
}

function buildStrategies(isYT, preferCookies = false) {
  if (!isYT) {
    const browsers = ['chrome', 'chromium', 'brave', 'edge', 'safari', 'firefox'].filter(browserCookieStoreExists);
    return [
      ...browsers.map((browser) => ({ name: `cookies-${browser}`, cookieBrowser: browser, extraArgs: [], isCookie: true })),
      { name: 'no-cookies', cookieBrowser: null, extraArgs: [], isCookie: false },
    ];
  }

  const publicStrategies = [
    { name: 'mweb', cookieBrowser: null, extraArgs: ['--extractor-args', 'youtube:player_client=mweb'], isCookie: false },
    { name: 'tv-embedded', cookieBrowser: null, extraArgs: ['--extractor-args', 'youtube:player_client=tv_embedded'], isCookie: false },
    { name: 'android', cookieBrowser: null, extraArgs: ['--extractor-args', 'youtube:player_client=android'], isCookie: false },
    { name: 'ios', cookieBrowser: null, extraArgs: ['--extractor-args', 'youtube:player_client=ios'], isCookie: false },
  ];
  const cookieStrategies = ['chrome', 'chromium', 'brave', 'edge', 'safari', 'firefox']
    .filter(browserCookieStoreExists)
    .flatMap((browser) => [
      { name: `${browser}+mweb`, cookieBrowser: browser, extraArgs: ['--extractor-args', 'youtube:player_client=mweb'], isCookie: true },
      { name: `${browser}+tv-embedded`, cookieBrowser: browser, extraArgs: ['--extractor-args', 'youtube:player_client=tv_embedded'], isCookie: true },
      { name: `${browser}+android`, cookieBrowser: browser, extraArgs: ['--extractor-args', 'youtube:player_client=android'], isCookie: true },
    ]);

  return preferCookies ? [...cookieStrategies, ...publicStrategies] : [...publicStrategies, ...cookieStrategies];
}

async function runYtDlp(args, options = {}) {
  await ensureYtDlp();
  const proxy = await resolveHttpProxy();
  const proxyArgs = proxy ? ['--proxy', proxy] : [];

  const nodePath = await findNodeJs();
  const jsRuntimeArgs = nodePath && !ytDlpUseModule ? ['--js-runtimes', `node:${nodePath}`] : [];

  const videoUrl = args.find(a => a.startsWith('http'));
  const isYT = isYouTubeUrl(videoUrl);
  const allStrategies = buildStrategies(isYT, options.preferCookies);

  let lastError = null;
  const startedAt = Date.now();
  const overallTimeoutMs = options.overallTimeoutMs || 8 * 60_000;

  for (const strategy of allStrategies) {
    const remainingMs = overallTimeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;
    const commonArgs = [
      '--no-check-certificate',
      '--socket-timeout', '20',
      '--retries', '1',
      '--fragment-retries', '1',
      '--geo-bypass',
      '--no-warnings',
      '--newline',
      ...jsRuntimeArgs,
    ];

    if (strategy.cookieBrowser) {
      commonArgs.push('--cookies-from-browser', strategy.cookieBrowser);
    }

    commonArgs.push(...proxyArgs, ...strategy.extraArgs);

    const [cmd, cmdArgs] = ytDlpUseModule
      ? [ytDlpCommand, ['-m', 'yt_dlp', ...commonArgs, ...args]]
      : [ytDlpCommand, [...commonArgs, ...args]];

    try {
      if (typeof options.onStrategy === 'function') options.onStrategy(strategy.name);
      return await execYtDlpStreaming(cmd, cmdArgs, {
        timeoutMs: Math.min(
          remainingMs,
          strategy.isCookie
            ? (options.cookieStrategyTimeoutMs || 60_000)
            : (options.strategyTimeoutMs || 90_000),
        ),
        maxBuffer: options.maxBuffer,
        env: options.env,
        onOutput: options.onOutput,
        onProgress: options.onProgress,
      });
    } catch (e) {
      lastError = e;
      const stderr = e && typeof e.stderr === 'string' ? e.stderr.trim() : '';
      if (typeof options.onStrategyError === 'function') options.onStrategyError(strategy.name, e);
      if (stderr.includes('Requested format is not available')) continue;
      if (stderr.includes('Video unavailable')) continue;
      if (stderr.includes('Sign in to confirm') || stderr.includes('sign in to confirm')) continue;
      if (stderr.includes('HTTP Error 429')) continue;
      if (stderr.includes('challenge')) continue;
      if (stderr.includes('Only images are available')) continue;
      if (stderr.includes('n challenge solving failed')) continue;
      if (e && e.timedOut) continue;
    }
  }

  if (lastError) {
    const stderr = lastError && typeof lastError.stderr === 'string' ? lastError.stderr.trim() : '';
    if (stderr.includes('Sign in to confirm') || stderr.includes('sign in to confirm')) {
      throw new Error('YouTube 下载失败：所有策略均被拦截。请尝试：1) 在 Chrome 中登录 YouTube 后重试；2) 使用 VPN/代理；3) 上传本地视频文件');
    }
    throw lastError;
  }

  throw new Error('yt-dlp download failed: all strategies exhausted');
}

module.exports = {
  ensureYtDlp,
  runYtDlp,
  resolveHttpProxy,
  buildStrategies,
  parsePercent,
  YT_DLP_BIN_PATH,
};
