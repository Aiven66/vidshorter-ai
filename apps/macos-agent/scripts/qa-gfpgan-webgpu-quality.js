#!/usr/bin/env node
/** qa-gfpgan-webgpu-quality.js — run the REAL blurry aligned face through
 *  WebGPU fp32 and compare QUALITY metrics (edge strength / SSIM / PSNR vs
 *  sharp ref) against CPU fp32. rmse between GAN outputs is meaningless
 *  (chaos); quality metrics are what matter. */
'use strict';
const fs = require('fs');
const { InferenceSession, Tensor } = require('onnxruntime-node');

const MODELS = '/tmp/rh-models';
const S = 512, N = S * S;

function readPpm(p) {
  const b = fs.readFileSync(p);
  const hdrEnd = b.indexOf(Buffer.from('\n255\n', 'ascii')) + 5;
  return b.subarray(hdrEnd);
}
async function gfpgan(sess, img) {
  const x = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    x[i] = img[i * 3] / 127.5 - 1;
    x[N + i] = img[i * 3 + 1] / 127.5 - 1;
    x[2 * N + i] = img[i * 3 + 2] / 127.5 - 1;
  }
  const out = await sess.run({ input: new Tensor('float32', x, [1, 3, S, S]) });
  const d = Object.values(out)[0].data;
  const r = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) {
    r[i * 3] = Math.max(0, Math.min(255, (d[i] + 1) * 127.5));
    r[i * 3 + 1] = Math.max(0, Math.min(255, (d[N + i] + 1) * 127.5));
    r[i * 3 + 2] = Math.max(0, Math.min(255, (d[2 * N + i] + 1) * 127.5));
  }
  return r;
}
function gray(img) {
  const g = new Float32Array(N);
  for (let i = 0; i < N; i++) g[i] = 0.299 * img[i * 3] + 0.587 * img[i * 3 + 1] + 0.114 * img[i * 3 + 2];
  return g;
}
function edgeStrength(g, x0, y0, x1, y1, pct = 0.01) {
  const mags = [];
  for (let y = y0 + 1; y < y1 - 1; y++) for (let x = x0 + 1; x < x1 - 1; x++) {
    const gx = g[y * S + x + 1] - g[y * S + x - 1];
    const gy = g[(y + 1) * S + x] - g[(y - 1) * S + x];
    mags.push(Math.hypot(gx, gy));
  }
  mags.sort((a, b) => a - b);
  const idx = Math.min(mags.length - 1, Math.floor(mags.length * (1 - pct)));
  const top = mags.slice(idx);
  return top.reduce((a, b) => a + b, 0) / top.length;
}
function psnr(a, b) {
  let se = 0;
  for (let i = 0; i < N * 3; i++) { const d = a[i] - b[i]; se += d * d; }
  return 10 * Math.log10(255 * 255 / (se / (N * 3)));
}
function ssim(a, b, x0, y0, x1, y1) {
  const C1 = 6.5025, C2 = 58.5225;
  const w = x1 - x0, h = y1 - y0, win = 8;
  let tot = 0, cnt = 0;
  for (let wy = 0; wy + win <= h; wy += 4) for (let wx = 0; wx + win <= w; wx += 4) {
    let ma = 0, mb = 0;
    for (let y = 0; y < win; y++) for (let x = 0; x < win; x++) {
      ma += a[(y0 + wy + y) * S + x0 + wx + x]; mb += b[(y0 + wy + y) * S + x0 + wx + x];
    }
    ma /= win * win; mb /= win * win;
    let va = 0, vb = 0, cov = 0;
    for (let y = 0; y < win; y++) for (let x = 0; x < win; x++) {
      const da = a[(y0 + wy + y) * S + x0 + wx + x] - ma, db = b[(y0 + wy + y) * S + x0 + wx + x] - mb;
      va += da * da; vb += db * db; cov += da * db;
    }
    va /= win * win - 1; vb /= win * win - 1; cov /= win * win - 1;
    tot += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
    cnt++;
  }
  return tot / cnt;
}

(async () => {
  const ref = readPpm(`${MODELS}/al_ref.ppm`);
  const blurry = readPpm(`${MODELS}/al_blurry.ppm`);
  const mx0 = Math.round(0.30 * S), mx1 = Math.round(0.70 * S);
  const my0 = Math.round(0.62 * S), my1 = Math.round(0.86 * S);
  const gRef = gray(ref), gBlur = gray(blurry);

  for (const [label, eps] of [['cpu-fp32', ['cpu']], ['webgpu-fp32', ['webgpu']]]) {
    const sess = await InferenceSession.create(`${MODELS}/gfpgan_1.4.onnx`, { executionProviders: eps, graphOptimizationLevel: 'all' });
    await gfpgan(sess, blurry); // warm
    const t = Date.now();
    const restored = await gfpgan(sess, blurry);
    const ms = Date.now() - t;
    const gR = gray(restored);
    console.log(`${label}: ${ms}ms | mouth edge=${edgeStrength(gR, mx0, my0, mx1, my1).toFixed(1)} (blur=${edgeStrength(gBlur, mx0, my0, mx1, my1).toFixed(1)}, ref=${edgeStrength(gRef, mx0, my0, mx1, my1).toFixed(1)}) | full PSNR vs ref=${psnr(restored, ref).toFixed(2)} dB | mouth SSIM vs ref=${ssim(gR, gRef, mx0, my0, mx1, my1).toFixed(4)} (blur=${ssim(gBlur, gRef, mx0, my0, mx1, my1).toFixed(4)})`);
    if (label === 'webgpu-fp32') {
      fs.writeFileSync(`${MODELS}/al_restored_webgpu.ppm`, Buffer.concat([Buffer.from(`P6\n${S} ${S}\n255\n`, 'ascii'), restored]));
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
