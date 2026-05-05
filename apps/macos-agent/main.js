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
let started = false;
let logBuffer = [];
let logFilePath = '';
let mediaServer = null;
let mediaBaseUrl = '';
let mediaReady = null;
let lastWebUrl = '';
let embeddedWebProc = null;
let embeddedWebUrl = '';
let authToken = '';

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

async function resolveHttpProxy() {
  const envProxy = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || '').trim();
  if (envProxy) return envProxy;
  if (await isLocalPortOpen(7890)) return 'http://127.0.0.1:7890';
  return '';
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
  while (Date.now() - startedAt < 20_000) {
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
  let exited = false;
  let exitCode = null;
  let exitSignal = null;
  const recentErr = [];
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
      if (s) {
        recentErr.push(s);
        if (recentErr.length > 30) recentErr.splice(0, recentErr.length - 30);
        appendLog(s);
      }
    });
  } catch {}
  embeddedWebProc.on('exit', (code, signal) => {
    exited = true;
    exitCode = code;
    exitSignal = signal;
    embeddedWebProc = null;
    embeddedWebUrl = '';
  });
  try {
    await waitForHttpOk(`${embeddedWebUrl}/`);
    return embeddedWebUrl;
  } catch (e) {
    if (exited) {
      throw new Error(`Embedded Web UI crashed (code=${exitCode}, signal=${exitSignal})\n` + recentErr.slice(-10).join('\n'));
    }
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
    serverUrl: 'https://projects-pi-kohl.vercel.app',
    agentId: 'agent-mac-1',
    secret: '',
    authToken: '',
    authState: '',
    createdAt: nowIso(),
  };
}

