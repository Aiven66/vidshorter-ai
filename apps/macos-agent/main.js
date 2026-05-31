const electron = require('electron');
const { app, BrowserWindow, ipcMain, shell, Menu, clipboard, dialog } = electron;
const utilityProcess = electron.utilityProcess;
const { randomUUID } = require('node:crypto');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const { generateHighlightsFromPath, ffmpegPath } = require('./local-highlights');
const { runYtDlp } = require('./ytdlp');
const { createMediaServer } = require('./media-server');
const { t, currentLocale, setLocale, detectLocale } = require('./i18n');
const APP_VERSION = require('./package.json').version;

let mainWindow = null;
let webWindow = null;
let logBuffer = [];
let logFilePath = '';
let mediaServer = null;
let mediaBaseUrl = '';
let mediaReady = null;
let embeddedWebProc = null;
let embeddedWebUrl = '';
let authCallbackServer = null;
let authCallbackPort = 0;

let lastInjectedToken = '';

const SERVER_URL = 'https://www.clipopai.com';

// ==================== LOGGING ====================
function nowIso() {
  return new Date().toISOString();
}

function appendLog(msg) {
  const fullMsg = `[${nowIso()}] ${msg}`;
  logBuffer.push(fullMsg);
  if (logBuffer.length > 500) logBuffer = logBuffer.slice(-500);
  if (logFilePath) {
    fs.appendFile(logFilePath, fullMsg + '\n').catch(() => {});
  }
  console.log(fullMsg);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', msg);
  }
}

process.on('uncaughtException', (err) => {
  appendLog('[ERROR] UncaughtException: ' + (err && err.stack ? err.stack : String(err)));
});

process.on('unhandledRejection', (err) => {
  appendLog('[ERROR] UnhandledRejection: ' + (err && err.stack ? err.stack : String(err)));
});

// ==================== VIDEO DOWNLOAD ====================
async function downloadVideo(videoUrl, downloadDir, onProgress) {
  appendLog(`[Download] Starting download for: ${videoUrl}`);

  const id = `${Date.now()}-${randomUUID()}`;
  const tmpl = path.join(downloadDir, `${id}.%(ext)s`);
  const ffmpegBin = ffmpegPath();

  const formats = [
    { name: 'adaptive-720p', spec: 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best', remux: true },
    { name: 'single-file-480p', spec: 'best[height<=480]/best', remux: true },
    { name: 'format18', spec: '18/best[ext=mp4]/best', remux: false },
  ];

  let lastError = null;
  for (const fmt of formats) {
    appendLog(`[Download] Trying format: ${fmt.name}`);
    try {
      const args = [
        '--no-playlist',
        '-f', fmt.spec,
      ];
      if (ffmpegBin) args.push('--ffmpeg-location', ffmpegBin);
      if (fmt.remux) args.push('--remux-video', 'mp4');
      args.push('-o', tmpl, videoUrl);

      await runYtDlp(args, {
        overallTimeoutMs: 8 * 60_000,
        strategyTimeoutMs: 75_000,
        cookieStrategyTimeoutMs: 45_000,
        onStrategy: (strategy) => appendLog(`[Download] yt-dlp strategy: ${strategy}`),
        onStrategyError: (strategy, err) => {
          const msg = err && err.message ? err.message : String(err);
          appendLog(`[Download] yt-dlp strategy failed (${strategy}): ${msg.slice(0, 240)}`);
        },
        onProgress: (pct, strategy) => {
          const safePct = Math.max(0, Math.min(100, pct));
          appendLog(`[Download] ${fmt.name}/${strategy}: ${safePct.toFixed(1)}%`);
          if (typeof onProgress === 'function') onProgress(safePct, fmt.name, strategy);
        },
      });

      let tmpPath = path.join(downloadDir, `${id}.mp4`);
      if (!fsSync.existsSync(tmpPath)) {
        const files = fsSync.readdirSync(downloadDir);
        const matching = files.find(f => f.startsWith(id + '.'));
        if (matching) tmpPath = path.join(downloadDir, matching);
      }
      if (fsSync.existsSync(tmpPath)) {
        appendLog(`[Download] Success with format "${fmt.name}": ${tmpPath}`);
        return tmpPath;
      }
      appendLog(`[Download] Format "${fmt.name}" produced no file, trying next`);
    } catch (err) {
      lastError = err;
      appendLog(`[Download] Format "${fmt.name}" failed: ${err && err.message ? err.message : String(err)}`);
    }
  }

  throw lastError || new Error('All download formats failed');
}

// ==================== CONFIG ====================
function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

async function loadConfig() {
  try {
    const raw = await fs.readFile(configPath(), 'utf-8');
    const cfg = JSON.parse(raw || '{}');
    return cfg;
  } catch (e) {
    return { authToken: '', authEmail: '', authUserId: '', authName: '' };
  }
}

async function saveConfig(cfg) {
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(cfg, null, 2), 'utf-8');
}

