const electron = require('electron');
const { app, BrowserWindow, ipcMain, shell, Menu, clipboard, dialog } = electron;
const utilityProcess = electron.utilityProcess;
const { randomUUID } = require('node:crypto');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
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
let currentAuthState = '';

// 服务器URL
const SERVER_URL = 'https://vidshorterai.vercel.app';

process.on('uncaughtException', (err) => {
  try { appendLog('[UncaughtException] ' + (err && err.stack ? err.stack : String(err))); } catch {}
});

process.on('unhandledRejection', (err) => {
  try { appendLog('[UnhandledRejection] ' + (err && err.stack ? err.stack : String(err))); } catch {}
});

function nowIso() {
  return new Date().toISOString();
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

async function pickFreePort() {
  return await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      s.close(() => {
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('Failed to pick port'));
      });
    });
    s.on('error', reject);
  });
}

async function waitForHttpOk(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20000) {
    try {
      const r = await fetch(url, { method: 'GET' });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Embedded Web UI failed to start');
}

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
  const port = await pickFreePort();
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
  };
  if (utilityProcess && typeof utilityProcess.fork === 'function') {
    embeddedWebProc = utilityProcess.fork(entryJs, [], {
      cwd: dir,
      env: baseEnv,
      stdio: 'pipe',
    });
  } else {
    embeddedWebProc = spawn(process.execPath, [entryJs], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...baseEnv, ELECTRON_RUN_AS_NODE: '1' },
    });
  }
  try {
    embeddedWebProc.stdout?.on('data', (b) => appendLog(String(b).trim()));
    embeddedWebProc.stderr?.on('data', (b) => {
      const s = String(b).trim();
      if (s) appendLog(s);
    });
  } catch {}
  embeddedWebProc.on('exit', () => {
    embeddedWebProc = null;
    embeddedWebUrl = '';
  });
  try {
    await waitForHttpOk(`${embeddedWebUrl}/`);
    return embeddedWebUrl;
  } catch (e) {
    throw e;
  }
}

try {
  app.setName('VidShorter Agent');
} catch {}

function appendLog(line) {
  const item = `[${nowIso()}] ${line}`;
  logBuffer.push(item);
  if (logBuffer.length > 500) logBuffer = logBuffer.slice(-500);
  if (logFilePath) {
    fs.appendFile(logFilePath, `${item}\n`).catch(() => {});
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', item);
  }
}

function patchConsole() {
  const orig = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  console.log = (...args) => {
    orig.log(...args);
    appendLog(args.map(String).join(' '));
  };
  console.warn = (...args) => {
    orig.warn(...args);
    appendLog(args.map(String).join(' '));
  };
  console.error = (...args) => {
    orig.error(...args);
    appendLog(args.map(String).join(' '));
  };
}

async function ensureLogFile() {
  const dir = app.getPath('logs');
  const logDir = path.join(dir, 'VidShorterAgent');
  await fs.mkdir(logDir, { recursive: true });
  logFilePath = path.join(logDir, 'app.log');
}

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function defaultConfig() {
  return {
    authToken: '',
    createdAt: nowIso(),
  };
}

async function loadConfig() {
  const p = configPath();
  try {
    const raw = await fs.readFile(p, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    const cfg = { ...defaultConfig(), ...parsed };
    return cfg;
  } catch {
    const cfg = defaultConfig();
    await saveConfig(cfg);
    return cfg;
  }
}

async function saveConfig(cfg) {
  const p = configPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(cfg, null, 2), 'utf8');
}

async function openAuthFlow() {
  currentAuthState = randomUUID();
  const redirectUri = 'vidshorter://auth/callback';
  const url = new URL('/login', SERVER_URL);
  url.searchParams.set('desktop', '1');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', currentAuthState);
  await shell.openExternal(url.toString());
}