async function loadConfig() {
  const p = configPath();
  try {
    const raw = await fs.readFile(p, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    const cfg = { ...defaultConfig(), ...parsed };
    if (!cfg.agentId) cfg.agentId = `agent-${randomUUID()}`;
    authToken = cfg.authToken || '';
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
  authToken = cfg.authToken || '';
}

async function openAuthFlow() {
  const cfg = await loadConfig();
  const state = randomUUID();
  const next = { ...cfg, authState: state, updatedAt: nowIso() };
  await saveConfig(next);
  const redirectUri = 'vidshorter://auth/callback';
  const u = new URL('/login', cfg.serverUrl);
  u.searchParams.set('desktop', '1');
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  await shell.openExternal(u.toString());
}

async function handleDeepLink(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl || ''));
  } catch {
    return;
  }
  if (u.protocol !== 'vidshorter:') return;

  // Handle auth/complete redirect
  if (u.pathname === '/auth/complete' || u.pathname === '//auth/complete' || rawUrl === 'vidshorter://auth/complete') {
    // Just focus the window and reload
    if (webWindow && !webWindow.isDestroyed()) {
      webWindow.focus();
      await webWindow.webContents.reload();
    } else {
      await ensureWebWindow();
    }
    return;
  }

  // Handle auth/callback with token
  const token = u.searchParams.get('access_token') || '';
  const state = u.searchParams.get('state') || '';
  if (!token) return;

  const cfg = await loadConfig();
  if (cfg.authState && state && cfg.authState !== state) return;
  const next = { ...cfg, authToken: token, authState: '', updatedAt: nowIso() };
  await saveConfig(next);
  
  try {
    if (webWindow && !webWindow.isDestroyed()) {
      await webWindow.webContents.reload();
    }
  } catch {}
  
  try {
    await dialog.showMessageBox({
      type: 'info',
      message: 'Signed in successfully',
      buttons: ['OK'],
    });
  } catch {}
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
          let tmpExtra = [];
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
            const ff = ffmpegPath();
            const isBilibili = videoUrl.includes('bilibili.com') || videoUrl.includes('b23.tv');
            if (isBilibili) {
              await runYtDlp([
                '--no-playlist',
                '--quiet',
                '--no-warnings',
                '-f', 'bestvideo[vcodec^=avc1]+bestaudio/best',
                ...(ff ? ['--ffmpeg-location', ff] : []),
                '--remux-video', 'mp4',
                '-o', tmpl,
                videoUrl,
              ]);
              const files = (() => {
                try {
                  return fsSync.readdirSync(downloadDir)
                    .map((n) => path.join(downloadDir, n))
                    .filter((p) => path.basename(p).startsWith(id + '.'))
                    .filter((p) => !p.endsWith('.part') && !p.endsWith('.ytdl'));
                } catch {
                  return [];
                }
              })();
              const downloaded = files.find((p) => p.endsWith('.mp4')) || files[0] || '';
              if (!downloaded || !fsSync.existsSync(downloaded)) throw new Error('Video download failed');
              const trimmed = path.join(downloadDir, `${id}-trim.mp4`);
              if (!ff) throw new Error('ffmpeg not available');
              const trimArgs = [
                '-y',
                '-i', downloaded,
                '-t', '600',
                '-map', '0:v:0',
                '-map', '0:a:0?',
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '18',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',
                trimmed,
              ];
              await execFileAsync(ff, trimArgs, { timeout: 10 * 60_000 });
              tmpPath = trimmed;
              tmpExtra = [downloaded];
              inputPath = trimmed;
            } else {
              await runYtDlp([
                '--no-playlist',
                '--quiet',
                '--no-warnings',
                '-f', 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                ...(ff ? ['--ffmpeg-location', ff] : []),
                '--remux-video', 'mp4',
                '--download-sections', '*0-600',
                '-o', tmpl,
                videoUrl,
              ]);
              tmpPath = path.join(downloadDir, `${id}.mp4`);
              inputPath = tmpPath;
            }
            write({ stage: 'frames_extracted', progress: 20, message: 'Video ready' });
          } else {
            write({ stage: 'extract_frames', progress: 5, message: 'Downloading video...' });
            const id = `${Date.now()}-${randomUUID()}`;
            const out = path.join(downloadDir, `${id}.mp4`);
            const ff = ffmpegPath();
            await runYtDlp([
              '--no-playlist',
              '--quiet',
              '--no-warnings',
              '-f', 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
              ...(ff ? ['--ffmpeg-location', ff] : []),
              '--remux-video', 'mp4',
              '--download-sections', '*0-600',
              '-o', out,
              videoUrl,
            ]);
            inputPath = out;
            tmpPath = out;
            write({ stage: 'frames_extracted', progress: 20, message: 'Video ready' });
          }

          if (!fsSync.existsSync(inputPath)) throw new Error('Video file not found: ' + inputPath);

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
          for (const p of tmpExtra) await fs.unlink(p).catch(() => {});
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

async function generateLocalHighlightsFromUrl(url) {
  startMediaServer();
  if (mediaReady) await mediaReady;
  const u = new URL(url);
  const name = path.basename(u.pathname);
  const uploadPath = path.join('/tmp/video-cache/uploads', name);
  return await generateHighlightsFromPath({
    inputPath: uploadPath,
    outDir: '/tmp/generated-clips',
    clipBaseUrl: mediaBaseUrl,
  });
}

async function importLocalVideoFile(filePath) {
  startMediaServer();
  if (mediaReady) await mediaReady;
  const uploadDir = '/tmp/video-cache/uploads';
  try { fsSync.mkdirSync(uploadDir, { recursive: true }); } catch {}
  const safeName = path.basename(String(filePath || 'video.mp4')).replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'video.mp4';
  const storedName = `${Date.now()}-${randomUUID()}-${safeName}`;
  const dest = path.join(uploadDir, storedName);
  await fs.copyFile(filePath, dest);
  return `${mediaBaseUrl}/api/local-video/${storedName}`;
}

async function setUrlAndAnalyze(url) {
  if (!webWindow || webWindow.isDestroyed()) return;
  const script = `
(() => {
  const targetUrl = ${JSON.stringify(String(url || ''))};
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  const urlInput = Array.from(document.querySelectorAll('input')).find((el) => {
    try { return (el.getAttribute('placeholder') || '').toLowerCase().includes('paste a video url'); } catch { return false; }
  });
  if (!urlInput || !setter) return false;
  setter.call(urlInput, targetUrl);
  urlInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  urlInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  try {
    const btns = Array.from(document.querySelectorAll('button'));
    const analyze = btns.find((b) => (b.textContent || '').trim().toLowerCase() === 'analyze');
    if (analyze && !analyze.disabled) analyze.click();
  } catch {}
  return true;
})();
  `;
  await webWindow.webContents.executeJavaScript(script, true).catch(() => {});
}

