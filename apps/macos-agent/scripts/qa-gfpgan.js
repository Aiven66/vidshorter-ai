#!/usr/bin/env node
/**
 * qa-gfpgan.js — v0.9.46 GFPGAN integration QA
 *
 * 1. Inspect the gfpgan_1.4.onnx export: input/output names & dims
 * 2. Empirically determine the input normalization convention by running a
 *    REAL host face through three candidate scales and comparing output
 *    sanity (range) + detail energy (gradient magnitude) + identity (mean
 *    absolute difference vs input)
 * 3. Benchmark per-frame inference time (M-series CPU)
 * 4. Dump a before/after PNG pair for visual inspection
 *
 * Usage: node scripts/qa-gfpgan.js [modelPath] [hostVideo]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { InferenceSession, Tensor } = require('onnxruntime-node');

const MODEL = process.argv[2] || '/tmp/rh-models/gfpgan_1.4.onnx';
const HOST = process.argv[3] || path.join(__dirname, '..', 'resources', 'hosts', 'host_m_asia.mp4');
const FFMPEG = (() => {
  try {
    let p = require('@ffmpeg-installer/ffmpeg').path;
    if (p.includes('.asar')) p = p.replace('app.asar', 'app.asar.unpacked');
    return p;
  } catch { return 'ffmpeg'; }
})();

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// nearest/bilinear resize src(sw*sh rgb) -> dst(dw*dh), bilinear
function resizeTo(src, srcW, srcH, sx, sy, sw, sh, dstW, dstH, dst) {
  for (let y = 0; y < dstH; y++) {
    const fy = Math.min(sh - 1, (y + 0.5) * sh / dstH - 0.5);
    const cy = Math.min(sh - 1, Math.max(0, Math.round(fy)));
    const ty = fy - cy;
    const cy1 = Math.min(sh - 1, cy + 1);
    for (let x = 0; x < dstW; x++) {
      const fx = Math.min(sw - 1, (x + 0.5) * sw / dstW - 0.5);
      const cx = Math.min(sw - 1, Math.max(0, Math.round(fx)));
      const tx = fx - cx;
      const cx1 = Math.min(sw - 1, cx + 1);
      const di = (y * dstW + x) * 3;
      for (let c = 0; c < 3; c++) {
        const p00 = src[((sy + cy) * srcW + sx + cx) * 3 + c];
        const p01 = src[((sy + cy) * srcW + sx + cx1) * 3 + c];
        const p10 = src[((sy + cy1) * srcW + sx + cx) * 3 + c];
        const p11 = src[((sy + cy1) * srcW + sx + cx1) * 3 + c];
        const a = p00 + (p01 - p00) * tx;
        const b = p10 + (p11 - p10) * tx;
        dst[di + c] = clamp(a + (b - a) * ty, 0, 255);
      }
    }
  }
  return dst;
}

async function grabFirstFrame(file, w, h) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    const p = require('child_process').spawn(FFMPEG, ['-i', file, '-vf', `scale=${w}:${h}`, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.on('data', (c) => chunks.push(c));
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('frame decode'))));
    p.on('error', reject);
  });
}

function gradientEnergy(buf, w, h) {
  // mean |dx| + |dy| over luma — proxy for high-frequency detail
  let e = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 3;
      const l = (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
      const lr = (buf[i + 3] + buf[i + 4] + buf[i + 5]) / 3;
      const ld = (buf[i + w * 3] + buf[i + w * 3 + 1] + buf[i + w * 3 + 2]) / 3;
      e += Math.abs(l - lr) + Math.abs(l - ld);
      n++;
    }
  }
  return e / n;
}

function writePngGrayStub() {} // not needed — dump raw PPM instead

function writePPM(file, buf, w, h) {
  const header = Buffer.from(`P6\n${w} ${h}\n255\n`, 'ascii');
  fs.writeFileSync(file, Buffer.concat([header, buf]));
}

(async () => {
  if (!fs.existsSync(MODEL)) { console.error('model not found:', MODEL); process.exit(1); }
  console.log('== loading', MODEL);
  const sess = await InferenceSession.create(MODEL, {
    graphOptimizationLevel: 'all',
    executionMode: 'sequential',
    intraOpNumThreads: Math.min(4, require('os').cpus().length),
  });
  console.log('inputs :', sess.inputNames, JSON.stringify(sess.inputMetadata || {}));
  console.log('outputs:', sess.outputNames);

  // probe input dims with a dummy tensor
  const probe = {};
  const inName = sess.inputNames[0];
  // try 512 first
  let dims = null;
  for (const cand of [[1, 3, 512, 512], [1, 3, 256, 256], [1, 512, 512, 3]]) {
    try {
      const n = cand.reduce((a, b) => a * b, 1);
      probe[inName] = new Tensor('float32', new Float32Array(n), cand);
      const out = await sess.run(probe);
      const t = Object.values(out)[0];
      dims = cand;
      console.log(`probe OK for dims ${JSON.stringify(cand)} -> output dims ${JSON.stringify(t.dims)}`);
      break;
    } catch (e) {
      console.log(`probe failed for ${JSON.stringify(cand)}: ${String(e.message).slice(0, 120)}`);
    }
  }
  if (!dims) { console.error('could not determine input dims'); process.exit(1); }
  const S = dims[2], CHW = dims.length === 4 && dims[1] === 3;
  if (!CHW) { console.error('HWC layout unexpected — needs code adjustment'); process.exit(1); }

  // grab a real face crop
  const W = 720, H = 1280;
  const frame = await grabFirstFrame(HOST, W, H);
  if (frame.length < W * H * 3) { console.error('frame decode short'); process.exit(1); }
  // centered-ish face square (host presenters are centered) — 470px crop
  const side = 470, sx = Math.floor((W - side) / 2), sy = Math.floor(H * 0.18);
  const face = Buffer.alloc(side * side * 3);
  resizeTo(frame, W, H, sx, sy, side, side, side, side, face);

  // upscale to S
  const img = Buffer.alloc(S * S * 3);
  resizeTo(face, side, side, 0, 0, side, side, S, S, img);
  writePPM('/tmp/rh-models/face_input.ppm', img, S, S);

  const N = S * S;
  const variants = {
    'minus1to1 (x/127.5-1)': (v) => v / 127.5 - 1,
    '0to1 (x/255)': (v) => v / 255,
    'raw0to255': (v) => v,
  };

  for (const [label, fn] of Object.entries(variants)) {
    const x = new Float32Array(3 * N);
    for (let i = 0; i < N; i++) {
      x[i] = fn(img[i * 3]);
      x[N + i] = fn(img[i * 3 + 1]);
      x[2 * N + i] = fn(img[i * 3 + 2]);
    }
    const feed = {};
    feed[inName] = new Tensor('float32', x, dims);
    const t0 = Date.now();
    const out = await sess.run(feed);
    const dt = Date.now() - t0;
    const t = Object.values(out)[0];
    const d = t.data;
    // stats
    let mn = Infinity, mx = -Infinity, sum = 0;
    for (let i = 0; i < d.length; i++) { mn = Math.min(mn, d[i]); mx = Math.max(mx, d[i]); sum += d[i]; }
    console.log(`\n-- variant "${label}": ${dt}ms  out[min=${mn.toFixed(3)} max=${mx.toFixed(3)} mean=${(sum / d.length).toFixed(3)}]`);
    // decode assuming same normalization as input
    const dec = Buffer.alloc(N * 3);
    const inv = { 'minus1to1 (x/127.5-1)': (v) => (v + 1) * 127.5, '0to1 (x/255)': (v) => v * 255, 'raw0to255': (v) => v }[label];
    for (let i = 0; i < N; i++) {
      dec[i * 3] = clamp(inv(d[i]), 0, 255);
      dec[i * 3 + 1] = clamp(inv(d[N + i]), 0, 255);
      dec[i * 3 + 2] = clamp(inv(d[2 * N + i]), 0, 255);
    }
    const eIn = gradientEnergy(img, S, S);
    const eOut = gradientEnergy(dec, S, S);
    // identity: MAD vs input
    let mad = 0;
    for (let i = 0; i < N * 3; i++) mad += Math.abs(dec[i] - img[i]);
    mad /= N * 3;
    console.log(`   detail energy: input=${eIn.toFixed(2)} output=${eOut.toFixed(2)} (ratio ${(eOut / eIn).toFixed(2)}), MAD vs input=${mad.toFixed(1)}`);
    writePPM(`/tmp/rh-models/face_out_${label.split(' ')[0]}.ppm`, dec, S, S);
  }

  // benchmark: 3 runs of the best-guess convention
  console.log('\n== benchmark (3 runs, minus1to1)');
  const x = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    x[i] = img[i * 3] / 127.5 - 1;
    x[N + i] = img[i * 3 + 1] / 127.5 - 1;
    x[2 * N + i] = img[i * 3 + 2] / 127.5 - 1;
  }
  for (let r = 0; r < 3; r++) {
    const t0 = Date.now();
    await sess.run({ [inName]: new Tensor('float32', x, dims) });
    console.log(`run ${r + 1}: ${Date.now() - t0}ms`);
  }
  console.log('\nDONE — inspect /tmp/rh-models/face_out_*.ppm (convert: ffmpeg -i in.ppm out.png)');
})().catch((e) => { console.error(e); process.exit(1); });
