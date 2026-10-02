#!/usr/bin/env node
/** qa-align-roundtrip.js — verify the v0.9.46 GFPGAN FFHQ alignment warp:
 *  align frame -> FFHQ-512, treat the aligned image as the "restoration",
 *  warp back to crop size, and compare against a direct crop resize.
 *  Round-trip error must be small (bilinear resampling only). Also verifies
 *  the kps->matrix composition used inside processFrame. */
'use strict';
const path = require('path');
const { RealHumanEngine } = require(path.join(__dirname, '..', 'real-human-engine.js'));

const W = 720, H = 1280, GFDIM = 512;
const crop = { sx1: 120, sy1: 260, side: 400 };

// synthetic frame: smooth gradients + grid lines so warp error is visible
const frame = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    frame[i] = (x * 255 / W) | 0;
    frame[i + 1] = (y * 255 / H) | 0;
    frame[i + 2] = ((x + y) * 127 / (W + H)) | 0;
    if (!process.env.NOGRID && (x % 40 === 0 || y % 40 === 0)) { frame[i] = 255; frame[i + 1] = 255; frame[i + 2] = 255; }
  }
}

// engine internals (module-level helpers are not exported; re-derive the same
// math the engine uses, via the engine's own prototype paths where possible)
const eng = new RealHumanEngine({ modelsDir: '/tmp/rh-models' });

// replicate processFrame's alignment-lock math using the engine's module
// helpers — they are file-scoped, so re-implement the tiny bits here and use
// engine methods for the actual warps (_alignFrame / _warpBackToCrop).
function similarityEst(src, dst) {
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
  if (r === 0 || va === 0) return [1, 0, dx - sx, 0, 1, dy - sy];
  const sc = r / va, cc = c / r, ss = s / r;
  const a = sc * cc, b = sc * ss;
  return [a, -b, dx - (a * sx - b * sy), b, a, dy - (b * sx + a * sy)];
}
function invAffine2x3(m) {
  const det = m[0] * m[4] - m[1] * m[3];
  if (!det) return [1, 0, 0, 0, 1, 0];
  return [
    m[4] / det, -m[1] / det, (m[1] * m[5] - m[4] * m[2]) / det,
    -m[3] / det, m[0] / det, (m[3] * m[2] - m[0] * m[5]) / det,
  ];
}

// synthetic kps: FFHQ template warped by a known rotation+scale into the crop
const FFHQ_TMPL = [
  [0.37691676, 0.46864664], [0.62285697, 0.46912813], [0.50123859, 0.61331904],
  [0.39308822, 0.73741159], [0.61141959, 0.73744358],
];
const rot = 0.12, k = 0.72; // 6.9° roll, face occupies 72% of crop
const kp = FFHQ_TMPL.map(([tx, ty]) => {
  const u = (tx - 0.5) * GFDIM, v = (ty - 0.5) * GFDIM;
  return [
    crop.sx1 + crop.side / 2 + (u * Math.cos(rot) - v * Math.sin(rot)) * k,
    crop.sy1 + crop.side / 2 + (u * Math.sin(rot) + v * Math.cos(rot)) * k,
  ];
});

// same composition as processFrame
const s512 = GFDIM / crop.side;
const src = kp.map(([px, py]) => [(px - crop.sx1) * s512, (py - crop.sy1) * s512]);
const dst = FFHQ_TMPL.map(([tx, ty]) => [tx * GFDIM, ty * GFDIM]);
const fwd = similarityEst(src, dst);
const inv = invAffine2x3(fwd);
const sOut = crop.side / GFDIM;
eng._gfWarpIn = [
  inv[0] * sOut, inv[1] * sOut, inv[2] * sOut + crop.sx1,
  inv[3] * sOut, inv[4] * sOut, inv[5] * sOut + crop.sy1,
];
const sIn = GFDIM / crop.side;
eng._gfWarpOut = [
  fwd[0] * sIn, fwd[1] * sIn, fwd[2],
  fwd[3] * sIn, fwd[4] * sIn, fwd[5],
];

// round-trip: align, then "restore" = identity, warp back
eng._alignFrame(frame, crop);
const aligned = Buffer.from(eng._gfSrc); // 512x512x3
eng._gfOut = Buffer.from(aligned);       // identity restoration
const back = eng._warpBackToCrop(crop.side);

// reference: direct bilinear crop of the same frame
function bilinearRef() {
  const out = Buffer.alloc(crop.side * crop.side * 3);
  for (let y = 0; y < crop.side; y++) {
    for (let x = 0; x < crop.side; x++) {
      const fx = crop.sx1 + (x + 0.5) - 0.5, fy = crop.sy1 + (y + 0.5) - 0.5;
      const x0 = Math.max(0, Math.min(W - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(H - 1, Math.floor(fy)));
      const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
      const dx = fx - x0, dy = fy - y0;
      const i00 = (y0 * W + x0) * 3, i10 = (y0 * W + x1) * 3, i01 = (y1 * W + x0) * 3, i11 = (y1 * W + x1) * 3;
      const di = (y * crop.side + x) * 3;
      for (let c = 0; c < 3; c++) {
        const t = frame[i00 + c] * (1 - dx) + frame[i10 + c] * dx;
        const b = frame[i01 + c] * (1 - dx) + frame[i11 + c] * dx;
        out[di + c] = Math.max(0, Math.min(255, t * (1 - dy) + b * dy));
      }
    }
  }
  return out;
}
const ref = bilinearRef();

// compare only the central face region (avoid edge-clamp zones)
let sum = 0, cnt = 0, mx = 0;
const m0 = Math.round(crop.side * 0.15), m1 = crop.side - m0;
for (let y = m0; y < m1; y++) {
  for (let x = m0; x < m1; x++) {
    const i = (y * crop.side + x) * 3;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(back[i + c] - ref[i + c]);
      sum += d; cnt++;
      if (d > mx) mx = d;
    }
  }
}
const mean = sum / cnt;
console.log(`round-trip meanAbsDiff=${mean.toFixed(2)} maxAbsDiff=${mx} (samples=${cnt})`);
console.log(mean < 3.0 && mx < 40 ? 'RESULT: OK' : 'RESULT: FAIL');

// also verify the aligned image actually differs from a naive resize (else
// the warp matrices collapsed to identity)
function naiveAlign() {
  const out = Buffer.alloc(GFDIM * GFDIM * 3);
  for (let y = 0; y < GFDIM; y++) {
    for (let x = 0; x < GFDIM; x++) {
      const fx = crop.sx1 + (x + 0.5) * crop.side / GFDIM - 0.5;
      const fy = crop.sy1 + (y + 0.5) * crop.side / GFDIM - 0.5;
      const x0 = Math.max(0, Math.min(W - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(H - 1, Math.floor(fy)));
      const di = (y * GFDIM + x) * 3, si = (y0 * W + x0) * 3;
      out[di] = frame[si]; out[di + 1] = frame[si + 1]; out[di + 2] = frame[si + 2];
    }
  }
  return out;
}
const naive = naiveAlign();
let nd = 0;
for (let i = 0; i < GFDIM * GFDIM * 3; i += 3) nd += Math.abs(aligned[i] - naive[i]);
console.log(`aligned-vs-naive meanDiff=${(nd / (GFDIM * GFDIM)).toFixed(2)} (>1 expected — warp is non-trivial)`);