// ==================== AUTH CALLBACK SERVER ====================
function startAuthCallbackServer() {
  if (authCallbackServer) return;

  authCallbackServer = http.createServer(async (req, res) => {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Private-Network': 'true',
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${authCallbackPort}`);

    if (url.pathname === '/api/desktop-auth' && req.method === 'POST') {
      appendLog('[AuthCallback] Received POST /api/desktop-auth');
      try {
        const chunks = [];
        for await (const c of req) chunks.push(Buffer.from(c));
        const raw = Buffer.concat(chunks).toString('utf-8');
        const body = JSON.parse(raw || '{}');

        const token = body.token || body.access_token || '';
        const refreshToken = body.refreshToken || body.refresh_token || '';
        const email = body.email || '';
        const userId = body.userId || body.user_id || '';
        const name = body.name || '';

        appendLog(`[AuthCallback] Token: ${!!token}, RefreshToken: ${!!refreshToken}, Email: ${email}`);

        if (token) {
          await persistAndSyncAuth({ token, refreshToken, email, userId, name }, 'POST /api/desktop-auth');
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ ok: true, message: 'Token received' }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ ok: false, error: 'No token provided' }));
        }
      } catch (e) {
        appendLog(`[AuthCallback] Error: ${e}`);
        res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
      return;
    }

    if (url.pathname === '/api/desktop-auth' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({ ok: true, version: APP_VERSION }));
      return;
    }

    if (url.pathname === '/api/desktop-login-redirect' && req.method === 'GET') {
      appendLog('[AuthCallback] Received GET /api/desktop-login-redirect');
      const token = url.searchParams.get('token') || url.searchParams.get('access_token') || '';
      const refreshToken = url.searchParams.get('refreshToken') || url.searchParams.get('refresh_token') || '';
      const email = url.searchParams.get('email') || '';
      const userId = url.searchParams.get('userId') || url.searchParams.get('user_id') || '';
      const name = url.searchParams.get('name') || '';

      appendLog(`[AuthCallback] Redirect login: token=${!!token}, refreshToken=${!!refreshToken}, email=${email}`);

      if (token) {
        await persistAndSyncAuth({ token, refreshToken, email, userId, name }, 'GET /api/desktop-login-redirect');
      }

      res.writeHead(200, { 'Content-Type': 'text/html', ...corsHeaders });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Clipop Agent</title>
        <style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}
        .card{text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
        .icon{font-size:48px;margin-bottom:16px}h1{color:#16a34a;margin:0 0 8px}p{color:#666;margin:0}</style></head>
        <body><div class="card"><div class="icon">✅</div><h1>${t('auth.loginSuccess')}</h1>
        <p>${t('auth.closeTab')}</p></div></body></html>`);
      return;
    }

    res.writeHead(404, corsHeaders);
    res.end('Not found');
  });

  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => {
    authCallbackPort = s.address().port;
    s.close();
    authCallbackServer.listen(authCallbackPort, '127.0.0.1', () => {
      appendLog(`[AuthCallback] Server listening on http://127.0.0.1:${authCallbackPort}`);
    });
  });
}

function getAuthCallbackUrl() {
  return `http://127.0.0.1:${authCallbackPort}`;
}