function startAgent(cfg) {
  return;
}

function normalizeServerUrl(url) {
  const raw = String(url || '').trim();
  return raw ? raw.replace(/\/$/, '') : '';
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
    url = `data:text/html,${encodeURIComponent(`<html><head><meta charset="utf-8"><title>VidShorter Agent</title><style>body{font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;margin:40px}h1{font-size:22px}pre{white-space:pre-wrap;background:#f7f7f7;padding:12px;border-radius:10px}</style></head><body><h1>Failed to start embedded Web UI</h1><pre>${msg}</pre><p>Open menu → Copy Logs to share details.</p></body></html>`)}`;
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
  webWindow.webContents.on('did-fail-load', async (_evt, code, desc, validatedUrl) => {
    try {
      const html = `<html><head><meta charset="utf-8"><title>VidShorter Agent</title><style>body{font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;margin:40px}h1{font-size:22px}pre{white-space:pre-wrap;background:#f7f7f7;padding:12px;border-radius:10px}</style></head><body><h1>Page failed to load</h1><pre>code: ${code}\n${String(desc || '')}\nurl: ${String(validatedUrl || '')}</pre><p>Open menu → Copy Logs to share details.</p></body></html>`;
      await webWindow?.loadURL(`data:text/html,${encodeURIComponent(html)}`);
    } catch {}
  });
  webWindow.webContents.session.webRequest.onBeforeRequest((details, cb) => {
    try {
      const u = new URL(details.url);
      if (u.pathname === '/api/video-proxy') {
        const target = u.searchParams.get('url') || '';
        if (target.startsWith('http://127.0.0.1') || target.startsWith('http://localhost')) {
          cb({ redirectURL: target });
          return;
        }
      }
    } catch {}
    cb({});
  });
  await webWindow.loadURL(url);
  webWindow.webContents.on('before-input-event', (event, input) => {
    try {
      const isDown = input && input.type === 'keyDown';
      const key = String(input && input.key ? input.key : '').toLowerCase();
      const isPaste = isDown && key === 'v' && (input.meta || input.control);
      if (!isPaste) return;
      const text = (clipboard.readText() || '').trim();
      if (!text) return;
      event.preventDefault();
      webWindow.webContents.executeJavaScript(`
(() => {
  const value = ${JSON.stringify(text)};
  const inputs = Array.from(document.querySelectorAll('input'));
  const el = inputs.find((x) => {
    try { return (x.getAttribute('placeholder') || '').toLowerCase().includes('paste a video url'); } catch { return false; }
  }) || document.activeElement;
  if (!el || !(el instanceof HTMLInputElement)) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  return true;
})();
      `, true).catch(() => {});
    } catch {}
  });
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
  console.log('Failed to inject desktop API:', e);
}
          `,
          true,
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
          const next = baseUrl + '/api/process-video';
          return origFetch(next, init);
        }
      } catch {}
      return origFetch(input, init);
    };
  }

  const getEls = () => {
    const fileInput = document.querySelector('input[type="file"][accept^="video"]') || document.querySelector('input[type="file"]');
    const urlInput = Array.from(document.querySelectorAll('input')).find((el) => {
      try { return (el.getAttribute('placeholder') || '').toLowerCase().includes('paste a video url'); } catch { return false; }
    });
    const btns = Array.from(document.querySelectorAll('button'));
    const analyze = btns.find((b) => {
      const t = (b.textContent || '').trim().toLowerCase();
      return t === 'analyze' || t.startsWith('processing');
    });
    return { fileInput, urlInput, analyze };
  };

  const setReactInputValue = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  };

  const installLocalUploadAnalyze = () => {
    if (window.__vidshorterLocalUploadAnalyzeAttached) return;
    window.__vidshorterLocalUploadAnalyzeAttached = true;

    const hideAuthErrors = () => {
      const needles = ['authentication required', 'please sign in again'];
      for (const el of Array.from(document.querySelectorAll('div,section,article'))) {
        const text = (el.textContent || '').toLowerCase();
        if (needles.every((n) => text.includes(n))) {
          try { el.style.display = 'none'; } catch {}
        }
      }
    };

    const ensurePanel = () => {
      let panel = document.getElementById('vidshorter-local-results');
      if (panel) return panel;
      panel = document.createElement('section');
      panel.id = 'vidshorter-local-results';
      panel.style.cssText = 'margin:24px auto;max-width:1120px;border:1px solid #e5e5e5;border-radius:12px;padding:20px;background:#fff;color:#111;font-family:inherit;box-shadow:0 8px 30px rgba(0,0,0,.06)';
      const uploadBox = document.querySelector('input[type="file"]')?.closest('div');
      const host = uploadBox && uploadBox.parentElement ? uploadBox.parentElement : document.body;
      if (uploadBox && uploadBox.nextSibling) host.insertBefore(panel, uploadBox.nextSibling);
      else host.appendChild(panel);
      return panel;
    };

    const renderStatus = (message, progress) => {
      hideAuthErrors();
      const panel = ensurePanel();
      const pct = Math.max(0, Math.min(100, Number(progress || 0)));
      panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px"><strong style="font-size:20px">Local highlight generation</strong><span style="color:#666">' + pct + '%</span></div>'
        + '<div style="height:8px;background:#eee;border-radius:999px;overflow:hidden;margin-bottom:12px"><div style="height:100%;width:' + pct + '%;background:#111;transition:width .2s"></div></div>'
        + '<div style="color:#666">' + String(message || 'Processing...') + '</div>';
    };

    const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    const renderClips = (clips) => {
      hideAuthErrors();
      const panel = ensurePanel();
      const items = (clips || []).map((clip, index) => {
        const title = escapeHtml(clip.title || ('Highlight ' + (index + 1)));
        const url = escapeHtml(clip.videoUrl || '');
        const duration = Math.round(Number(clip.duration || 0));
        return '<div style="border:1px solid #eee;border-radius:10px;padding:14px;margin-top:14px;background:#fafafa">'
          + '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px"><strong>' + title + '</strong><span style="color:#666;font-size:13px">' + duration + 's</span></div>'
          + '<video controls src="' + url + '" style="width:100%;max-height:420px;border-radius:8px;background:#000"></video>'
          + '<div style="margin-top:10px"><a href="' + url + '" download style="display:inline-flex;align-items:center;border-radius:8px;background:#111;color:#fff;text-decoration:none;padding:9px 14px">Download MP4</a></div>'
          + '</div>';
      }).join('');
      panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><strong style="font-size:22px">Highlights ready</strong><span style="color:#0a7f35">Completed</span></div>'
        + (items || '<div style="color:#666;margin-top:12px">No clips returned.</div>');
    };

    const readLocalProcessStream = async (res) => {
      const reader = res.body && res.body.getReader ? res.body.getReader() : null;
      if (!reader) throw new Error('No response stream from local processor');
      const decoder = new TextDecoder();
      let buf = '';
      let clips = [];
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        const lines = buf.split('\\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const evt = JSON.parse(line.slice(6));
          renderStatus(evt.message || evt.stage || 'Processing...', evt.progress || 0);
          if (evt.data && evt.data.clip) clips.push(evt.data.clip);
          if (evt.data && Array.isArray(evt.data.clips)) clips = evt.data.clips;
          if (evt.data && evt.data.error) throw new Error(evt.message || 'Local processing failed');
        }
      }
      return clips;
    };

    const runLocalSelectedFile = async (file, btn) => {
      if (window.__vidshorterLocalUploadAnalyzeBusy) return;
      window.__vidshorterLocalUploadAnalyzeBusy = true;
      try {
        if (btn) btn.disabled = true;
        renderStatus('Uploading selected video to the local Mac client...', 2);
        console.log('[LocalUpload] Uploading selected file to desktop media server:', file.name);
        const uploadRes = await fetch(baseUrl + '/api/upload', {
          method: 'POST',
          headers: {
            'x-filename': encodeURIComponent(file.name || 'video.mp4'),
            'content-type': file.type || 'application/octet-stream',
          },
          body: file,
        });
        if (!uploadRes.ok) throw new Error('Local upload failed: ' + uploadRes.status);
        const uploaded = await uploadRes.json();
        if (!uploaded || !uploaded.url) throw new Error('Local upload did not return a video URL');

        renderStatus('Generating highlight clips locally...', 8);
        const processRes = await fetch(baseUrl + '/api/process-video', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ videoUrl: uploaded.url, sourceType: 'upload', userId: 'local-mac-user' }),
        });
        if (!processRes.ok) throw new Error('Local processor failed: ' + processRes.status);
        const clips = await readLocalProcessStream(processRes);
        if (!clips.length) throw new Error('Local processor did not return any clips');
        renderClips(clips);
        try {
          const { urlInput } = getEls();
          if (urlInput) setReactInputValue(urlInput, uploaded.url);
        } catch {}
      } catch (e) {
        const message = e && e.message ? e.message : String(e);
        console.log('[LocalUpload] Error:', message);
        renderStatus(message, 100);
      } finally {
        if (btn) btn.disabled = false;
        window.__vidshorterLocalUploadAnalyzeBusy = false;
      }
    };

    const maybeIntercept = (evt) => {
      try {
        const btn = evt.target && evt.target.closest ? evt.target.closest('button') : null;
        if (!btn) return;
        const text = (btn.textContent || '').trim().toLowerCase();
        if (text !== 'analyze') return;
        const { fileInput } = getEls();
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (!file) return;
        evt.preventDefault();
        evt.stopPropagation();
        if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
        runLocalSelectedFile(file, btn);
      } catch (e) {
        console.log('[LocalUpload] Intercept error:', e && e.message ? e.message : e);
      }
    };

    document.addEventListener('pointerdown', maybeIntercept, true);
    document.addEventListener('click', maybeIntercept, true);
  };

  const attach = () => {
    const { urlInput } = getEls();
    if (!urlInput) return false;

    installLocalUploadAnalyze();

    try {
      if (urlInput && urlInput.dataset.desktopPasteAttached !== '1') {
        urlInput.dataset.desktopPasteAttached = '1';
        urlInput.readOnly = false;
        urlInput.disabled = false;
        try { urlInput.setAttribute('inputmode', 'url'); } catch {}
      }
    } catch {}

    try {
      if (!window.__vidshorterPasteHackAttached) {
        window.__vidshorterPasteHackAttached = true;

        const findUrlInput = () => {
          const byPlaceholder = Array.from(document.querySelectorAll('input')).find((el) => {
            try {
              const ph = el.getAttribute('placeholder') || '';
              return ph.toLowerCase().includes('paste a video url') || ph.toLowerCase().includes('video url');
            } catch { return false; }
          });
          if (byPlaceholder) return byPlaceholder;

          const byName = Array.from(document.querySelectorAll('input')).find((el) => {
            try {
              const id = (el.id || '').toLowerCase();
              const name = (el.name || '').toLowerCase();
              return id.includes('url') || id.includes('video') || name.includes('url') || name.includes('video');
            } catch { return false; }
          });
          if (byName) return byName;

          return Array.from(document.querySelectorAll('input[type="text"]'))[0] || null;
        };

        window.addEventListener('paste', (evt) => {
          const u = findUrlInput();
          if (!u) {
            console.log('[PasteHack] URL input not found');
            return;
          }

          const text = evt.clipboardData?.getData('text/plain') || '';
          if (!text) {
            console.log('[PasteHack] No text in clipboard');
            return;
          }

          console.log('[PasteHack] Pasting:', text.slice(0, 80));

          try {
            const focused = document.activeElement;
            if (focused === u || focused === document.body || focused === document.documentElement) {
              u.focus();
              const result = document.execCommand('insertText', false, text);
              console.log('[PasteHack] execCommand insertText result:', result);
              if (result) {
                evt.preventDefault();
                evt.stopPropagation();
                return;
              }
            }
          } catch (e) {
            console.log('[PasteHack] execCommand error:', e);
          }

          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) {
            try {
              setter.call(u, text);
              u.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              u.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              u.focus();
              evt.preventDefault();
              evt.stopPropagation();
              console.log('[PasteHack] Set via setter');
              return;
            } catch {}
          }

          try {
            u.value = text;
            u.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            u.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            u.focus();
            evt.preventDefault();
            evt.stopPropagation();
            console.log('[PasteHack] Set via direct value');
          } catch (e) {
            console.log('[PasteHack] Error:', e);
          }
        }, true);

        window.addEventListener('keydown', (evt) => {
          const isPasteKey = (evt.key === 'v' || evt.key === 'V') && (evt.metaKey || evt.ctrlKey);
          if (!isPasteKey) return;

          const u = findUrlInput();
          if (!u) return;

          evt.preventDefault();
          evt.stopPropagation();

          const text = navigator.clipboard?.readText?.() || (window.clipboardData?.getData('text/plain') || '');
          if (!text) return;

          console.log('[PasteHack] Ctrl+V pasting:', text.slice(0, 80));

          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) {
            try {
              setter.call(u, text);
              u.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              u.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              u.focus();
              console.log('[PasteHack] Ctrl+V via setter');
            } catch {}
          }
        }, true);
      }
    } catch (e) {
      console.log('[PasteHack] Attach error:', e);
    }

    return true;
  };

  const ensure = () => { try { attach(); } catch {} };
  ensure();
  try {
    const obs = new MutationObserver(() => ensure());
    obs.observe(document.documentElement || document.body, { subtree: true, childList: true, attributes: true });
  } catch {}
})();
          `,
          true,
        );
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
    config: { serverUrl: cfg.serverUrl, agentId: cfg.agentId, secret: cfg.secret ? '***' : '' },
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
  authToken = cfg.authToken || '';
  return { token: authToken };
});

