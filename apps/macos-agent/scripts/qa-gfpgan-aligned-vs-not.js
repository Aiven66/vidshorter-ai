#!/usr/bin/env node
/** qa-gfpgan-aligned-vs-not.js — does FFHQ alignment materially improve
 *  GFPGAN restoration vs the engine's current naive square-crop resize?
 *  Same blurry input (96->512), two warp paths, compare against sharp ref. */
'use strict';
const fs = require('fs');
const path = require('path');
const { InferenceSession, Tensor } = require('onnxruntime-node');

const MODELS = '/tmp/rh-models';
const AGENT = '/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent';
const S = 512, N = S * S, W = 720, H = 1280;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function resizeTo(src, srcW, srcH, sx, sy, sw, sh, dstW, dstH, dst) {
  for (let y = 0; y < dstH; y++) {
    const fy = Math.min(sh - 1, (y + 0.5) * sh / dstW - 0.5), cy = Math.min(sh - 1, Math.max(0, Math.round(fy))), ty = fy - cy, cy1 = Math.min(sh - 1, cy + 1);
    for (let x = 0; x < dstW; x++) {
      const fx = Math.min(sw - 1, (x + 0.5) * sw / dstW - 0.5), cx = Math.min(sw - 1, Math.max(0, Math.round(fx))), tx = fx - cx, cx1 = Math.min(sw - 1, cx + 1);
      const di = (y * dstW + x) * 3;
      for (let c = 0; c < 3; c++) {
        const p00 = src[((sy + cy) * srcW + sx + cx) * 3 + c], p01 = src[((sy + cy) * srcW + sx + cx1) * 3 + c];
        const p10 = src[((sy + cy1) * srcW + sx + cx) * 3 + c], p11 = src[((sy + cy1) * srcW + sx + cx1) * 3 + c];
        const a = p00 + (p01 - p00) * tx, b = p10 + (p11 - p10) * tx;
        dst[di + c] = clamp(a + (b - a) * ty, 0, 255);
      }
    }
  }
  return dst;
}
function warpAffine(src, srcW, srcH, dstW, dstH, m, dst) {
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const fx = m[0] * x + m[1] * y + m[2];
      const fy = m[3] * x + m[4] * y + m[5];
      const di = (y * dstW + x) * 3;
      if (fx < 0 || fy < 0 || fx >= srcW - 1 || fy >= srcH - 1) { dst[di] = 0; dst[di + 1] = 0; dst[di + 2] = 0; continue; }
      const cx = Math.floor(fx), cy = Math.floor(fy);
      const tx = fx - cx, ty = fy - cy;
      const cx1 = Math.min(srcW - 1, cx + 1), cy1 = Math.min(srcH - 1, cy + 1);
      for (let c = 0; c < 3; c++) {
        const p00 = src[(cy * srcW + cx) * 3 + c], p01 = src[(cy * srcW + cx1) * 3 + c];
        const p10 = src[(cy1 * srcW + cx) * 3 + c], p11 = src[(cy1 * srcW + cx1) * 3 + c];
        const a = p00 + (p01 - p00) * tx, b = p10 + (p11 - p10) * tx;
        dst[di + c] = clamp(a + (b - a) * ty, 0, 255);
      }
    }
  }
  return dst;
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
    r[i * 3] = clamp((d[i] + 1) * 127.5, 0, 255);
    r[i * 3 + 1] = clamp((d[N + i] + 1) * 127.5, 0, 255);
    r[i * 3 + 2] = clamp((d[2 * N + i] + 1) * 127.5, 0, 255);
  }
  return r;
}

// ---------- metrics ----------
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

