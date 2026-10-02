/**
 * Real Human Engine — Electron 主进程集成
 *
 * 职责:
 *   1. 本地 MuseTalk 1.5 + Kokoro 模型管理
 *   2. 真人主播底版视频列表 (打包 resources/hosts 或 dev 目录)
 *   3. 真人数字人视频生成 (RealHumanEngine + 进度事件推送到渲染进程)
 *   4. 产物通过 media-server /api/local-video/<name> 暴露给 web 预览
 *   5. 旧模型自动清理 (including obsolete BiSeNet, freeing disk space)
 *
 * IPC:
 *   realhuman:status            -> { modelsReady, models, hosts, generating }
 *   realhuman:download-models   -> { ok }   (进度经 'realhuman:event' 推送)
 *   realhuman:list-hosts        -> { hosts: [{id, gender, region, label, path}] }
 *   realhuman:generate          -> { ok, outPath, outUrl, durationMs }
 *   realhuman:cancel            -> { ok }
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { app, ipcMain } = require('electron');

const { LocalProductAvatarEngine, MUSETALK_FILES } = require('./local-product-avatar');

// ----------------------------------------------------------------------------
// config
// ----------------------------------------------------------------------------
const RELEASE_BASE = 'https://github.com/Aiven66/vidshorter-ai/releases/download/ai-realhuman-v2';

// Kokoro remains the offline voice engine. Lip-sync is now MuseTalk 1.5 on MPS;
// the old Wav2Lip ONNX files are removed during migration.
const MODEL_FILES = [
  { name: 'kokoro-int8-multi-lang-v1_1/model.int8.onnx', remote: 'kokoro-model.int8.onnx', size: 114_299_010 },
  { name: 'kokoro-int8-multi-lang-v1_1/voices.bin', remote: 'kokoro-voices.bin', size: 53_790_720 },
  {
    name: 'kokoro-int8-multi-lang-v1_1/espeak-ng-data.tar.bz2',
    remote: 'kokoro-espeak-ng-data.tar.bz2',
    size: 7_262_553,
    extract: true, // extracted into kokoro dir; tar deleted afterwards (status checks the dir)
  },
  { name: 'kokoro-int8-multi-lang-v1_1/lexicon-zh.txt', remote: 'kokoro-lexicon-zh.txt', size: 2_119_465 },
  { name: 'kokoro-int8-multi-lang-v1_1/lexicon-us-en.txt', remote: 'kokoro-lexicon-us-en.txt', size: 5_956_885 },
  { name: 'kokoro-int8-multi-lang-v1_1/tokens.txt', remote: 'kokoro-tokens.txt', size: 1_111 },
  { name: 'kokoro-int8-multi-lang-v1_1/phone-zh.fst', remote: 'kokoro-phone-zh.fst', size: 88_630 },
  { name: 'kokoro-int8-multi-lang-v1_1/number-zh.fst', remote: 'kokoro-number-zh.fst', size: 64_482 },
  { name: 'kokoro-int8-multi-lang-v1_1/date-zh.fst', remote: 'kokoro-date-zh.fst', size: 59_154 },
];

// legacy models — auto-deleted on startup to free user disk space.
// v0.9.41: wav2lip_256.onnx is legacy (dead audio encoder). NOTE wav2lip_gan_96.onnx
// was legacy in v2 but is THE main model again since v0.9.41 — must NOT be here.
// v0.9.52: generated-face restoration is obsolete. The HD retrieval pipeline
// uses only original host texture and frees the old 359MB CodeFormer model.
const LEGACY_MODEL_FILES = [
  'wav2lip_256.onnx', 'bisent_512.onnx', 'gfpgan_1.4.onnx',
  'wav2lip_gan_96.onnx', 'mel_wav2lip.onnx', 'yoloface_8n.onnx',
];

const HOST_CATALOG = [
  { id: 'm_asia', file: 'host_m_asia.mp4', gender: 'male', region: 'asia', label: '亚洲男主播' },
  { id: 'm_west', file: 'host_m_west.mp4', gender: 'male', region: 'west', label: '欧美男主播' },
  { id: 'm_mid', file: 'host_m_mid.mp4', gender: 'male', region: 'mid', label: '中东男主播' },
  { id: 'f_asia', file: 'host_f_asia.mp4', gender: 'female', region: 'asia', label: '亚洲女主播' },
  { id: 'f_west', file: 'host_f_west.mp4', gender: 'female', region: 'west', label: '欧美女主播' },
  { id: 'f_sea', file: 'host_f_sea.mp4', gender: 'female', region: 'sea', label: '东南亚女主播' },
];

function validatePlayableVideo(filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 100_000) {
    throw new Error('Generated Product Avatar video is empty or incomplete');
  }
  execFileSync(ffmpegPath(), [
    '-v', 'error', '-i', filePath,
    '-map', '0:v:0', '-map', '0:a:0',
    '-t', '1', '-f', 'null', '-',
  ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60_000 });
}

function log(...a) { console.log('[real-human-ipc]', ...a); }

// ----------------------------------------------------------------------------
// paths
// ----------------------------------------------------------------------------
function modelsDir() {
  return path.join(app.getPath('userData'), 'realhuman-models');
}

function outputsDir() {
  return path.join(app.getPath('userData'), 'generated-realhuman');
}

function localRuntimeDir() {
  return path.join(app.getPath('userData'), 'musetalk-local');
}

function localSourceDir() {
  const candidates = [
    path.join(process.resourcesPath || '', 'musetalk-runtime'),
    path.join(__dirname, 'vendor', 'musetalk-local'),
  ];
  for (const candidate of candidates) {
    try { if (fs.existsSync(candidate)) return candidate; } catch {}
  }
  return candidates[0];
}

/** packaged: resources/hosts ; dev: <app>/resources/hosts */
function hostsDir() {
  const cands = [
    path.join(process.resourcesPath || '', 'hosts'),
    path.join(__dirname, 'resources', 'hosts'),
  ];
  for (const c of cands) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return cands[0];
}

