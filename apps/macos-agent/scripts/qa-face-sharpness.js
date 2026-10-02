#!/usr/bin/env node
/** qa-face-sharpness.js — v0.9.50 whole-face blur fix verification.
 *  Measures LaplacianVar in EYE / FOREHEAD / MOUTH regions of the generated
 *  video vs the sharp HOST video. Before the fix, unmasked face pixels were
 *  21-57% covered by the blurry 96x96 upscale (whole-face blur); after the
 *  fix, eye/forehead must match the host's sharpness (ratio ≈ 1.0). */
'use strict';
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileP = promisify(execFile);

const AGENT = path.join(__dirname, '..');
const FFMPEG = (() => {
  try { return require(path.join(AGENT, 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path; } catch { return 'ffmpeg'; }
})();
const HOST = path.join(AGENT, 'resources', 'hosts', 'host_m_asia.mp4');
const GEN = process.argv[2] || '/tmp/rh_visual_v46_out.mp4';
const W = 720, H = 1280;

// face box from E2E log: [285,247,470,519]
const REGIONS = {
  forehead: { x1: 315, y1: 255, x2: 445, y2: 285 },
  eyes:     { x1: 295, y1: 295, x2: 460, y2: 345 },
  cheeks:   { x1: 295, y1: 350, x2: 460, y2: 380 },
  mouth:    { x1: 309, y1: 383, x2: 446, y2: 519 },
};

async function grabFrames(file, times) {
  const out = [];
  for (const t of times) {
    const { stdout } = await execFileP(FFMPEG, ['-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
    out.push({ t, g: Buffer.from(stdout) });
  }
  return out;
}

function lapVar(g, r) {
  let e = 0, n = 0;
  for (let y = r.y1 + 1; y < r.y2 - 1; y++) {
    for (let x = r.x1 + 1; x < r.x2 - 1; x++) {
      e += 4 * g[y * W + x] - g[y * W + x - 1] - g[y * W + x + 1] - g[(y - 1) * W + x] - g[(y + 1) * W + x];
      n++;
    }
  }
  const mean = e / n;
  let e2 = 0;
  for (let y = r.y1 + 1; y < r.y2 - 1; y++) {
    for (let x = r.x1 + 1; x < r.x2 - 1; x++) {
      const lap = 4 * g[y * W + x] - g[y * W + x - 1] - g[y * W + x + 1] - g[(y - 1) * W + x] - g[(y + 1) * W + x];
      e2 += (lap - mean) ** 2;
    }
  }
  return e2 / n;
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; }

(async () => {
  const times = [0.6, 1.7, 2.9, 4.0, 5.2, 6.3, 7.5, 8.6, 9.8, 10.9, 12.1, 13.2];
  const gen = await grabFrames(GEN, times);
  // host: same timestamps (host loop 32s — same t works)
  const host = await grabFrames(HOST, times);

  console.log(`file: ${GEN}\n`);
  const ratios = {};
  for (const [name, r] of Object.entries(REGIONS)) {
    const gv = gen.map(f => lapVar(f.g, r));
    const hv = host.map(f => lapVar(f.g, r));
    const gm = median(gv), hm = median(hv);
    ratios[name] = gm / hm;
    console.log(`${name.padEnd(9)} gen=${gm.toFixed(1).padStart(7)}  host=${hm.toFixed(1).padStart(7)}  ratio=${(gm / hm).toFixed(3)}  ${gm / hm > 0.75 ? 'PASS' : 'FAIL'}`);
  }
  const faceAvg = (ratios.forehead + ratios.eyes + ratios.cheeks) / 3;
  console.log(`\nwhole-face (forehead+eyes+cheeks) sharpness retention: ${(faceAvg * 100).toFixed(1)}%`);
  console.log(`mouth sharpness retention: ${(ratios.mouth * 100).toFixed(1)}%`);
  console.log(faceAvg > 0.75 ? '\nVERDICT: whole-face blur FIXED (face pixels ≈ host sharpness)' : '\nVERDICT: face still degraded — investigate');
})();