async function main() {
  const frame = await new Promise((res, rej) => {
    const chunks = [];
    const p = require('child_process').spawn('ffmpeg', ['-i', path.join(AGENT, 'resources', 'hosts', 'host_m_asia.mp4'), '-vf', `scale=${W}:${H}`, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.on('data', c => chunks.push(c));
    p.on('close', c => c === 0 ? res(Buffer.concat(chunks)) : rej(new Error('decode')));
    p.on('error', rej);
  });

  const sess = await InferenceSession.create(path.join(MODELS, 'gfpgan_1.4.onnx'), { intraOpNumThreads: 4 });

  // face box from previous yolo run
  const box = [286.78, 246.43, 469.29, 528.77]; // x1,y1,x2,y2
  const src5 = [[339.74, 347.98], [427.79, 353.30], [382.85, 403.09], [340.75, 442.36], [413.53, 446.75]];
  const FFHQ = [
    [0.37691676 * S, 0.46864664 * S],
    [0.62285697 * S, 0.46912813 * S],
    [0.50123859 * S, 0.61331904 * S],
    [0.39308822 * S, 0.73741159 * S],
    [0.61141959 * S, 0.73744358 * S],
  ];

  // similarity frame->aligned (fixed Umeyama)
  function similarity(src, dst) {
    const n = src.length;
    let sx = 0, sy = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
    sx /= n; sy /= n; dx /= n; dy /= n;
    let c = 0, s = 0, va = 0;
    for (let i = 0; i < n; i++) {
      const ax = src[i][0] - sx, ay = src[i][1] - sy;
      const bx = dst[i][0] - dx, by = dst[i][1] - dy;
      c += ax * bx + ay * by; s += ay * bx - ax * by; va += ax * ax + ay * ay;
    }
    const r = Math.hypot(c, s);
    const sc = r / va, cc = c / r, ss = s / r;
    const a = sc * cc, b = sc * ss;
    return [a, -b, dx - (a * sx - b * sy), b, a, dy - (b * sx + a * sy)];
  }
  function invAffine(m) {
    const det = m[0] * m[4] - m[1] * m[3];
    return [m[4] / det, -m[1] / det, (m[1] * m[5] - m[4] * m[2]) / det, -m[3] / det, m[0] / det, (m[3] * m[2] - m[0] * m[5]) / det];
  }
  const M = similarity(src5, FFHQ);
  const Mi = invAffine(M);

  // ---- path A: ALIGNED (warp full frame -> 512 aligned), simulate 96 blur, restore, warp back
  const alignedRef = Buffer.alloc(N * 3);
  warpAffine(frame, W, H, S, S, Mi, alignedRef);
  const tinyA = Buffer.alloc(96 * 96 * 3);
  resizeTo(alignedRef, S, S, 0, 0, S, S, 96, 96, tinyA);
  const blurryA = Buffer.alloc(N * 3);
  resizeTo(tinyA, 96, 96, 0, 0, 96, 96, S, S, blurryA);
  const restoredA = await gfpgan(sess, blurryA);
  // warp restored back to frame space for comparison
  const backA = Buffer.alloc(W * H * 3); // frame-space restored (only face region valid)
  warpAffine(restoredA, S, S, W, H, M, backA); // forward map frame->aligned: inverse use

  // ---- path B: NAIVE square crop (engine current): center of box, side = box w * 1.15
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  const side = Math.round(Math.min(box[2] - box[0], box[3] - box[1]) * 1.15);
  const sx1 = Math.round(cx - side / 2), sy1 = Math.round(cy - side / 2);
  const cropRef = Buffer.alloc(N * 3);
  resizeTo(frame, W, H, sx1, sy1, side, side, S, S, cropRef);
  const tinyB = Buffer.alloc(96 * 96 * 3);
  resizeTo(cropRef, S, S, 0, 0, S, S, 96, 96, tinyB);
  const blurryB = Buffer.alloc(N * 3);
  resizeTo(tinyB, 96, 96, 0, 0, 96, 96, S, S, blurryB);
  const restoredB = await gfpgan(sess, blurryB);

  // ---- compare in ALIGNED space: naive output must be warped to aligned space for fair compare
  // back-map naive crop to aligned space: crop(p) = frame(sx1 + p*side/S) ; aligned(x) = frame(Mi(x))
  // do it in two steps: restoredB (crop space) -> frame space (inverse resize) -> aligned
  // simpler: forward-warp restoredB into frame space with inverse of the crop mapping, then warp to aligned
  const backB = Buffer.alloc(W * H * 3);
  // inverse crop: frame(x,y) samples cropB((x-sx1)*S/side, (y-sy1)*S/side)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fx = (x - sx1) * S / side, fy = (y - sy1) * S / side;
      const di = (y * W + x) * 3;
      if (fx < 0 || fy < 0 || fx >= S - 1 || fy >= S - 1) { backB[di] = backB[di + 1] = backB[di + 2] = 0; continue; }
      const cxi = Math.floor(fx), cyi = Math.floor(fy), tx = fx - cxi, ty = fy - cyi;
      for (let c = 0; c < 3; c++) {
        const p00 = restoredB[(cyi * S + cxi) * 3 + c], p01 = restoredB[(cyi * S + cxi + 1) * 3 + c];
        const p10 = restoredB[((cyi + 1) * S + cxi) * 3 + c] ?? p00, p11 = restoredB[((cyi + 1) * S + cxi + 1) * 3 + c] ?? p01;
        const a = p00 + (p01 - p00) * tx, b = p10 + (p11 - p10) * tx;
        backB[di + c] = clamp(a + (b - a) * ty, 0, 255);
      }
    }
  }
  const alignedB = Buffer.alloc(N * 3);
  warpAffine(backB, W, H, S, S, Mi, alignedB);

  // metrics in aligned space, mouth region
  const mx0 = Math.round(0.30 * S), mx1 = Math.round(0.70 * S);
  const my0 = Math.round(0.62 * S), my1 = Math.round(0.86 * S);
  const gRef = gray(alignedRef), gA = gray(restoredA), gB = gray(alignedB), gBlur = gray(blurryA);
  console.log('=== ALIGNED vs NAIVE-CROP restoration (aligned space, mouth region) ===');
  console.log(`edge top1%   blurry input      : ${edgeStrength(gBlur, mx0, my0, mx1, my1).toFixed(1)}`);
  console.log(`edge top1%   restored ALIGNED  : ${edgeStrength(gA, mx0, my0, mx1, my1).toFixed(1)}`);
  console.log(`edge top1%   restored NAIVE    : ${edgeStrength(gB, mx0, my0, mx1, my1).toFixed(1)}`);
  console.log(`full PSNR    restored ALIGNED vs sharp : ${psnr(restoredA, alignedRef).toFixed(2)} dB`);
  console.log(`full PSNR    restored NAIVE   vs sharp : ${psnr(alignedB, alignedRef).toFixed(2)} dB`);

  fs.writeFileSync(`${MODELS}/naive_restored_frame.ppm`, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`, 'ascii'), backB]));
  fs.writeFileSync(`${MODELS}/aligned_restored_frame.ppm`, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`, 'ascii'), backA]));
}
main().catch(e => { console.error(e); process.exit(1); });
