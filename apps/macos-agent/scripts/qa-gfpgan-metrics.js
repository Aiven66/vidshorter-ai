#!/usr/bin/env node
/** qa-gfpgan-metrics.js — compare aligned blurry vs restored against sharp ref.
 *  Metrics: full PSNR + mouth-region PSNR + mouth Laplacian variance. */
'use strict';
const fs = require('fs');
const MODELS = '/tmp/rh-models';
const S = 512, N = S * S;

function readPpm(p) {
  const b = fs.readFileSync(p);
  const hdrEnd = b.indexOf(Buffer.from('\n255\n', 'ascii')) + 5;
  return b.subarray(hdrEnd);
}

function lapVar(img, x0, y0, x1, y1) {
  // grayscale Laplacian variance over region
  const gray = new Float32Array(S * S);
  for (let i = 0; i < N; i++) gray[i] = 0.299 * img[i * 3] + 0.587 * img[i * 3 + 1] + 0.114 * img[i * 3 + 2];
  let sum = 0, sum2 = 0, cnt = 0;
  for (let y = y0 + 1; y < y1 - 1; y++) for (let x = x0 + 1; x < x1 - 1; x++) {
    const l = 4 * gray[y * S + x] - gray[y * S + x - 1] - gray[y * S + x + 1] - gray[(y - 1) * S + x] - gray[(y + 1) * S + x];
    sum += l; sum2 += l * l; cnt++;
  }
  const mean = sum / cnt;
  return sum2 / cnt - mean * mean;
}

function psnr(a, b, x0, y0, x1, y1) {
  let se = 0, cnt = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * S + x) * 3;
    for (let c = 0; c < 3; c++) { const d = a[i + c] - b[i + c]; se += d * d; cnt++; }
  }
  const mse = se / cnt;
  return 10 * Math.log10(255 * 255 / mse);
}

const ref = readPpm(`${MODELS}/al_ref.ppm`);
const blurry = readPpm(`${MODELS}/al_blurry.ppm`);
const restored = readPpm(`${MODELS}/al_restored.ppm`);

// FFHQ 512 mouth region: template mouth corners ~(0.39,0.74)&(0.61,0.74) — expand
const mx0 = Math.round(0.30 * S), mx1 = Math.round(0.70 * S);
const my0 = Math.round(0.62 * S), my1 = Math.round(0.86 * S);

console.log('=== ALIGNED SPACE (512x512 FFHQ) ===');
console.log(`full PSNR    blurry vs ref   : ${psnr(blurry, ref, 0, 0, S, S).toFixed(2)} dB`);
console.log(`full PSNR    restored vs ref : ${psnr(restored, ref, 0, 0, S, S).toFixed(2)} dB`);
console.log(`mouth PSNR   blurry vs ref   : ${psnr(blurry, ref, mx0, my0, mx1, my1).toFixed(2)} dB`);
console.log(`mouth PSNR   restored vs ref : ${psnr(restored, ref, mx0, my0, mx1, my1).toFixed(2)} dB`);
console.log(`mouth LapVar ref (sharp)    : ${lapVar(ref, mx0, my0, mx1, my1).toFixed(1)}`);
console.log(`mouth LapVar blurry         : ${lapVar(blurry, mx0, my0, mx1, my1).toFixed(1)}`);
console.log(`mouth LapVar restored       : ${lapVar(restored, mx0, my0, mx1, my1).toFixed(1)}`);
