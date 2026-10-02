#!/usr/bin/env node
/* E2E: Real Human mode on the INSTALLED Clipop Agent embedded web (or a local build).
 * Boots the shipped embedded-web via the app's Electron (ELECTRON_RUN_AS_NODE)
 * AND a REAL media-server (apps/macos-agent/media-server.js) — no route mocks for
 * video serving. Verifies the v0.9.34 playback/download fix end-to-end:
 *   - generate returns /api/serve-clip/<name> (NOT /api/local-video which reads uploads dir → 404)
 *   - <video> actually loads (canplay) from real media-server with Range support
 *   - Download MP4 href returns HTTP 200 from real media-server
 *   - product image (http URL) uploaded to real /api/upload → bridge receives
 *     existing /tmp/video-cache/uploads/<name> path (image overlay wiring)
 * Usage: node scripts/test-dh-real-human.cjs   (needs Chrome + global playwright)
 */
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require(path.join(os.homedir(), '.npm-global/lib/node_modules/playwright'));

const ROOT = path.join(__dirname, '..');
const APP = process.env.RH_APP || '/Applications/Clipop Agent.app';
// prefer the freshly built embedded-web (repo) — falls back to installed app
const REPO_EW = path.join(ROOT, 'apps', 'macos-agent', 'embedded-web');
const EW = process.env.RH_EW
  || (fs.existsSync(path.join(REPO_EW, '.next')) ? REPO_EW : path.join(APP, 'Contents/Resources/embedded-web'));
const BIN = path.join(APP, 'Contents/MacOS/Clipop Agent');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-e2e-'));
const { createMediaServer } = require(path.join(ROOT, 'apps', 'macos-agent', 'media-server.js'));
const IMG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#4f46e5"/></svg>');

function makeTinyVideo(outPath) {
  // 2s 160x120 mp4 with audio — played back via real media-server
  const FF = require(path.join(ROOT, 'apps', 'macos-agent', 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path;
  const r = require('child_process').spawnSync(FF, ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=160x120:rate=12', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-profile:v', 'baseline', '-c:a', 'aac', '-shortest', outPath], { stdio: 'ignore' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
}

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  cond ? pass++ : fail++;
};

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    s.on('error', rej);
  });
}