async function waitForAuthCallbackUrl(timeoutMs = 1500) {
  if (!authCallbackServer) startAuthCallbackServer();
  const startedAt = Date.now();
  while (!authCallbackPort && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return authCallbackPort ? getAuthCallbackUrl() : '';
}

async function persistAndSyncAuth(payload, source) {
  const token = payload.token || '';
  const refreshToken = payload.refreshToken || '';
  const email = payload.email || '';
  const userId = payload.userId || '';
  const name = payload.name || '';

  appendLog(`[AuthSync] ${source}: token=${!!token}, refreshToken=${!!refreshToken}, email=${email}`);
  if (!token) return false;

  const cfg = await loadConfig();
  cfg.authToken = token;
  cfg.authRefreshToken = refreshToken;
  cfg.authEmail = email;
  cfg.authUserId = userId;
  cfg.authName = name;
  await saveConfig(cfg);

  if (!webWindow || webWindow.isDestroyed()) {
    appendLog(`[AuthSync] ${source}: opening webWindow for sync`);
    await ensureWebWindow();
  }

  if (webWindow && !webWindow.isDestroyed()) {
    lastInjectedToken = '';
    await injectAuthToWebWindow(token, email, userId, name, refreshToken, false);

    if (!webWindow.isDestroyed()) {
      webWindow.show();
      webWindow.focus();
      appendLog(`[AuthSync] ${source}: webWindow focused`);
    }

    setTimeout(() => {
      if (webWindow && !webWindow.isDestroyed()) {
        injectAuthToWebWindow(token, email, userId, name, refreshToken, false).catch((e) => {
          appendLog(`[AuthSync] ${source}: delayed inject failed: ${e}`);
        });
      }
    }, 1200);

    setTimeout(() => {
      if (webWindow && !webWindow.isDestroyed()) {
        appendLog(`[AuthSync] ${source}: reloading webWindow to finalize auth state`);
        try { webWindow.webContents.reload(); } catch (e) { appendLog(`[AuthSync] reload error: ${e}`); }
      }
    }, 2500);
  }

  await applyMenu();
  return true;
}

// ==================== INJECT AUTH ====================
async function injectAuthToWebWindow(token, email, userId, name, refreshToken, shouldReload) {
  appendLog(`[Inject] Starting... token=${!!token} refreshToken=${!!refreshToken} shouldReload=${!!shouldReload}`);

  if (!webWindow || webWindow.isDestroyed()) {
    appendLog('[Inject] No webWindow or destroyed');
    return;
  }

  if (!token) {
    appendLog('[Inject] No token to inject');
    return;
  }

  appendLog('[Inject] Executing JS in webWindow...');
  const code = `
    (function() {
      console.log('[DEBUG-INJECT] ======== INJECT START ========');
      console.log('[DEBUG-INJECT] Token length:', ${JSON.stringify(token.length)});
      console.log('[DEBUG-INJECT] Email:', ${JSON.stringify(email)});
      console.log('[DEBUG-INJECT] RefreshToken:', !!${JSON.stringify(refreshToken || '')});

      localStorage.setItem('clipop_access_token', ${JSON.stringify(token)});
      if (${JSON.stringify(refreshToken || '')}) {
        localStorage.setItem('clipop_refresh_token', ${JSON.stringify(refreshToken || '')});
      }
      console.log('[DEBUG-INJECT] localStorage set');

      window.__clipopDesktopToken = ${JSON.stringify(token)};
      window.__clipopDesktopRefreshToken = ${JSON.stringify(refreshToken || '')};
      window.__clipopDesktopEmail = ${JSON.stringify(email)};
      window.__clipopDesktopUserId = ${JSON.stringify(userId)};
      window.__clipopDesktopName = ${JSON.stringify(name)};
      console.log('[DEBUG-INJECT] Window vars set');

      var _rt = ${JSON.stringify(refreshToken || '')};
      var _at = ${JSON.stringify(token)};
      var _email = ${JSON.stringify(email || '')};
      var _userId = ${JSON.stringify(userId || '')};
      var _name = ${JSON.stringify(name || '')};

      function trySetSession() {
        if (window.__supabaseClient && _rt && _at) {
          console.log('[DEBUG-INJECT] Calling supabase.auth.setSession...');
          window.__supabaseClient.auth.setSession({
            access_token: _at,
            refresh_token: _rt
          }).then(function(r) {
            console.log('[DEBUG-INJECT] setSession result:', !!r.data.session);
            window.dispatchEvent(new Event('clipop-auth-change'));
          }).catch(function(e) {
            console.log('[DEBUG-INJECT] setSession error:', e.message);
          });
        } else if (_rt && _at) {
          setTimeout(trySetSession, 500);
        }
      }
      trySetSession();

      for (var i = 0; i < 15; i++) {
        setTimeout(function() {
          var event = new CustomEvent('clipop-desktop-login', {
            detail: {
              token: _at,
              refreshToken: _rt,
              email: _email,
              userId: _userId,
              name: _name
            }
          });
          window.dispatchEvent(event);
          window.dispatchEvent(new Event('clipop-auth-change'));
        }, i * 500);
      }

      if (${shouldReload ? 'true' : 'false'}) {
        setTimeout(function() {
          console.log('[DEBUG-INJECT] Final reload to ensure UI update');
          window.location.reload();
        }, 5000);
      }

      console.log('[DEBUG-INJECT] ======== INJECT DONE ========');
      return 'OK';
    })();
  `;

  try {
    const result = await webWindow.webContents.executeJavaScript(code, true);
    appendLog(`[Inject] executeJavaScript returned: ${result}`);
  } catch (e) {
    appendLog(`[Inject] executeJavaScript ERROR: ${e}`);
  }

  appendLog('[Inject] Done');
}

// ==================== DEEP LINK ====================
function parseDeepLink(url) {
  if (!url || !url.startsWith('clipop://')) return null;
  const httpUrl = url.replace('clipop://', 'http://fakehost/');
  try {
    const parsed = new URL(httpUrl);
    return {
      token: parsed.searchParams.get('token') || parsed.searchParams.get('access_token') || '',
      refreshToken: parsed.searchParams.get('refreshToken') || parsed.searchParams.get('refresh_token') || '',
      email: parsed.searchParams.get('email') || '',
      userId: parsed.searchParams.get('userId') || parsed.searchParams.get('user_id') || '',
      name: parsed.searchParams.get('name') || '',
    };
  } catch {
    return null;
  }
}

async function handleDeepLink(rawUrl) {
  appendLog('========================================');
  appendLog(`[DeepLink] RECEIVED: ${rawUrl}`);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('deepLinkReceived', { url: rawUrl });
  }

  const parsed = parseDeepLink(rawUrl);
  if (!parsed) {
    appendLog('[DeepLink] Parse failed');
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('deepLinkReceived', {
      url: rawUrl, token: parsed.token, email: parsed.email, userId: parsed.userId, name: parsed.name
    });
  }

  if (parsed.token) {
    await persistAndSyncAuth(parsed, 'clipop:// deep link');
  } else if (!webWindow || webWindow.isDestroyed()) {
    await ensureWebWindow();
  }
}