ipcMain.handle('clearAuthToken', async () => {
  const cfg = await loadConfig();
  await saveConfig({ ...cfg, authToken: '', authState: '' });
  authToken = '';
  return { ok: true };
});

ipcMain.handle('save-config', async (_evt, payload) => {
  const cfg = await loadConfig();
  const next = {
    ...cfg,
    serverUrl: String(payload?.serverUrl || cfg.serverUrl).trim(),
    agentId: String(payload?.agentId || cfg.agentId).trim(),
    secret: typeof payload?.secret === 'string' ? payload.secret : cfg.secret,
    updatedAt: nowIso(),
  };
  await saveConfig(next);
  return { ok: true };
});

ipcMain.handle('start', async () => {
  return { ok: false };
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

ipcMain.handle('local-generate-highlights', async (_evt, payload) => {
  const url = payload && typeof payload.url === 'string' ? payload.url : '';
  if (!url) throw new Error('Missing url');
  return await generateLocalHighlightsFromUrl(url);
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
              const config = await loadConfig();
              await saveConfig({ ...config, authToken: '', authState: '' });
              authToken = '';
              if (webWindow && !webWindow.isDestroyed()) {
                await webWindow.webContents.reload();
              }
              try {
                await dialog.showMessageBox({
                  type: 'info',
                  message: 'Signed out successfully',
                  buttons: ['OK'],
                });
              } catch {}
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
  handleDeepLink(url).catch(() => {});
});

app.on('ready', async () => {
  patchConsole();
  await ensureLogFile();
  await loadConfig();
  try { app.setAsDefaultProtocolClient('vidshorter'); } catch {}
  startMediaServer();
  await applyMenu();
  await ensureWebWindow();
  
  const cfg = await loadConfig();
  if (!cfg.authToken) {
    try {
      const result = await dialog.showMessageBox({
        type: 'info',
        message: 'Welcome to VidShorter Agent',
        detail: 'To use the application, please sign in with your VidShorter account.',
        buttons: ['Sign In', 'Continue Without Signing In'],
        defaultId: 0,
      });
      if (result.response === 0) {
        await openAuthFlow();
      }
    } catch {}
  }
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