async function waitUp(port, ms = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`http://127.0.0.1:${port}/`); if (r.status < 500) return true; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  if (!fs.existsSync(EW)) { console.error('embedded-web not found:', EW); process.exit(1); }

  /* ---- REAL media-server (same module the Electron main process runs) ---- */
  const ms = createMediaServer({});
  await ms.ready;
  const MEDIA = ms.getBaseUrl();
  console.log('MEDIA =', MEDIA);

  // place a real generated video in baseDir, exactly like real-human-ipc.js does
  const outName = `rh-e2e-${Date.now()}.mp4`;
  const outPath = path.join('/tmp/generated-clips', outName);
  fs.mkdirSync('/tmp/generated-clips', { recursive: true });
  makeTinyVideo(outPath);
  const outUrl = `/api/serve-clip/${outName}`; // what FIXED real-human-ipc.js returns

  // sanity: serve-clip serves the file with Range; local-video must NOT
  {
    const r1 = await fetch(`${MEDIA}${outUrl}`);
    check('serve-clip returns 200 video/mp4 (playback URL valid)', r1.status === 200 && (r1.headers.get('content-type') || '').includes('video/mp4'));
    const r2 = await fetch(`${MEDIA}${outUrl}`, { headers: { Range: 'bytes=0-99' } });
    check('serve-clip supports Range 206 (seekable playback)', r2.status === 206);
    const r3 = await fetch(`${MEDIA}/api/local-video/${outName}`);
    check('old broken URL /api/local-video correctly 404s (confirms old bug)', r3.status === 404);
  }

  const port = await freePort();
  const proc = spawn(BIN, [path.join(EW, 'bootstrap.js')], {
    cwd: EW,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1', PORT: String(port),
      NEXT_PUBLIC_DESKTOP: '1', NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  proc.stdout.on('data', d => { serverLog += d; });
  proc.stderr.on('data', d => { serverLog += d; });

  const up = await waitUp(port);
  check('shipped embedded-web server boots (ELECTRON_RUN_AS_NODE)', up);
  if (!up) { console.log(serverLog.slice(-2000)); try { proc.kill('SIGKILL'); ms.close(); } catch {} process.exit(1); }
  const BASE = `http://127.0.0.1:${port}`;
  console.log('BASE =', BASE);

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1600 } });

  // product images as http URLs (Amazon-style gallery) — served by stub routes, then
  // uploaded by the page to the REAL media-server /api/upload
  for (const name of ['product-a.png', 'product-b.png', 'product-c.png']) {
    await ctx.route(`**/cdn.test/${name}`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: IMG_BYTES });
    });
  }

  await ctx.route('**/api/extract-product', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        product: {
          name: 'Smart Insulated Bottle Pro', price: '99', currency: '$', originalPrice: '199',
          brand: 'BottleX', rating: '4.8', reviewCount: '2333',
          image: 'https://cdn.test/product-a.png',
          images: ['https://cdn.test/product-a.png', 'https://cdn.test/product-b.png', 'https://cdn.test/product-c.png'],
          highlights: [{ title: '12h insulation' }, { title: 'Smart temperature display' }, { title: 'Fashion design' }],
        },
      }),
    });
  });

  await ctx.addInitScript((cfg) => {
    const { origin, videoOutUrl } = cfg;
    const listeners = [];
    const emit = (ev) => listeners.forEach(cb => { try { cb(ev); } catch {} });
    const hosts = [
      { id: 'host_f_asia', file: 'host_f_asia.mp4', gender: 'female', region: 'asia', label: 'Mei · Asia F', available: true },
      { id: 'host_f_west', file: 'host_f_west.mp4', gender: 'female', region: 'west', label: 'Emma · West F', available: true },
      { id: 'host_f_sea', file: 'host_f_sea.mp4', gender: 'female', region: 'mid-sea', label: 'Layla · Mid-East F', available: true },
      { id: 'host_m_asia', file: 'host_m_asia.mp4', gender: 'male', region: 'asia', label: 'Chen · Asia M', available: true },
      { id: 'host_m_west', file: 'host_m_west.mp4', gender: 'male', region: 'west', label: 'Ryan · West M', available: true },
      { id: 'host_m_mid', file: 'host_m_mid.mp4', gender: 'male', region: 'mid-sea', label: 'Omar · Mid-East M', available: true },
    ];
    let ready = false;
    window.__rh = { calls: [] };
    window.clipopDesktop = {
      realHumanStatus: async () => ({ ready, downloaded: ready ? 4 : 0, total: 4, hosts }),
      realHumanDownloadModels: async () => {
        window.__rh.calls.push('download');
        for (let i = 1; i <= 4; i++) emit({ stage: 'download', pct: i / 4, file: `model_${i}.onnx`, fileIndex: i, fileTotal: 4 });
        ready = true;
        return { ok: true };
      },
      realHumanListHosts: async () => ({ hosts }),
      realHumanGenerate: async (input) => {
        window.__rh.calls.push(['generate', JSON.parse(JSON.stringify(input))]);
        emit({ stage: 'models', pct: 1 });
        emit({ stage: 'tts', pct: 1 });
        for (let f = 0; f <= 120; f += 30) emit({ stage: 'render', pct: f / 120, frame: f, total: 120 });
        emit({ stage: 'done', outUrl: videoOutUrl });
        const r = { ok: true, outUrl: videoOutUrl, durationMs: 4200 };
        window.__rh.lastRes = r;
        return r;
      },
      realHumanCancel: async () => ({ ok: true }),
      onRealHumanEvent: (cb) => { listeners.push(cb); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; },
      getMediaBaseUrl: async () => origin,
    };
  }, { origin: MEDIA, videoOutUrl: outUrl });

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.goto(`${BASE}/digital-human-live`, { timeout: 60000 });
  await page.waitForLoadState('networkidle');

  /* 1. mode toggle (desktop bridge present) */
  const realBtn = page.locator('button', { hasText: 'Real Human' }).first();
  check('Real Human toggle visible with desktop bridge', await realBtn.count() > 0);
  check('Desktop badge on toggle', await page.locator('button:has-text("Real Human")').locator('span', { hasText: 'Desktop' }).count() > 0);

  /* 2. enter real mode */
  await realBtn.click();
  await page.waitForTimeout(800);
  const txt1 = await page.evaluate(() => document.body.innerText);
  check('Real Human Host section', txt1.includes('Real Human Host'));
  check('Local AI Models card', txt1.includes('Local AI Models'));
  check('models show 0/4 before download', /0\s*\/\s*4/.test(txt1));
  check('6 real hosts render', ['Mei', 'Emma', 'Layla', 'Chen', 'Ryan', 'Omar'].every(n => txt1.includes(n)));
  check('lip-sync badge text', txt1.includes('Local AI lip-sync'));

  /* 3. download models flow */
  const dlBtn = page.locator('button', { hasText: /Download Models/i }).first();
  check('Download Models button visible', await dlBtn.count() > 0);
  await dlBtn.click();
  await page.waitForTimeout(1000);
  check('models Ready after download', (await page.evaluate(() => document.body.innerText)).includes('Ready'));

  /* 4. pick male host Chen */
  await page.locator('button', { hasText: 'Chen' }).first().click();
  await page.waitForTimeout(300);

  /* 5. product fill via canned API → script auto-build */
  await page.fill('input[type="url"]', 'https://www.amazon.com/dp/B0TEST123');
  await page.locator('button', { hasText: /AI Read Product Info|Read Product/i }).first().click();
  await page.waitForTimeout(1500);
  const txt2 = await page.evaluate(() => ({
    body: document.body.innerText,
    textareas: Array.from(document.querySelectorAll('textarea')).map(t => t.value).join('\n'),
  }));
  check('product name detected', txt2.body.includes('Smart Insulated Bottle') || txt2.textareas.includes('Smart Insulated Bottle'));
  check('smart-detected hint', txt2.body.includes('Smart-detected'));
  check('script textarea rendered', txt2.textareas.length > 0);

  /* 6. generate → progress → result */
  const genBtn = page.locator('button', { hasText: 'Generate Real Human Video' }).first();
  check('Generate button enabled (models ready + script)', await genBtn.count() > 0 && await genBtn.isEnabled());
  await genBtn.click();
  await page.waitForTimeout(1500);

  const calls = await page.evaluate(() => window.__rh.calls);
  const gen = calls.find(c => Array.isArray(c) && c[0] === 'generate');
  check('bridge.realHumanGenerate called', !!gen);
  if (gen) {
    const inp = gen[1];
    check('script text passed', typeof inp.script === 'string' && inp.script.length > 20, `len=${inp.script?.length}`);
    check('hostId = host_m_asia', inp.hostId === 'host_m_asia', inp.hostId);
    check('locale passed', typeof inp.locale === 'string' && inp.locale.length > 0, inp.locale);
    check('voice passed', typeof inp.voice === 'string' && inp.voice.length > 0, inp.voice);
    check('overlays timeline built', Array.isArray(inp.overlays) && inp.overlays.length >= 4, `n=${inp.overlays?.length}`);
    check('overlays are text-only (product handled by engine held-card, NOT overlay)', Array.isArray(inp.overlays) && inp.overlays.every(o => o.type === 'text'));
    // product images (gallery, up to 3): uploaded to REAL media-server → local paths must exist
    if (Array.isArray(inp.productImages) && inp.productImages.length === 3) {
      const allOk = inp.productImages.every(p => p.startsWith('/tmp/video-cache/uploads/') && fs.existsSync(p));
      check('3 product gallery images uploaded to /tmp/video-cache/uploads (exists)', allOk, inp.productImages.join(', '));
    } else {
      check('3 product gallery images uploaded to /tmp/video-cache/uploads (exists)', false, `got ${inp.productImages?.length}`);
    }
  }
  check('download called once', calls.filter(c => c === 'download').length === 1);

  /* 7. result video ACTUALLY PLAYS from real media-server */
  await page.waitForTimeout(300);
  const videoEl = page.locator('video').first();
  check('result video element present', await page.locator('video').count() > 0);
  if (await videoEl.count() > 0) {
    // wait for real canplaythrough from the real media-server (Range + mp4)
    let canplay = false;
    try { await videoEl.evaluate((v) => new Promise((res) => {
      if (v.readyState >= 3) return res();
      const ok = () => { canplay = true; res(); };
      v.addEventListener('canplaythrough', ok, { once: true });
      v.addEventListener('error', () => res(), { once: true });
      v.load();
      setTimeout(res, 8000);
    })); } catch {}
    const vinfo = await videoEl.evaluate((v) => ({
      src: v.currentSrc || v.src || '',
      readyState: v.readyState,
      duration: v.duration,
      error: v.error ? v.error.code : 0,
    }));
    canplay = canplay || vinfo.readyState >= 3;
    check('video src is /api/serve-clip/ (fixed URL)', vinfo.src.includes('/api/serve-clip/'), vinfo.src);
    check('video actually loads (canplaythrough, no error)', canplay && vinfo.error === 0 && vinfo.duration > 0,
      `readyState=${vinfo.readyState} duration=${vinfo.duration} err=${vinfo.error}`);
  }

  /* 8. download link resolves over HTTP from real media-server */
  const dlHref = await page.locator('a[download]').first().getAttribute('href').catch(() => null);
  check('Download MP4 anchor present', !!dlHref, dlHref || '');
  if (dlHref) {
    const abs = dlHref.startsWith('http') ? dlHref : `${MEDIA}${dlHref}`;
    const r = await fetch(abs);
    const buf = await r.arrayBuffer();
    check('download URL returns 200 with mp4 bytes', r.status === 200 && buf.byteLength === fs.statSync(outPath).size,
      `status=${r.status} bytes=${buf.byteLength}`);
  }

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 200));

  await browser.close();
  try { proc.kill('SIGKILL'); } catch {}
  try { ms.close(); } catch {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  try { fs.unlinkSync(outPath); } catch {}
  console.log(`\n${'='.repeat(50)}\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
