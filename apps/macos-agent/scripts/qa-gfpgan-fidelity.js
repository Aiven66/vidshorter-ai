#!/usr/bin/env node
/** qa-gfpgan-fidelity.js — deeper GFPGAN validation:
 *  1. run GFPGAN on the SHARP aligned face → how faithful is it (PSNR/SSIM vs input)?
 *  2. true-edge gradient strength (top-1% |∇I|) in mouth region for
 *     ref / blurry / restored — bilinear upsample inflates Laplacian but
 *     cannot fake edge contrast.
 *  3. SSIM (perceptual) mouth region. */
'use strict';
const fs = require('fs');
const path = require('path');
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

/** top-pct gradient magnitudes within region — true edge strength */
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

function ssim(a, b, x0, y0, x1, y1) {
  const C1 = 6.5025, C2 = 58.5225;
  const w = x1 - x0, h = y1 - y0;
  const win = 8;
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

async function main() {
  const ref = readPpm(`${MODELS}/al_ref.ppm`);
  const blurry = readPpm(`${MODELS}/al_blurry.ppm`);
  const restored = readPpm(`${MODELS}/al_restored.ppm`);

  // run GFPGAN on the SHARP aligned face
  const sess = await InferenceSession.create(path.join(MODELS, 'gfpgan_1.4.onnx'), { intraOpNumThreads: 4 });
  const t0 = Date.now();
  const gfSharp = await gfpgan(sess, ref);
  console.log(`gfpgan(sharp): ${Date.now() - t0}ms`);
  fs.writeFileSync(`${MODELS}/al_gfsharp.ppm`, Buffer.concat([Buffer.from(`P6\n${S} ${S}\n255\n`, 'ascii'), gfSharp]));

  const gRef = gray(ref), gBlur = gray(blurry), gRest = gray(restored), gGfS = gray(gfSharp);
  const mx0 = Math.round(0.30 * S), mx1 = Math.round(0.70 * S);
  const my0 = Math.round(0.62 * S), my1 = Math.round(0.86 * S);

  console.log('=== FIDELITY: GFPGAN(sharp) vs sharp input ===');
  let se = 0;
  for (let i = 0; i < N * 3; i++) { const d = gfSharp[i] - ref[i]; se += d * d; }
  console.log(`full PSNR  gfpgan(sharp) vs sharp : ${(10 * Math.log10(255 * 255 / (se / (N * 3)))).toFixed(2)} dB`);
  console.log(`mouth SSIM gfpgan(sharp) vs sharp : ${ssim(gGfS, gRef, mx0, my0, mx1, my1).toFixed(4)}`);

  console.log('=== PERCEPTUAL: blurry & restored vs sharp ref ===');
  console.log(`mouth SSIM blurry   vs ref : ${ssim(gBlur, gRef, mx0, my0, mx1, my1).toFixed(4)}`);
  console.log(`mouth SSIM restored vs ref : ${ssim(gRest, gRef, mx0, my0, mx1, my1).toFixed(4)}`);

  console.log('=== TRUE EDGE STRENGTH (top-1% gradient, mouth region) ===');
  console.log(`sharp ref        : ${edgeStrength(gRef, mx0, my0, mx1, my1).toFixed(1)}`);
  console.log(`blurry (96->512) : ${edgeStrength(gBlur, mx0, my0, mx1, my1).toFixed(1)}`);
  console.log(`gfpgan restored  : ${edgeStrength(gRest, mx0, my0, mx1, my1).toFixed(1)}`);
  console.log(`gfpgan(sharp)    : ${edgeStrength(gGfS, mx0, my0, mx1, my1).toFixed(1)}`);
}
main().catch(e => { console.error(e); process.exit(1); });
