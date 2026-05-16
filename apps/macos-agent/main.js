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

const SERVER_URL = 'https://vidshorterai.vercel.app';

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
        const email = body.email || '';
        const userId = body.userId || body.user_id || '';
        const name = body.name || '';

        appendLog(`[AuthCallback] Token: ${!!token}, Email: ${email}`);

        if (token) {
          const cfg = await loadConfig();
          cfg.authToken = token;
          cfg.authEmail = email;
          cfg.authUserId = userId;
          cfg.authName = name;
          await saveConfig(cfg);

          if (webWindow && !webWindow.isDestroyed()) {
            appendLog('[AuthCallback] Injecting token into webWindow...');
            await injectAuthToWebWindow(token, email, userId, name);
          } else {
            appendLog('[AuthCallback] No webWindow, will inject on next load');
          }

          await applyMenu();

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
      const email = url.searchParams.get('email') || '';
      const userId = url.searchParams.get('userId') || url.searchParams.get('user_id') || '';
      const name = url.searchParams.get('name') || '';

      appendLog(`[AuthCallback] Redirect login: token=${!!token}, email=${email}`);

      if (token) {
        const cfg = await loadConfig();
        cfg.authToken = token;
        cfg.authEmail = email;
        cfg.authUserId = userId;
        cfg.authName = name;
        await saveConfig(cfg);

        if (webWindow && !webWindow.isDestroyed()) {
          await injectAuthToWebWindow(token, email, userId, name);
        }

        await applyMenu();
      }

      res.writeHead(200, { 'Content-Type': 'text/html', ...corsHeaders });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>VidShorter Agent</title>
        <style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}
        .card{text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
        .icon{font-size:48px;margin-bottom:16px}h1{color:#16a34a;margin:0 0 8px}p{color:#666;margin:0}</style></head>
        <body><div class="card"><div class="icon">✅</div><h1>Login Successful!</h1>
        <p>You can close this tab and return to VidShorter Agent.</p></div></body></html>`);
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

// ==================== INJECT AUTH ====================
async function injectAuthToWebWindow(token, email, userId, name) {
  appendLog(`[Inject] Starting... token=${!!token}`);

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

      localStorage.setItem('vidshorter_access_token', ${JSON.stringify(token)});
      console.log('[DEBUG-INJECT] localStorage set');

      window.__vidshorterDesktopToken = ${JSON.stringify(token)};
      window.__vidshorterDesktopEmail = ${JSON.stringify(email)};
      window.__vidshorterDesktopUserId = ${JSON.stringify(userId)};
      window.__vidshorterDesktopName = ${JSON.stringify(name)};
      console.log('[DEBUG-INJECT] Window vars set');

      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          var event = new CustomEvent('vidshorter-desktop-login', {
            detail: {
              token: ${JSON.stringify(token)},
              email: ${JSON.stringify(email)},
              userId: ${JSON.stringify(userId)},
              name: ${JSON.stringify(name)}
            }
          });
          window.dispatchEvent(event);
          window.dispatchEvent(new Event('vidshorter-auth-change'));
          console.log('[DEBUG-INJECT] Events dispatched, attempt ' + (i+1));
        }, i * 200);
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
  if (!url || !url.startsWith('vidshorter://')) return null;
  const httpUrl = url.replace('vidshorter://', 'http://fakehost/');
  try {
    const parsed = new URL(httpUrl);
    return {
      token: parsed.searchParams.get('token') || parsed.searchParams.get('access_token') || '',
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
    const cfg = await loadConfig();
    cfg.authToken = parsed.token;
    cfg.authEmail = parsed.email;
    cfg.authUserId = parsed.userId;
    cfg.authName = parsed.name;
    await saveConfig(cfg);
  }

  if (webWindow && !webWindow.isDestroyed()) {
    await injectAuthToWebWindow(parsed.token, parsed.email, parsed.userId, parsed.name);
  } else {
    await ensureWebWindow();
  }

  await applyMenu();
}

// ==================== WEB WINDOW ====================
async function ensureEmbeddedWeb() {
  if (embeddedWebUrl) return embeddedWebUrl;

  const candidates = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'embedded-web'),
    path.join(__dirname, 'embedded-web'),
  ];
  const dir = candidates.find((p) => p && fsSync.existsSync(path.join(p, 'server.js'))) || '';
  const entryJs = dir && fsSync.existsSync(path.join(dir, 'bootstrap.js'))
    ? path.join(dir, 'bootstrap.js')
    : (dir ? path.join(dir, 'server.js') : '');

  if (!entryJs) throw new Error('Embedded Web UI not found');

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

  const baseEnv = {
    ...process.env,
    NODE_PATH: [
      path.join(process.resourcesPath || '', 'app.asar', 'node_modules'),
      path.join(__dirname, 'node_modules'),
    ].filter((p) => p && fsSync.existsSync(p)).join(':'),
    NODE_ENV: 'production',
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    NEXT_PUBLIC_DESKTOP: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    SERVER_URL: 'https://vidshorterai.vercel.app',
    NEXT_PUBLIC_SERVER_URL: 'https://vidshorterai.vercel.app',
    NEXT_PUBLIC_SUPABASE_URL: 'https://wpbzrvrwqjqdjjqfgfpa.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwYnpycnJ3cWpxZGpxcGZnZnBhIiwiaWF0IjoxNzc0Njc0ODcyLCJleHAiOjIwNDAyNTA4NzJ9.AIeP9T9H8E2C8vJ1D0K1D0J1D0K1D0J1D0K1D0J1D0K1D0J1D0K1D0J1D0K1D0K1D0K1D0J1D0K1D0K1D',
    COZE_SUPABASE_URL: 'https://wpbzrvrwqjqdjjqfgfpa.supabase.co',
    COZE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwYnpycnJ3cWpxZGpxcGZnZnBhIiwiaWF0IjoxNzc0Njc0ODcyLCJleHAiOjIwNDAyNTA4NzJ9.AIeP9T9H8E2C8vJ1D0K1D0J1D0K1D0J1D0K1D0J1D0K1D0J1D0K1D0J1D0K1D0K1D0K1D0J1D0K1D0K1D',
  };

  if (utilityProcess && typeof utilityProcess.fork === 'function') {
    embeddedWebProc = utilityProcess.fork(entryJs, [], { cwd: dir, env: baseEnv, stdio: 'pipe' });
  } else {
    embeddedWebProc = spawn(process.execPath, [entryJs], {
      cwd: dir, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...baseEnv, ELECTRON_RUN_AS_NODE: '1' },
    });
  }

  embeddedWebProc.stdout?.on('data', (b) => appendLog('[Embedded Web] ' + String(b).trim()));
  embeddedWebProc.stderr?.on('data', (b) => {
    const s = String(b).trim();
    if (s) appendLog('[Embedded Web] ' + s);
  });
  embeddedWebProc.on('exit', () => {
    embeddedWebProc = null;
    embeddedWebUrl = '';
  });

  const start = Date.now();
  while (Date.now() - start < 30000) {
    try {
      const resp = await fetch(`${embeddedWebUrl}/`, { method: 'GET' });
      if (resp.ok) {
        appendLog('[Embedded] Ready at ' + embeddedWebUrl);
        return embeddedWebUrl;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Embedded Web UI timeout');
}

async function ensureWebWindow() {
  if (webWindow && !webWindow.isDestroyed()) {
    webWindow.show();
    return;
  }

  let url = '';
  try {
    url = await ensureEmbeddedWeb();
  } catch (e) {
    appendLog(`[WebWindow] Failed: ${e}`);
    url = `data:text/html,<html><body><pre>${String(e)}</pre></body></html>`;
  }

  webWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    resizable: true,
    title: 'VidShorter Agent',
    webPreferences: {
      preload: path.join(__dirname, 'preload-web.js'),
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  await webWindow.loadURL(url);

  webWindow.webContents.on('did-finish-load', async () => {
    appendLog('[WebWindow] did-finish-load');
    try {
      await webWindow.webContents.executeJavaScript(`
        (function() {
          window.vidshorterDesktop = true;
          if (!window.api) window.api = {};
          window.api.getAuthToken = async function() {
            if (window.electronAPI && window.electronAPI.getAuthToken) return await window.electronAPI.getAuthToken();
            return window.__vidshorterDesktopToken || '';
          };
          window.api.clearAuthToken = async function() {
            if (window.electronAPI && window.electronAPI.clearAuthToken) return await window.electronAPI.clearAuthToken();
          };
          window.api.requestAuth = async function() {
            if (window.electronAPI && window.electronAPI.openAuth) return await window.electronAPI.openAuth();
          };
        })();
      `, true);

      const cfg = await loadConfig();
      if (cfg.authToken) {
        appendLog('[WebWindow] Injecting saved token...');
        await injectAuthToWebWindow(cfg.authToken, cfg.authEmail, cfg.authUserId, cfg.authName);
      }

      startMediaServer();
      const base = mediaBaseUrl;
      if (base) {
        await webWindow.webContents.executeJavaScript(`
          (function() {
            const baseUrl = ${JSON.stringify(base)};
            if (!window.__vidshorterFetchPatched) {
              window.__vidshorterFetchPatched = true;
              const origFetch = window.fetch.bind(window);
              window.fetch = function(input, init) {
                const u = typeof input === 'string' ? input : (input && input.url ? input.url : '');
                if (u && u.includes('/api/process-video')) return origFetch(baseUrl + '/api/process-video', init);
                return origFetch(input, init);
              };
            }
          })();
        `, true);
      }
    } catch (e) {
      appendLog(`[WebWindow] did-finish-load ERROR: ${e}`);
    }
  });

  webWindow.on('closed', () => {
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
            const id = `${Date.now()}-${randomUUID()}`;
            const tmpl = path.join(ctx.dirs.downloadDir, `${id}.%(ext)s`);
            await runYtDlp(['--no-playlist', '--quiet', '--no-warnings', '-f', 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', '--remux-video', 'mp4', '-o', tmpl, videoUrl]);
            tmpPath = path.join(ctx.dirs.downloadDir, `${id}.mp4`);
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
    title: 'VidShorter Agent - Debug',
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
          label: 'Debug Console',
          click: () => ensureSettingsWindow(),
        },
        {
          label: isLoggedIn ? 'Sign Out' : 'Sign In',
          click: async () => {
            if (isLoggedIn) {
              const cfg = await loadConfig();
              cfg.authToken = '';
              cfg.authEmail = '';
              cfg.authName = '';
              cfg.authUserId = '';
              await saveConfig(cfg);
              if (webWindow && !webWindow.isDestroyed()) {
                await webWindow.webContents.executeJavaScript(`
                  localStorage.removeItem('vidshorter_access_token');
                  window.__vidshorterDesktopToken = '';
                  window.dispatchEvent(new Event('vidshorter-auth-change'));
                `, true).catch(() => {});
                webWindow.webContents.reload();
              }
            } else {
              await shell.openExternal(SERVER_URL + '/login?from=desktop');
            }
            await applyMenu();
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
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
  };
});

ipcMain.handle('getAuthToken', async () => {
  const cfg = await loadConfig();
  return { token: cfg.authToken || '' };
});

ipcMain.handle('clearAuthToken', async () => {
  const cfg = await loadConfig();
  cfg.authToken = '';
  cfg.authEmail = '';
  cfg.authUserId = '';
  cfg.authName = '';
  await saveConfig(cfg);
  if (webWindow && !webWindow.isDestroyed()) {
    await webWindow.webContents.executeJavaScript(`
      localStorage.removeItem('vidshorter_access_token');
      window.__vidshorterDesktopToken = '';
      window.dispatchEvent(new Event('vidshorter-auth-change'));
    `, true).catch(() => {});
    webWindow.webContents.reload();
  }
  return { ok: true };
});

ipcMain.handle('openAuth', async () => {
  const callbackUrl = authCallbackPort ? `http://127.0.0.1:${authCallbackPort}` : '';
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
  await handleDeepLink('vidshorter://login-success?token=test_token_12345&email=test%40example.com&userId=user_123&name=Test%20User');
  return 'OK';
});

ipcMain.handle('open-web-login', async () => {
  const callbackUrl = authCallbackPort ? `http://127.0.0.1:${authCallbackPort}` : '';
  const loginUrl = new URL('/login', SERVER_URL);
  loginUrl.searchParams.set('from', 'desktop');
  if (callbackUrl) {
    loginUrl.searchParams.set('callback', callbackUrl);
  }
  await shell.openExternal(loginUrl.toString());
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

  const logDir = path.join(app.getPath('logs'), 'VidShorterAgent');
  await fs.mkdir(logDir, { recursive: true });
  logFilePath = path.join(logDir, 'app.log');

  try {
    app.setAsDefaultProtocolClient('vidshorter');
    appendLog('[App] Protocol registered: vidshorter://');
  } catch (e) {
    appendLog(`[App] Protocol register ERROR: ${e}`);
  }

  startAuthCallbackServer();
  startMediaServer();
  await applyMenu();
  ensureSettingsWindow();
  setTimeout(ensureWebWindow, 500);
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