function ffmpegPath() {
  try {
    const inst = require('@ffmpeg-installer/ffmpeg');
    let p = inst.path;
    if (p.includes('.asar')) p = p.replace('app.asar', 'app.asar.unpacked');
    return p;
  } catch {
    return 'ffmpeg';
  }
}

// ----------------------------------------------------------------------------
// model management
// ----------------------------------------------------------------------------
function modelStatus() {
  const dir = modelsDir();
  let downloaded = 0;
  const models = MODEL_FILES.map((m) => {
    // entries with extract:true are checked via the extracted directory
    // (the tarball itself is deleted after extraction to save disk)
    const checkPath = m.extract ? path.join(dir, m.name.replace(/\.tar\.bz2$/, '')) : path.join(dir, m.name);
    let size = 0;
    let ok = false;
    try {
      const st = fs.statSync(checkPath);
      if (m.extract) ok = st.isDirectory();
      else { size = st.size; ok = size > m.size * 0.98; }
    } catch {}
    if (ok) downloaded++;
    return { name: m.name, size, expected: m.size, ready: ok };
  });
  return { models, downloaded, total: MODEL_FILES.length, ready: downloaded === MODEL_FILES.length, dir };
}

/** fetch with proxy support + redirect; resolves { status, headers, stream } */
function httpGet(urlStr, proxy, redirects = 5) {
  return new Promise((resolve, reject) => {
    let req;
    const opts = { timeout: 30000 };
    try {
      if (proxy && /^https?:/i.test(urlStr)) {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        opts.agent = new HttpsProxyAgent(proxy);
      }
      const mod = urlStr.startsWith('https') ? require('https') : require('http');
      req = mod.get(urlStr, opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          const next = new URL(res.headers.location, urlStr).toString();
          httpGet(next, proxy, redirects - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`)); return; }
        resolve(res);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(new Error('download timeout')); });
    } catch (e) { reject(e); }
  });
}

/** download one file with resume + progress */
async function downloadFile(urlStr, dest, { proxy, onProgress } = {}) {
  const tmp = dest + '.part';
  let start = 0;
  try { start = fs.statSync(tmp).size; } catch {}
  const totalExpected = start; // unknown yet; updated on headers
  let res;
  if (start > 0) {
    try {
      res = await new Promise((resolve, reject) => {
        let req;
        const opts = { timeout: 30000, headers: { Range: `bytes=${start}-` } };
        if (proxy && /^https?:/i.test(urlStr)) {
          const { HttpsProxyAgent } = require('https-proxy-agent');
          opts.agent = new HttpsProxyAgent(proxy);
        }
        const mod = urlStr.startsWith('https') ? require('https') : require('http');
        req = mod.get(urlStr, opts, (r) => {
          if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
            r.resume();
            const next = new URL(r.headers.location, urlStr).toString();
            downloadResume(next).then(resolve, reject);
            return;
          }
          if (r.statusCode !== 206) { r.resume(); reject(new Error('range not supported')); return; }
          resolve(r);
        });
        req.on('error', reject);
      });
    } catch { res = null; }
  }
  if (!res) {
    start = 0;
    try { fs.unlinkSync(tmp); } catch {}
    res = await httpGet(urlStr, proxy);
  }
  const total = start + (parseInt(res.headers['content-length'], 10) || 0);
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp, { flags: start > 0 ? 'a' : 'w' });
    let done = start;
    res.on('data', (c) => {
      done += c.length;
      out.write(c);
      if (onProgress && total) onProgress(done / total, done, total);
    });
    res.on('end', () => out.end(resolve));
    res.on('error', reject);
    out.on('error', reject);
  });
  fs.renameSync(tmp, dest);
}

async function downloadResume(urlStr) { return httpGet(urlStr, null); }

// ----------------------------------------------------------------------------
// system proxy detection (GUI-launched apps have no proxy env vars)
// ----------------------------------------------------------------------------
let sysProxyCache = { at: 0, val: '' };

function getSystemProxy() {
  const now = Date.now();
  if (now - sysProxyCache.at < 30000) return sysProxyCache.val;
  let val = '';
  try {
    const { execSync } = require('child_process');
    const out = execSync('scutil --proxy', { timeout: 3000, encoding: 'utf8' }) || '';
    const num = (k) => parseInt((out.match(new RegExp(k + '\\s*:\\s*(\\d+)')) || [])[1] || '0', 10);
    const host = (k) => (out.match(new RegExp(k + '\\s*:\\s*([^\\n]+)')) || [])[1] || '';
    if (/HTTPSEnable\s*:\s*1/.test(out) && host('HTTPSProxy') && num('HTTPSPort')) {
      val = `http://${host('HTTPSProxy')}:${num('HTTPSPort')}`;
    } else if (/HTTPEnable\s*:\s*1/.test(out) && host('HTTPProxy') && num('HTTPPort')) {
      val = `http://${host('HTTPProxy')}:${num('HTTPPort')}`;
    }
    // NOTE: SOCKS system proxy intentionally ignored — only https-proxy-agent is bundled.
  } catch {}
  sysProxyCache = { at: now, val };
  return val;
}

// ----------------------------------------------------------------------------
// IPC registration
// ----------------------------------------------------------------------------
function registerRealHumanIpc({ getProxy, getWebContents }) {
  const localEngine = new LocalProductAvatarEngine({
    runtimeDir: localRuntimeDir(),
    sourceDir: localSourceDir(),
    legacyModelsDir: modelsDir(),
    ffmpegPath: ffmpegPath(),
  });
  let generating = false;
  let cancelFlag = false;

  const emit = (payload) => {
    try {
      const wc = getWebContents && getWebContents();
      if (wc && !wc.isDestroyed()) wc.send('realhuman:event', payload);
    } catch {}
  };

  ipcMain.handle('realhuman:status', async () => {
    const hosts = HOST_CATALOG.map((h) => ({
      ...h,
      available: fs.existsSync(path.join(hostsDir(), h.file)),
    }));
    const voice = modelStatus();
    const local = localEngine.status();
    return {
      ready: voice.ready && local.ready,
      downloaded: voice.downloaded + local.downloaded,
      total: voice.total + local.total,
      models: [...voice.models, ...local.files],
      hosts,
      generating,
      engine: { provider: 'MuseTalk 1.5 Local MPS', local: true, ready: local.ready, sizeBytes: local.sizeBytes },
    };
  });

  ipcMain.handle('realhuman:download-models', async () => {
    if (modelStatus().ready && localEngine.status().ready) return { ok: true, cached: true };
    const dir = modelsDir();
    fs.mkdirSync(dir, { recursive: true });
    const proxy = (getProxy && getProxy()) || getSystemProxy();
    await localEngine.preparePython((event) => emit(event));
    const allFiles = [
      ...MODEL_FILES.map((file) => ({ ...file, destination: path.join(dir, file.name), url: `${file.base || RELEASE_BASE}/${file.remote || file.name}` })),
      ...MUSETALK_FILES.map((file) => ({ ...file, destination: path.join(localRuntimeDir(), file.name) })),
    ];
    const totalBytes = allFiles.reduce((sum, file) => sum + file.size, 0);
    let doneBytes = 0;
    for (let i = 0; i < allFiles.length; i++) {
      const m = allFiles[i];
      const dest = m.destination;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      // skip files already present (extract entries check the extracted dir)
      const done =
        m.extract
          ? (() => { try { return fs.statSync(dest.replace(/\.tar\.bz2$/, '')).isDirectory(); } catch { return false; } })()
          : (() => { try { return fs.statSync(dest).size > m.size * 0.98; } catch { return false; } })();
      if (done) { doneBytes += m.size; continue; }
      emit({ stage: 'download', file: m.name, fileIndex: i, fileTotal: allFiles.length, pct: doneBytes / totalBytes });
      await downloadFile(m.url, dest, {
        proxy,
        onProgress: (p, done, total) => {
          emit({
            stage: 'download', file: m.name, fileIndex: i, fileTotal: allFiles.length,
            pct: (doneBytes + (total ? done / total * m.size : 0)) / totalBytes,
            filePct: p, bytes: done, totalBytes: total,
          });
        },
      });
      if (m.extract) {
        const { execFile } = require('child_process');
        const exDir = path.dirname(dest);
        await new Promise((resolve, reject) => {
          execFile('tar', ['-xjf', dest, '-C', exDir], { timeout: 120000 }, (err) => (err ? reject(err) : resolve()));
        });
        try { fs.unlinkSync(dest); } catch {} // free disk — status checks the extracted dir
      }
      doneBytes += m.size;
    }
    emit({ stage: 'download', pct: 1, done: true });
    return { ok: true, voice: modelStatus(), local: localEngine.status() };
  });

  ipcMain.handle('realhuman:list-hosts', async () => {
    return { hosts: HOST_CATALOG.map((h) => ({ ...h, available: fs.existsSync(path.join(hostsDir(), h.file)) })) };
  });

  ipcMain.handle('realhuman:cancel', async () => {
    if (!generating) return { ok: false, error: 'not generating' };
    cancelFlag = true;
    localEngine.cancel();
    return { ok: true };
  });

  ipcMain.handle('realhuman:generate', async (_event, input) => {
    if (generating) throw new Error('a generation is already running');
    const script = String(input?.script || '').trim();
    if (!script) throw new Error('script is required');
    const requestedHostId = String(input?.hostId || 'm_asia');
    const productImages = Array.isArray(input?.productImages) ? input.productImages : [];
    const validProductImages = productImages.filter((src) => typeof src === 'string' && fs.existsSync(src));
    // Product mode must use footage in which the presenter genuinely holds a
    // compatible cylinder. Other presenters are still available when no
    // product image is supplied.
    const hostId = validProductImages.length ? 'f_asia' : requestedHostId;
    const host = HOST_CATALOG.find((h) => h.id === hostId) || HOST_CATALOG[0];
    const hostVideo = path.join(hostsDir(), host.file);
    if (!fs.existsSync(hostVideo)) throw new Error(`host video missing: ${host.file}`);

    const locale = String(input?.locale || 'zh-CN');
    const overlays = Array.isArray(input?.overlays) ? input.overlays : [];
    if (!modelStatus().ready || !localEngine.status().ready) {
      throw new Error('Local MuseTalk models are not ready — download local models first');
    }

    generating = true;
    cancelFlag = false;
    const t0 = Date.now();
    let generationWorkDir = '';
    try {
      const outDir = outputsDir();
      fs.mkdirSync(outDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const rand = crypto.randomBytes(3).toString('hex');
      const outName = `realhuman_${hostId}_${stamp}_${rand}.mp4`;
      const outPath = path.join(outDir, outName);

      const allOverlays = overlays.filter((o) => o && o.type !== 'image');

      generationWorkDir = path.join(outDir, `work_${stamp}_${rand}`);
      await localEngine.synthesize({
        hostVideo,
        hostId,
        productImage: validProductImages[0] || '',
        script,
        locale,
        gender: host.gender,
        outPath,
        workDir: generationWorkDir,
        overlays: allOverlays,
        cancelled: () => cancelFlag,
        onProgress: (progress) => {
          if (cancelFlag) throw new Error('cancelled by user');
          emit(progress);
        },
      });

      validatePlayableVideo(outPath);

      // expose via media server — file lands in baseDir (/tmp/generated-clips),
      // which media-server serves under /api/serve-clip/<name> (supports Range for playback)
      fs.mkdirSync('/tmp/generated-clips', { recursive: true });
      const served = path.join('/tmp/generated-clips', outName);
      try { fs.copyFileSync(outPath, served); } catch {}

      emit({ stage: 'done', pct: 1, outUrl: `/api/serve-clip/${outName}` });
      return { ok: true, outPath, outUrl: `/api/serve-clip/${outName}`, durationMs: Date.now() - t0, hostId };
    } finally {
      generating = false;
      if (generationWorkDir) {
        try { fs.rmSync(generationWorkDir, { recursive: true, force: true }); } catch {}
      }
      // cleanup old outputs (keep newest 10)
      try {
        const files = fs.readdirSync(outputsDir()).filter((f) => f.endsWith('.mp4')).map((f) => ({
          f, m: fs.statSync(path.join(outputsDir(), f)).mtimeMs,
        })).sort((a, b) => b.m - a.m);
        for (const x of files.slice(10)) { try { fs.unlinkSync(path.join(outputsDir(), x.f)); } catch {} }
      } catch {}
    }
  });

  // v1 -> v2: delete obsolete 465MB of old models (async, non-blocking)
  try {
    const dir = modelsDir();
    for (const name of LEGACY_MODEL_FILES) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        log('removed legacy model:', name);
      }
    }
    // also drop stale .part files
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.part')) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
    }
  } catch {}

  // Remove stale render work directories left by older releases. Finished
  // MP4 files are user output and are deliberately preserved.
  try {
    const dir = outputsDir();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('work_')) {
        fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
      }
    }
  } catch {}

  log('IPC registered');
}

module.exports = { registerRealHumanIpc, modelStatus, hostsDir, modelsDir, MODEL_FILES };