// ==================== WEB WINDOW ====================
async function ensureEmbeddedWeb() {
  if (embeddedWebUrl) return embeddedWebUrl;

  const candidates = [
    path.join(process.resourcesPath || '', 'embedded-web'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'embedded-web'),
    path.join(__dirname, 'embedded-web'),
  ];
  const dir = candidates.find((p) => p && fsSync.existsSync(path.join(p, 'server.js'))) || '';
  const entryJs = dir && fsSync.existsSync(path.join(dir, 'bootstrap.js'))
    ? path.join(dir, 'bootstrap.js')
    : (dir ? path.join(dir, 'server.js') : '');

  if (!entryJs) {
    appendLog('[Embedded] server.js not found in any candidate directory');
    appendLog('[Embedded] Candidates checked: ' + candidates.join(', '));
    throw new Error('Embedded Web UI not found');
  }

  const hasNext = dir && fsSync.existsSync(path.join(dir, '.next'));
  const hasNodeModules = dir && fsSync.existsSync(path.join(dir, 'node_modules'));
  if (!hasNext || !hasNodeModules) {
    appendLog(`[Embedded] WARNING: Missing .next=${hasNext} node_modules=${hasNodeModules}`);
  }

  appendLog(`[Embedded] Using dir: ${dir}`);
  appendLog(`[Embedded] Entry: ${entryJs}`);

  const port = await (async () => {
    const s = net.createServer();
    return new Promise((resolve, reject) => {
      s.listen(0, '127.0.0.1', () => {
        const addr = s.address();
        s.close(() => {
          if (addr && typeof addr === 'object') resolve(addr.port);
          else reject(new Error('Failed to pick port'));
        });
      });
      s.on('error', reject);
    });
  })();

  embeddedWebUrl = `http://127.0.0.1:${port}`;

  const nodePathCandidates = [
    path.join(dir, 'node_modules'),
    path.join(process.resourcesPath || '', 'embedded-web', 'node_modules'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'embedded-web', 'node_modules'),
    path.join(process.resourcesPath || '', 'app.asar', 'node_modules'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules'),
    path.join(__dirname, 'node_modules'),
  ].filter((p) => p && fsSync.existsSync(p));

  const baseEnv = {
    ...process.env,
    NODE_PATH: nodePathCandidates.join(':'),
    NODE_ENV: 'production',
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    NEXT_PUBLIC_DESKTOP: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    SERVER_URL,
    NEXT_PUBLIC_SERVER_URL: SERVER_URL,
    NEXT_PUBLIC_SUPABASE_URL: 'https://wpbzrvrwqjqdjjqfgfpa.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwYnpycnJ3cWpxZGpxcGZnZnBhIiwiaWF0IjoxNzc0Njc0ODcyLCJleHAiOjIwNDAyNTA4NzJ9.AIeP9T9H8E2C8vJ1D0K1D0J1D0K1D0J1D0K1D0J1D0K1D0J1D0K1D0J1D0K1D0K1D0K1D0J1D0K1D0K1D',
    COZE_SUPABASE_URL: 'https://wpbzrvrwqjqdjjqfgfpa.supabase.co',
    COZE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwYnpycnJ3cWpxZGpxcGZnZnBhIiwiaWF0IjoxNzc0Njc0ODcyLCJleHAiOjIwNDAyNTA4NzJ9.AIeP9T9H8E2C8vJ1D0K1D0J1D0K1D0J1D0K1D0J1D0K1D0J1D0K1D0J1D0K1D0K1D0K1D0J1D0K1D0K1D',
  };

  appendLog(`[Embedded] NODE_PATH: ${baseEnv.NODE_PATH}`);

  try {
    if (utilityProcess && typeof utilityProcess.fork === 'function') {
      embeddedWebProc = utilityProcess.fork(entryJs, [], { cwd: dir, env: baseEnv, stdio: 'pipe' });
    } else {
      embeddedWebProc = spawn(process.execPath, [entryJs], {
        cwd: dir, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...baseEnv, ELECTRON_RUN_AS_NODE: '1' },
      });
    }
  } catch (forkErr) {
    appendLog(`[Embedded] Failed to fork process: ${forkErr}`);
    throw new Error(`Failed to start embedded web server: ${forkErr.message || String(forkErr)}`);
  }

  embeddedWebProc.stdout?.on('data', (b) => appendLog('[Embedded Web] ' + String(b).trim()));
  embeddedWebProc.stderr?.on('data', (b) => {
    const s = String(b).trim();
    if (s) appendLog('[Embedded Web] ' + s);
  });
  embeddedWebProc.on('exit', (code) => {
    appendLog(`[Embedded Web] Process exited with code ${code}`);
    embeddedWebProc = null;
    embeddedWebUrl = '';
  });

  const start = Date.now();
  while (Date.now() - start < 45000) {
    try {
      const resp = await fetch(`${embeddedWebUrl}/`, { method: 'GET' });
      if (resp.ok) {
        appendLog('[Embedded] Ready at ' + embeddedWebUrl);
        return embeddedWebUrl;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }

  if (embeddedWebProc) {
    try { embeddedWebProc.kill(); } catch {}
    embeddedWebProc = null;
  }
  embeddedWebUrl = '';
  throw new Error('Embedded Web UI timeout');
}

async function ensureWebWindow() {
  if (webWindow && !webWindow.isDestroyed()) {
    webWindow.show();
    return;
  }

  webWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    resizable: true,
    title: 'Clipop Agent',
    webPreferences: {
      preload: path.join(__dirname, 'preload-web.js'),
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
    show: false, // 先隐藏，准备好再显示
  });

  // 确保所有新窗口都用系统浏览器打开
  webWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 先显示加载界面，避免白屏
  await webWindow.loadURL(`data:text/html,<html><head><style>html,body{margin:0;padding:0;height:100%;background:#0f172a;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}h1{color:#fff;font-size:24px}p{color:#94a3b8;margin-top:10px 0 0}</style></head><body><div><h1>${t('loading.title')}</h1><p id="status">${t('loading.status')}</p></div></body></html>`);
  webWindow.show();

  // 后台启动嵌入式服务器
  let url = '';
  try {
    webWindow.webContents.executeJavaScript(`document.getElementById('status').textContent = '${t('loading.startingServer')}'`);
    url = await ensureEmbeddedWeb();
    webWindow.webContents.executeJavaScript(`document.getElementById('status').textContent = '${t('loading.loadingInterface')}'`);
    await webWindow.loadURL(url);
  } catch (e) {
    appendLog(`[WebWindow] Embedded server failed: ${e}, falling back to remote URL`);
    webWindow.webContents.executeJavaScript(`document.getElementById('status').textContent = '${t('loading.loadingInterface')}'`);
    try {
      await webWindow.loadURL(SERVER_URL);
      url = SERVER_URL;
    } catch (e2) {
      appendLog(`[WebWindow] Remote URL also failed: ${e2}`);
      url = `data:text/html,<html><body style="background:#0f172a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>Unable to Connect</h2><p style="color:#94a3b8">Embedded server and remote server are both unavailable.</p><p style="color:#64748b;font-size:12px;margin-top:20px">${String(e)}</p></div></body></html>`;
      webWindow.loadURL(url);
    }
  }

  webWindow.webContents.on('did-finish-load', async () => {
    appendLog('[WebWindow] did-finish-load');
    try {
      // 并行启动媒体服务器
      startMediaServer();
      
      // 注入桌面 API
      await webWindow.webContents.executeJavaScript(`
        (function() {
          const nativeDesktop = (window.clipopDesktop && typeof window.clipopDesktop === 'object')
            ? window.clipopDesktop
            : ((window.vidshorterDesktop && typeof window.vidshorterDesktop === 'object') ? window.vidshorterDesktop : {});
          const desktopBridge = {
            ...nativeDesktop,
            getAuthToken: async function() {
              if (nativeDesktop.getAuthToken) return await nativeDesktop.getAuthToken();
              if (window.electronAPI && window.electronAPI.getAuthToken) return await window.electronAPI.getAuthToken();
              return window.__clipopDesktopToken || '';
            },
            clearAuthToken: async function() {
              if (nativeDesktop.clearAuthToken) return await nativeDesktop.clearAuthToken();
              if (window.electronAPI && window.electronAPI.clearAuthToken) return await window.electronAPI.clearAuthToken();
            },
            openAuth: async function() {
              if (nativeDesktop.openAuth) return await nativeDesktop.openAuth();
              if (window.electronAPI && window.electronAPI.openAuth) return await window.electronAPI.openAuth();
            },
            openWebLogin: async function() {
              if (nativeDesktop.openWebLogin) return await nativeDesktop.openWebLogin();
              if (window.electronAPI && window.electronAPI.openWebLogin) return await window.electronAPI.openWebLogin();
            },
            openWebRegister: async function() {
              if (nativeDesktop.openWebRegister) return await nativeDesktop.openWebRegister();
              if (window.electronAPI && window.electronAPI.openWebRegister) return await window.electronAPI.openWebRegister();
            },
            getAuthCallbackUrl: async function() {
              if (nativeDesktop.getAuthCallbackUrl) return await nativeDesktop.getAuthCallbackUrl();
              if (window.electronAPI && window.electronAPI.getAuthCallbackUrl) return await window.electronAPI.getAuthCallbackUrl();
              return '';
            },
            getMediaBaseUrl: async function() {
              if (nativeDesktop.getMediaBaseUrl) return await nativeDesktop.getMediaBaseUrl();
              if (window.electronAPI && window.electronAPI.getMediaBaseUrl) return await window.electronAPI.getMediaBaseUrl();
              return localStorage.getItem('clipop_desktop_media_base') || '';
            },
          };
          try {
            if (!window.clipopDesktop || typeof window.clipopDesktop !== 'object') window.clipopDesktop = desktopBridge;
          } catch {}
          try {
            if (!window.vidshorterDesktop || typeof window.vidshorterDesktop !== 'object') window.vidshorterDesktop = desktopBridge;
          } catch {}
          if (!window.api) window.api = {};
          window.api.getAuthToken = async function() {
            return await desktopBridge.getAuthToken();
          };
          window.api.clearAuthToken = async function() {
            return await desktopBridge.clearAuthToken();
          };
          window.api.requestAuth = async function() {
            return await desktopBridge.openAuth();
          };
          window.agent = {
            openWebLogin: async function() {
              return await desktopBridge.openWebLogin();
            },
            openWebRegister: async function() {
              return await desktopBridge.openWebRegister();
            },
            getAuthCallbackUrl: async function() {
              return await desktopBridge.getAuthCallbackUrl();
            },
          };
        })();
      `, true);

      // 注入认证 token
      const cfg = await loadConfig();
      if (cfg.authToken && cfg.authToken !== lastInjectedToken) {
        appendLog('[WebWindow] Injecting saved token (changed)...');
        lastInjectedToken = cfg.authToken;
        await injectAuthToWebWindow(cfg.authToken, cfg.authEmail, cfg.authUserId, cfg.authName, cfg.authRefreshToken, false);
      }

      // 等待媒体服务器就绪
      if (mediaReady) await mediaReady;
      const base = mediaBaseUrl;
      if (base) {
        appendLog(`[WebWindow] Patching fetch for media server: ${base}`);
        await webWindow.webContents.executeJavaScript(`
          (function() {
            const baseUrl = ${JSON.stringify(base)};
            if (!window.__clipopFetchPatched) {
              window.__clipopFetchPatched = true;
              const origFetch = window.fetch.bind(window);
              window.fetch = function(input, init) {
                const u = typeof input === 'string' ? input : (input && input.url ? input.url : '');
                if (u && u.includes('/api/process-video')) return origFetch(baseUrl + '/api/process-video', init);
                return origFetch(input, init);
              };
            }
            localStorage.setItem('clipop_desktop_media_base', baseUrl);
            if (window.clipopDesktop && typeof window.clipopDesktop === 'object') {
              try { window.clipopDesktop.getMediaBaseUrl = async function() { return baseUrl; }; } catch {}
            }
            if (window.vidshorterDesktop && typeof window.vidshorterDesktop === 'object') {
              try { window.vidshorterDesktop.getMediaBaseUrl = async function() { return baseUrl; }; } catch {}
            }
          })();
        `, true);
      }
    } catch (e) {
      appendLog(`[WebWindow] did-finish-load ERROR: ${e}`);
    }
  });

  webWindow.on('focus', async () => {
    try {
      const cfg = await loadConfig();
      if (cfg.authToken && cfg.authToken !== lastInjectedToken && webWindow && !webWindow.isDestroyed()) {
        appendLog('[WebWindow] Focus event: new token detected, injecting...');
        lastInjectedToken = cfg.authToken;
        await injectAuthToWebWindow(cfg.authToken, cfg.authEmail, cfg.authUserId, cfg.authName, cfg.authRefreshToken, false);
      }
    } catch (e) {
      appendLog(`[WebWindow] Focus event error: ${e}`);
    }
  });

  const tokenPollInterval = setInterval(async () => {
    try {
      if (!webWindow || webWindow.isDestroyed()) {
        clearInterval(tokenPollInterval);
        return;
      }
      const cfg = await loadConfig();
      if (cfg.authToken && cfg.authToken !== lastInjectedToken) {
        appendLog('[WebWindow] Token poll: new token detected, injecting...');
        lastInjectedToken = cfg.authToken;
        await injectAuthToWebWindow(cfg.authToken, cfg.authEmail, cfg.authUserId, cfg.authName, cfg.authRefreshToken, false);
      }
    } catch {}
  }, 3000);

  webWindow.on('closed', () => {
    clearInterval(tokenPollInterval);
    webWindow = null;
  });
}

// ==================== MEDIA SERVER ====================
function startMediaServer() {
  if (mediaServer) return;
  const ms = createMediaServer({
    uiDir: path.join(__dirname, 'embedded-ui'),
    onProcessVideo: (req, res, ctx) => {
      const write = (obj) => {
        try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch {}
      };
      (async () => {
        try {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.flushHeaders?.();

          const chunks = [];
          for await (const c of req) chunks.push(Buffer.from(c));
          const raw = Buffer.concat(chunks).toString('utf-8');
          const body = JSON.parse(raw || '{}');
          const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl.trim() : '';
          if (!videoUrl) throw new Error('Missing videoUrl');

          write({ stage: 'init', progress: 0, message: 'Initializing...' });

          let inputPath = '';
          let tmpPath = '';
          if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') || videoUrl.includes('bilibili.com') || videoUrl.includes('b23.tv')) {
            write({ stage: 'extract_frames', progress: 5, message: 'Downloading video...' });
            tmpPath = await downloadVideo(videoUrl, ctx.dirs.downloadDir, (pct, formatName, strategyName) => {
              write({
                stage: 'extract_frames',
                progress: Math.max(6, Math.min(29, 6 + Math.floor(pct * 0.23))),
                message: `Downloading video... ${Math.floor(pct)}%`,
                data: { formatName, strategyName },
              });
            });
            inputPath = tmpPath;
          } else if (videoUrl.startsWith('http://127.0.0.1') || videoUrl.startsWith('http://localhost')) {
            const u = new URL(videoUrl);
            const name = path.basename(u.pathname);
            inputPath = path.join(ctx.dirs.uploadDir, name);
          }

          if (!inputPath || !fsSync.existsSync(inputPath)) throw new Error('Video file not found');

          write({ stage: 'ai_analysis', progress: 30, message: 'AI analyzing...' });
          const result = await generateHighlightsFromPath({ inputPath, outDir: ctx.dirs.baseDir, clipBaseUrl: ctx.baseUrl, onProgress: (p) => write(p) });
          write({ stage: 'complete', progress: 100, message: 'Done', data: { clips: result.clips, done: true } });
          res.end();
          if (tmpPath) await fs.unlink(tmpPath).catch(() => {});
        } catch (e) {
          write({ stage: 'error', progress: 100, message: e && e.message ? e.message : String(e), data: { error: true } });
          res.end();
        }
      })();
    },
  });
  mediaServer = ms.server;
  mediaReady = ms.ready;
  mediaReady.then(() => { mediaBaseUrl = ms.getBaseUrl(); });
}