async function handleDeepLink(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || ''));
  } catch {
    return;
  }
  
  if (url.protocol !== 'vidshorter:') return;
  
  const pathname = url.pathname || url.pathname.replace(/^\/\//, '/');
  
  // 处理 auth/complete
  if (pathname === '/auth/complete' || pathname === '//auth/complete' || rawUrl === 'vidshorter://auth/complete') {
    if (webWindow && !webWindow.isDestroyed()) {
      webWindow.focus();
      // 强制重新加载
      webWindow.webContents.reload();
    } else {
      await ensureWebWindow();
    }
    return;
  }
  
  // 处理 auth/callback
  if (pathname === '/auth/callback' || pathname === '//auth/callback' || rawUrl.includes('vidshorter://auth/callback')) {
    const token = url.searchParams.get('access_token') || '';
    const state = url.searchParams.get('state') || '';
    
    // 验证 state
    if (currentAuthState && state && currentAuthState !== state) {
      appendLog('Invalid state parameter');
      return;
    }
    
    if (token) {
      appendLog('Received auth token, saving...');
      
      // 保存token
      const cfg = await loadConfig();
      cfg.authToken = token;
      await saveConfig(cfg);
      
      appendLog('Token saved. Refreshing webview...');
    } else {
      appendLog('No token in deeplink, refreshing webview anyway...');
    }
    
    // 聚焦并刷新
    if (webWindow && !webWindow.isDestroyed()) {
      webWindow.focus();
      webWindow.webContents.reload();
    } else {
      await ensureWebWindow();
    }
    
    // 显示成功提示
    try {
      await dialog.showMessageBox({
        type: 'info',
        message: 'Signed in successfully!',
        buttons: ['OK'],
      });
    } catch {}
    
    return;
  }
}

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
          const raw = Buffer.concat(chunks).toString('utf8');
          const body = JSON.parse(raw || '{}');
          const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl.trim() : '';
          if (!videoUrl) throw new Error('Missing videoUrl');

          const baseUrl = String(ctx?.baseUrl || '').trim();
          const baseDir = ctx?.dirs?.baseDir || '/tmp/generated-clips';
          const uploadDir = ctx?.dirs?.uploadDir || '/tmp/video-cache/uploads';
          const downloadDir = ctx?.dirs?.downloadDir || '/tmp/video-cache/downloads';

          write({ stage: 'init', progress: 0, message: 'Initializing...' });

          let inputPath = '';
          let tmpPath = '';
          if (baseUrl && videoUrl.startsWith(baseUrl + '/api/local-video/')) {
            const u = new URL(videoUrl);
            const name = path.basename(u.pathname);
            inputPath = path.join(uploadDir, name);
          } else if (videoUrl.startsWith('http://127.0.0.1') || videoUrl.startsWith('http://localhost')) {
            const u = new URL(videoUrl);
            const name = path.basename(u.pathname);
            inputPath = path.join(uploadDir, name);
          } else if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') || videoUrl.includes('bilibili.com') || videoUrl.includes('b23.tv')) {
            write({ stage: 'extract_frames', progress: 5, message: 'Downloading video...' });
            const id = `${Date.now()}-${randomUUID()}`;
            const tmpl = path.join(downloadDir, `${id}.%(ext)s`);
            await runYtDlp([
              '--no-playlist',
              '--quiet',
              '--no-warnings',
              '-f', 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
              '--remux-video', 'mp4',
              '--download-sections', '*0-600',
              '-o', tmpl,
              videoUrl,
            ]);
            tmpPath = path.join(downloadDir, `${id}.mp4`);
            inputPath = tmpPath;
          }

          if (!inputPath || !fsSync.existsSync(inputPath)) {
            throw new Error('Video file not found');
          }

          write({ stage: 'ai_analysis', progress: 30, message: 'AI analyzing video content...' });

          const result = await generateHighlightsFromPath({
            inputPath,
            outDir: baseDir,
            clipBaseUrl: baseUrl,
            onProgress: (p) => write(p),
          });

          write({ stage: 'complete', progress: 100, message: 'Processing complete!', data: { clips: result.clips, done: true } });
          res.end();
          if (tmpPath) await fs.unlink(tmpPath).catch(() => {});
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          write({ stage: 'error', progress: 100, message: msg, data: { error: true } });
          res.end();
        }
      })();
    },
  });

  mediaServer = ms.server;
  mediaReady = ms.ready;
  mediaReady.then(() => { mediaBaseUrl = ms.getBaseUrl(); }).catch(() => {});
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
    const msg = e && e.message ? e.message : String(e);
    url = `data:text/html,${encodeURIComponent(`<html><head><meta charset="utf-8"><title>VidShorter Agent</title><style>body{font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;margin:40px}h1{font-size:22px}</style></head><body><h1>Failed to start embedded Web UI</h1><pre>${msg}</pre></body></html>`)}`;
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
  
  webWindow.webContents.on('did-finish-load', () => {
    (async () => {
      try {
        startMediaServer();
        const base = mediaBaseUrl;
        if (!base) return;
        
        await webWindow.webContents.executeJavaScript(
          `
try {
  window.vidshorterDesktop = true;
  window.api = {
    getAuthToken: async () => {
      return await window.electronAPI.getAuthToken();
    },
    clearAuthToken: async () => {
      return await window.electronAPI.clearAuthToken();
    },
    requestAuth: async () => {
      return await window.electronAPI.openAuth();
    }
  };
} catch (e) {
  console.error('Failed to inject desktop API:', e);
}
          `,
          true
        ).catch(() => {});
        
        await webWindow.webContents.executeJavaScript(
          `
(() => {
  const baseUrl = ${JSON.stringify(base)};
  if (!window.__vidshorterFetchPatched) {
    window.__vidshorterFetchPatched = true;
    const origFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      try {
        const u = typeof input === 'string' ? input : (input && typeof input.url === 'string' ? input.url : '');
        if (u === '/api/process-video' || u.endsWith('/api/process-video') || /\\/api\\/process-video(\\?|$)/.test(u)) {
          return origFetch(baseUrl + '/api/process-video', init);
        }
      } catch {}
      return origFetch(input, init);
    };
  }
})();
          `,
          true
        ).catch(() => {});
        
      } catch {}
    })();
  });
  
  webWindow.on('closed', () => {
    webWindow = null;
  });
}

