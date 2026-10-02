#!/usr/bin/env node
/** qa-gfpgan2.js — benchmark threads + deblur capability test */
'use strict';
const fs = require('fs');
const path = require('path');
const { InferenceSession, Tensor } = require('onnxruntime-node');

const MODEL = '/tmp/rh-models/gfpgan_1.4.onnx';
const HOST = path.join(__dirname, '..', 'resources', 'hosts', 'host_m_asia.mp4');
const FFMPEG = (() => {
  try {
    let p = require('@ffmpeg-installer/ffmpeg').path;
    if (p.includes('.asar')) p = p.replace('app.asar', 'app.asar.unpacked');
    return p;
  } catch { return 'ffmpeg'; }
})();
const S = 512, N = S * S;
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
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
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('decode'))));
    p.on('error', reject);
  });
}
function grad(buf) {
  let e = 0, n = 0;
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const i = (y * S + x) * 3;
    const l = (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
    const lr = (buf[i + 3] + buf[i + 4] + buf[i + 5]) / 3;
    const ld = (buf[i + S * 3] + buf[i + S * 3 + 1] + buf[i + S * 3 + 2]) / 3;
    e += Math.abs(l - lr) + Math.abs(l - ld); n++;
  }
  return e / n;
}
function toTensor(img) {
  const x = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    x[i] = img[i * 3] / 127.5 - 1;
    x[N + i] = img[i * 3 + 1] / 127.5 - 1;
    x[2 * N + i] = img[i * 3 + 2] / 127.5 - 1;
  }
  return new Tensor('float32', x, [1, 3, S, S]);
}
function fromTensor(d) {
  const buf = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) {
    buf[i * 3] = clamp((d[i] + 1) * 127.5, 0, 255);
    buf[i * 3 + 1] = clamp((d[N + i] + 1) * 127.5, 0, 255);
    buf[i * 3 + 2] = clamp((d[2 * N + i] + 1) * 127.5, 0, 255);
  }
  return buf;
}

(async () => {
  // face crop at 512
  const W = 720, H = 1280;
  const frame = await grabFirstFrame(HOST, W, H);
  const side = 470, sx = Math.floor((W - side) / 2), sy = Math.floor(H * 0.18);
  const img = Buffer.alloc(N * 3);
  resizeTo(frame, W, H, sx, sy, side, side, S, S, img);

  // simulate wav2lip blur: downscale to 96 then back up (exactly the pipeline's softness)
  const tiny = Buffer.alloc(96 * 96 * 3);
  resizeTo(img, S, S, 0, 0, S, S, 96, 96, tiny);
  const blurry = Buffer.alloc(N * 3);
  resizeTo(tiny, 96, 96, 0, 0, 96, 96, S, S, blurry);

  console.log('detail energy: original=%s blurry(96up)=%s', grad(img).toFixed(2), grad(blurry).toFixed(2));

  for (const threads of [4, 8]) {
    const sess = await InferenceSession.create(MODEL, {
      graphOptimizationLevel: 'all', executionMode: 'sequential', intraOpNumThreads: threads,
    });
    // warm + benchmark on blurry input
    let out = await sess.run({ input: toTensor(blurry) });
    const t0 = Date.now();
    const runs = 3;
    for (let r = 0; r < runs; r++) out = await sess.run({ input: toTensor(blurry) });
    const ms = (Date.now() - t0) / runs;
    const d = Object.values(out)[0].data;
    const restored = fromTensor(d);
    console.log(`threads=${threads}: ${ms.toFixed(0)}ms/frame | blurry=${grad(blurry).toFixed(2)} -> restored=${grad(restored).toFixed(2)} (x${(grad(restored) / grad(blurry)).toFixed(2)})`);
    // dump for visual check
    if (threads === 4) {
      const hdr = (w, h) => Buffer.from(`P6\n${w} ${h}\n255\n`, 'ascii');
      fs.writeFileSync('/tmp/rh-models/deblur_in.ppm', Buffer.concat([hdr(S, S), blurry]));
      fs.writeFileSync('/tmp/rh-models/deblur_out.ppm', Buffer.concat([hdr(S, S), restored]));
      fs.writeFileSync('/tmp/rh-models/deblur_ref.ppm', Buffer.concat([hdr(S, S), img]));
    }
  }
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