// ==================== MAIN WINDOW (DEBUG) ====================
function ensureSettingsWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 680,
    height: 800,
    resizable: true,
    title: 'Clipop Agent - Debug',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ==================== MENU ====================
async function applyMenu() {
  const cfg = await loadConfig();
  const isLoggedIn = !!cfg.authToken;

  const template = [
    {
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: t('menu.debugConsole'),
          click: () => ensureSettingsWindow(),
        },
        {
          label: isLoggedIn ? t('menu.signOut') : t('menu.signIn'),
          click: async () => {
            if (isLoggedIn) {
              const cfg = await loadConfig();
              cfg.authToken = '';
              cfg.authRefreshToken = '';
              cfg.authEmail = '';
              cfg.authName = '';
              cfg.authUserId = '';
              await saveConfig(cfg);
              lastInjectedToken = '';
              if (webWindow && !webWindow.isDestroyed()) {
                await webWindow.webContents.executeJavaScript(`
                  localStorage.removeItem('clipop_access_token');
                  localStorage.removeItem('clipop_refresh_token');
                  localStorage.removeItem('clipop_demo_user');
                  window.__clipopDesktopToken = '';
                  window.__clipopDesktopRefreshToken = '';
                  window.__clipopDesktopEmail = '';
                  window.__clipopDesktopUserId = '';
                  window.__clipopDesktopName = '';
                  window.dispatchEvent(new Event('clipop-auth-change'));
                `, true).catch(() => {});
                webWindow.webContents.reload();
              }
            } else {
              const callbackUrl = await waitForAuthCallbackUrl();
              const loginUrl = new URL('/login', SERVER_URL);
              loginUrl.searchParams.set('from', 'desktop');
              if (callbackUrl) {
                loginUrl.searchParams.set('callback', callbackUrl);
              }
              await shell.openExternal(loginUrl.toString());
            }
            await applyMenu();
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ==================== IPC ====================
ipcMain.handle('get-config', async () => {
  const cfg = await loadConfig();
  return {
    config: { authToken: cfg.authToken, authEmail: cfg.authEmail, authUserId: cfg.authUserId, authName: cfg.authName },
    logs: logBuffer.slice(-200),
    logFilePath,
    authCallbackPort,
    locale: currentLocale,
    translations: {
      'debug.title': t('debug.title'),
      'debug.status': t('debug.status'),
      'debug.deepLinkHandler': t('debug.deepLinkHandler'),
      'debug.tokenSaved': t('debug.tokenSaved'),
      'debug.recentDeepLink': t('debug.recentDeepLink'),
      'debug.savedAuth': t('debug.savedAuth'),
      'debug.test': t('debug.test'),
      'debug.testDeepLink': t('debug.testDeepLink'),
      'debug.clearAuth': t('debug.clearAuth'),
      'debug.refresh': t('debug.refresh'),
      'debug.logs': t('debug.logs'),
      'debug.refreshing': t('debug.refreshing'),
      'debug.authCleared': t('debug.authCleared'),
      'debug.testingDeepLink': t('debug.testingDeepLink'),
      'debug.none': t('debug.none'),
    },
  };
});

ipcMain.handle('getAuthToken', async () => {
  const cfg = await loadConfig();
  return { token: cfg.authToken || '' };
});

ipcMain.handle('get-auth-callback-url', async () => {
  const callbackUrl = await waitForAuthCallbackUrl();
  return { callbackUrl };
});

ipcMain.handle('clearAuthToken', async () => {
  const cfg = await loadConfig();
  cfg.authToken = '';
  cfg.authRefreshToken = '';
  cfg.authEmail = '';
  cfg.authUserId = '';
  cfg.authName = '';
  await saveConfig(cfg);
  lastInjectedToken = '';
  if (webWindow && !webWindow.isDestroyed()) {
    await webWindow.webContents.executeJavaScript(`
      localStorage.removeItem('clipop_access_token');
      localStorage.removeItem('clipop_refresh_token');
      localStorage.removeItem('clipop_demo_user');
      window.__clipopDesktopToken = '';
      window.__clipopDesktopRefreshToken = '';
      window.__clipopDesktopEmail = '';
      window.__clipopDesktopUserId = '';
      window.__clipopDesktopName = '';
      window.dispatchEvent(new Event('clipop-auth-change'));
    `, true).catch(() => {});
    webWindow.webContents.reload();
  }
  return { ok: true };
});

ipcMain.handle('openAuth', async () => {
  const callbackUrl = await waitForAuthCallbackUrl();
  const loginUrl = new URL('/login', SERVER_URL);
  loginUrl.searchParams.set('from', 'desktop');
  if (callbackUrl) {
    loginUrl.searchParams.set('callback', callbackUrl);
  }
  appendLog(`[IPC] Opening auth: ${loginUrl.toString()}`);
  await shell.openExternal(loginUrl.toString());
  return { ok: true };
});

ipcMain.handle('testDeepLink', async () => {
  appendLog('[IPC] testDeepLink called');
  await handleDeepLink('clipop://login-success?token=test_token_12345&email=test%40example.com&userId=user_123&name=Test%20User');
  return 'OK';
});

ipcMain.handle('open-web-login', async () => {
  const callbackUrl = await waitForAuthCallbackUrl();
  const loginUrl = new URL('/login', SERVER_URL);
  loginUrl.searchParams.set('from', 'desktop');
  if (callbackUrl) {
    loginUrl.searchParams.set('callback', callbackUrl);
  }
  await shell.openExternal(loginUrl.toString());
  return { ok: true };
});

ipcMain.handle('open-web-register', async () => {
  const callbackUrl = await waitForAuthCallbackUrl();
  const registerUrl = new URL('/register', SERVER_URL);
  registerUrl.searchParams.set('from', 'desktop');
  if (callbackUrl) {
    registerUrl.searchParams.set('callback', callbackUrl);
  }
  await shell.openExternal(registerUrl.toString());
  return { ok: true };
});

ipcMain.handle('get-media-base-url', async () => {
  startMediaServer();
  if (mediaReady) await mediaReady;
  return { baseUrl: mediaBaseUrl };
});

// ==================== LIFECYCLE ====================
app.on('open-url', (event, url) => {
  appendLog(`[App] open-url: ${url}`);
  try { event.preventDefault(); } catch {}
  handleDeepLink(url).catch((err) => {
    appendLog(`[App] handleDeepLink ERROR: ${err}`);
  });
});

app.on('ready', async () => {
  appendLog(`[App] Ready (v${APP_VERSION})`);

  detectLocale();
  appendLog(`[App] Detected locale: ${currentLocale}`);

  const logDir = path.join(app.getPath('logs'), 'ClipopAgent');
  await fs.mkdir(logDir, { recursive: true });
  logFilePath = path.join(logDir, 'app.log');

  try {
    app.setAsDefaultProtocolClient('clipop');
    appendLog('[App] Protocol registered: clipop://');
  } catch (e) {
    appendLog(`[App] Protocol register ERROR: ${e}`);
  }

  startAuthCallbackServer();
  startMediaServer();
  await applyMenu();
  // 只打开主窗口，设置窗口按需打开
  setTimeout(ensureWebWindow, 100);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { embeddedWebProc?.kill('SIGKILL'); } catch {}
  embeddedWebProc = null;
  embeddedWebUrl = '';
  try { authCallbackServer?.close(); } catch {}
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    ensureWebWindow();
  }
});