function ensureSettingsWindow() {
  mainWindow = new BrowserWindow({
    width: 560,
    height: 560,
    resizable: true,
    title: 'VidShorter Agent Settings',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('get-config', async () => {
  const cfg = await loadConfig();
  return {
    config: { authToken: cfg.authToken ? '***' : '' },
    logs: logBuffer.slice(-200),
    logFilePath,
  };
});

ipcMain.handle('open-auth', async () => {
  await openAuthFlow();
  return { ok: true };
});

ipcMain.handle('getAuthToken', async () => {
  const cfg = await loadConfig();
  return { token: cfg.authToken || '' };
});

ipcMain.handle('clearAuthToken', async () => {
  const cfg = await loadConfig();
  cfg.authToken = '';
  await saveConfig(cfg);
  if (webWindow && !webWindow.isDestroyed()) {
    webWindow.webContents.reload();
  }
  return { ok: true };
});

ipcMain.handle('open-logs', async () => {
  if (!logFilePath) return { ok: false };
  await shell.showItemInFolder(logFilePath);
  return { ok: true };
});

ipcMain.handle('copy-logs', async () => {
  try {
    if (logFilePath) {
      const raw = await fs.readFile(logFilePath, 'utf8').catch(() => '');
      const lines = raw.split('\n').slice(-500).join('\n');
      clipboard.writeText(lines);
      return { ok: true };
    }
    const lines = logBuffer.slice(-500).join('\n');
    clipboard.writeText(lines);
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle('get-app-version', async () => ({ version: APP_VERSION }));

ipcMain.handle('open-web-ui', async () => {
  await ensureWebWindow();
  return { ok: true };
});

ipcMain.handle('get-media-base-url', async () => {
  startMediaServer();
  if (mediaReady) await mediaReady;
  return { baseUrl: mediaBaseUrl };
});

ipcMain.handle('open-settings', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    return { ok: true };
  }
  ensureSettingsWindow();
  return { ok: true };
});

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
          label: 'Settings',
          click: async () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
            else ensureSettingsWindow();
          },
        },
        {
          label: isLoggedIn ? 'Sign Out' : 'Sign In',
          click: async () => {
            if (isLoggedIn) {
              const cfg = await loadConfig();
              cfg.authToken = '';
              await saveConfig(cfg);
              if (webWindow && !webWindow.isDestroyed()) {
                webWindow.webContents.reload();
              }
              await applyMenu();
            } else {
              await openAuthFlow();
            }
          },
        },
        {
          label: 'Open Logs',
          click: async () => {
            if (logFilePath) await shell.showItemInFolder(logFilePath);
          },
        },
        {
          label: 'Copy Logs',
          click: async () => {
            try {
              if (logFilePath) {
                const raw = await fs.readFile(logFilePath, 'utf8').catch(() => '');
                const lines = raw.split('\n').slice(-500).join('\n');
                clipboard.writeText(lines);
              } else {
                clipboard.writeText(logBuffer.slice(-500).join('\n'));
              }
            } catch {}
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('open-url', (event, url) => {
  try { event.preventDefault(); } catch {}
  appendLog(`Received deeplink: ${url}`);
  handleDeepLink(url).catch((err) => {
    appendLog(`Deeplink handler error: ${err}`);
  });
});

app.on('ready', async () => {
  patchConsole();
  await ensureLogFile();
  await loadConfig();
  
  try { app.setAsDefaultProtocolClient('vidshorter'); } catch {}
  
  startMediaServer();
  await applyMenu();
  await ensureWebWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { embeddedWebProc?.kill('SIGKILL'); } catch {}
  embeddedWebProc = null;
  embeddedWebUrl = '';
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    ensureWebWindow();
  }
});
