#!/usr/bin/env node
/** qa-gfpgan3.js — FFHQ-alignment test: does aligning the face before GFPGAN
 *  fix the soft restoration? Metrics: PSNR vs sharp ref + mouth LaplacianVar. */
'use strict';
const fs = require('fs');
const path = require('path');
const { InferenceSession, Tensor } = require('onnxruntime-node');

const MODELS = '/tmp/rh-models';
const AGENT = '/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent';
const HOST = path.join(AGENT, 'resources', 'hosts', 'host_m_asia.mp4');
const FFMPEG = (() => { try { return require(path.join(AGENT, 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path; } catch { return 'ffmpeg'; } })();
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

/** inverse-map warp: dst(x,y) samples src at T(x,y) (affine 2x3) */
function warpAffine(src, srcW, srcH, dstW, dstH, m, dst) {
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const fx = m[0] * x + m[1] * y + m[2];
      const fy = m[3] * x + m[4] * y + m[5];
      const di = (y * dstW + x) * 3;
      if (fx < 0 || fy < 0 || fx >= srcW - 1 || fy >= srcH - 1) {
        dst[di] = 0; dst[di + 1] = 0; dst[di + 2] = 0;
        continue;
      }
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

/** least-squares similarity transform mapping src[] -> dst[] (2d points).
 *  returns [a,b,tx,c,d,ty] such that dst ≈ [a -b; b a] * src + t */
function similarity(src, dst) {
  // Umeyama-style: rotation via atan2 form, then uniform scale
  const n = src.length;
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let c = 0, s = 0, va = 0;
  for (let i = 0; i < n; i++) {
    const ax = src[i][0] - sx, ay = src[i][1] - sy;
    const bx = dst[i][0] - dx, by = dst[i][1] - dy;
    c += ax * bx + ay * by;   // cos numerator
    s += ay * bx - ax * by;   // sin numerator
    va += ax * ax + ay * ay;  // src variance
  }
  const r = Math.hypot(c, s);
  if (r === 0 || va === 0) return [1, 0, dx - sx, 0, 1, dy - sy];
  const sc = r / va;
  const cc = c / r, ss = s / r;
  const a = sc * cc, b = sc * ss;
  const tx = dx - (a * sx - b * sy), ty = dy - (b * sx + a * sy);
  return [a, -b, tx, b, a, ty];
}
function invAffine(m) {
  const det = m[0] * m[4] - m[1] * m[3];
  const ia = m[4] / det, ib = -m[1] / det, ic = (m[1] * m[5] - m[4] * m[2]) / det;
  const id = -m[3] / det, ie = m[0] / det, iff = (m[3] * m[2] - m[0] * m[5]) / det;
  return [ia, ib, ic, id, ie, iff];
}

async function detectFaceYolo(sess, frame) {
  // letterbox 720x1280 -> 640x640
  const LB = 640;
  const lb = Buffer.alloc(LB * LB * 3);
  const scale = Math.min(LB / W, LB / H);
  const dw = Math.round(W * scale), dh = Math.round(H * scale);
  const ox = Math.floor((LB - dw) / 2), oy = Math.floor((LB - dh) / 2);
  resizeTo(frame, W, H, 0, 0, W, H, dw, dh, lb.subarray(oy * LB * 3 + ox * 3).length ? (dst) => dst : lb); // placeholder
  // do it manually: resize into region
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const fy = Math.min(H - 1, Math.round((y + 0.5) * H / dh - 0.5));
    const fx = Math.min(W - 1, Math.round((x + 0.5) * W / dw - 0.5));
    const si = (fy * W + fx) * 3, di = ((oy + y) * LB + ox + x) * 3;
    lb[di] = frame[si]; lb[di + 1] = frame[si + 1]; lb[di + 2] = frame[si + 2];
  }
  // 1/255 normalize, CHW, RGB (engine uses rgb frame; yolo trained on ... assume rgb)
  const x = new Float32Array(3 * LB * LB);
  for (let i = 0; i < LB * LB; i++) {
    x[i] = lb[i * 3] / 255; x[LB * LB + i] = lb[i * 3 + 1] / 255; x[2 * LB * LB + i] = lb[i * 3 + 2] / 255;
  }
  const out = await sess.run({ input: new Tensor('float32', x, [1, 3, LB, LB]) });
  const t = out.output || Object.values(out)[0];
  const d = t.data; // (1,20,8400) for yolov8-face? inspect dims
  // assumes (1, 20, 8400): [x,y,w,h,conf,5*kps...]
  const C = t.dims[1], A = t.dims[2];
  let best = -1, bestConf = 0;
  for (let a = 0; a < A; a++) {
    const conf = d[4 * A + a];
    if (conf > bestConf) { bestConf = conf; best = a; }
  }
  if (best < 0) return null;
  const cx = d[0 * A + best], cy = d[1 * A + best], w = d[2 * A + best], h = d[3 * A + best];
  // back to frame coords
  const bx1 = (cx - w / 2 - ox) / scale, by1 = (cy - h / 2 - oy) / scale;
  const bx2 = (cx + w / 2 - ox) / scale, by2 = (cy + h / 2 - oy) / scale;
  // C=20: 4 box + 1 conf + 5 landmarks × (x, y, conf)
  let kps = null;
  if (C === 20) {
    kps = [];
    for (let k = 0; k < 5; k++) {
      kps.push([d[(5 + k * 3) * A + best], d[(6 + k * 3) * A + best], d[(7 + k * 3) * A + best]]);
    }
  }
  return { box: [bx1, by1, bx2, by2], conf: bestConf, kps, C, A };
}

async function main() {
  const frame = await new Promise((res, rej) => {
    const chunks = [];
    const p = require('child_process').spawn(FFMPEG, ['-i', HOST, '-vf', `scale=${W}:${H}`, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.on('data', c => chunks.push(c));
    p.on('close', c => c === 0 ? res(Buffer.concat(chunks)) : rej(new Error('decode')));
    p.on('error', rej);
  });

  const yoloPaths = [
    path.join(AGENT, 'models', 'yoloface_8n.onnx'),
    path.join(process.env.HOME, 'Library/Application Support/clipop-macos-agent/realhuman-models/yoloface_8n.onnx'),
  ].filter(p => fs.existsSync(p));
  const yolo = await InferenceSession.create(yoloPaths[0], { intraOpNumThreads: 4 });
  let det = await detectFaceYolo(yolo, frame);
  console.log('yolo det:', JSON.stringify(det));
  if (!det) throw new Error('no face');

  // 5 landmarks: prefer yolo kps (mapped back), else estimate from box
  let src5;
  const scale = Math.min(640 / W, 640 / H);
  const ox = Math.floor((640 - Math.round(W * scale)) / 2), oy = Math.floor((640 - Math.round(H * scale)) / 2);
  if (det.kps && det.kps.every(p => p[2] > 0.3)) {
    src5 = det.kps.map(p => [(p[0] - ox) / scale, (p[1] - oy) / scale]);
    console.log('using yolo 5-kps landmarks:', JSON.stringify(src5));
  } else {
    const [x1, y1, x2, y2] = det.box;
    const fw = x2 - x1, fh = y2 - y1;
    src5 = [
      [x1 + 0.32 * fw, y1 + 0.42 * fh],
      [x1 + 0.68 * fw, y1 + 0.42 * fh],
      [x1 + 0.50 * fw, y1 + 0.58 * fh],
      [x1 + 0.40 * fw, y1 + 0.74 * fh],
      [x1 + 0.60 * fw, y1 + 0.74 * fh],
    ];
    console.log('using box-estimated landmarks:', JSON.stringify(src5));
  }

  // FFHQ 512 template (facexlib)
  const FFHQ = [
    [0.37691676 * S, 0.46864664 * S],
    [0.62285697 * S, 0.46912813 * S],
    [0.50123859 * S, 0.61331904 * S],
    [0.39308822 * S, 0.73741159 * S],
    [0.61141959 * S, 0.73744358 * S],
  ];
  const M = similarity(src5, FFHQ);        // frame -> aligned512
  const Mi = invAffine(M);                 // aligned512 -> frame

  // aligned sharp reference + aligned blurry input
  // warpAffine is an inverse-map warp: dst(x,y) samples src at T(x,y),
  // so it needs the ALIGNED->FRAME transform (Mi), not M (frame->aligned).
  const aligned = Buffer.alloc(N * 3);
  warpAffine(frame, W, H, S, S, Mi, aligned);
  const tiny = Buffer.alloc(96 * 96 * 3);
  resizeTo(aligned, S, S, 0, 0, S, S, 96, 96, tiny);
  const blurry = Buffer.alloc(N * 3);
  resizeTo(tiny, 96, 96, 0, 0, 96, 96, S, S, blurry);

  // run gfpgan on aligned blurry
  const gf = await InferenceSession.create(path.join(MODELS, 'gfpgan_1.4.onnx'), { intraOpNumThreads: 4 });
  const x = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    x[i] = blurry[i * 3] / 127.5 - 1;
    x[N + i] = blurry[i * 3 + 1] / 127.5 - 1;
    x[2 * N + i] = blurry[i * 3 + 2] / 127.5 - 1;
  }
  const t0 = Date.now();
  const out = await gf.run({ input: new Tensor('float32', x, [1, 3, S, S]) });
  console.log(`gfpgan: ${Date.now() - t0}ms`);
  const d = Object.values(out)[0].data;
  const restored = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) {
    restored[i * 3] = clamp((d[i] + 1) * 127.5, 0, 255);
    restored[i * 3 + 1] = clamp((d[N + i] + 1) * 127.5, 0, 255);
    restored[i * 3 + 2] = clamp((d[2 * N + i] + 1) * 127.5, 0, 255);
  }

  // save ppms + metrics in ALIGNED space
  const hdr = Buffer.from(`P6\n${S} ${S}\n255\n`, 'ascii');
  fs.writeFileSync(`${MODELS}/al_ref.ppm`, Buffer.concat([hdr, aligned]));
  fs.writeFileSync(`${MODELS}/al_blurry.ppm`, Buffer.concat([hdr, blurry]));
  fs.writeFileSync(`${MODELS}/al_restored.ppm`, Buffer.concat([hdr, restored]));
  console.log('saved aligned ref/blurry/restored');
}
main().catch(e => { console.error(e); process.exit(1); });
