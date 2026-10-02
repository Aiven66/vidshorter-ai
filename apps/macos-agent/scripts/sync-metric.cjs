/* Better sync metric: mouth-interior dark FRACTION per frame vs audio RMS envelope.
 * Usage: node scripts/sync-metric.cjs /tmp/rh-diag/base  (and v38) */
'use strict';
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FF = require(path.join(ROOT, 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path;
const OUT = process.argv[2] || '/tmp/rh-diag/base';
const W = 720, H = 1280, FPS = 24;

function main() {
  const outMp4 = path.join(OUT, 'video.mp4');
  const [fx1, fy1, fx2, fy2] = [191, 153, 545, 569]; // host_f_asia face box
  const fw = fx2 - fx1, fh = fy2 - fy1;
  const mw = Math.round(fw * 0.46), mh = Math.round(fh * 0.34);
  const mx = Math.round((fx1 + fx2) / 2 - mw / 2), my = Math.round(fy1 + fh * 0.76 - mh / 2);

  const raw = execFileSync(FF, ['-i', outMp4, '-vf', `fps=${FPS},crop=${mw}:${mh}:${mx}:${my}`, '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const nFrames = Math.floor(raw.length / (mw * mh));
  const openFrac = [];
  for (let f = 0; f < nFrames; f++) {
    const rows = [];
    for (let y = 0; y < mh; y++) {
      let s = 0, c = 0;
      for (let x = 3; x < mw - 3; x += 4) { s += raw[f * mw * mh + y * mw + x]; c++; }
      rows.push(s / c);
    }
    rows.sort((a, b) => a - b);
    let d = 0; for (let k = 0; k < 12; k++) d += rows[k];
    openFrac.push(d / 12);
  }

  const pcmBuf = execFileSync(FF, ['-i', outMp4, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const pcm = new Float32Array(pcmBuf.length / 4);
  for (let i = 0; i < pcm.length; i++) pcm[i] = pcmBuf.readFloatLE(i * 4);
  const spf = 16000 / FPS;
  const nA = Math.floor(pcm.length / spf);
  const rms = [];
  for (let f = 0; f < nA; f++) { let s = 0; for (let i = 0; i < spf; i++) { const v = pcm[(f * spf + i) | 0]; s += v * v; } rms.push(Math.sqrt(s / spf)); }

  const n = Math.min(openFrac.length, rms.length);
  const z = (a) => { const m = a.slice(0, n).reduce((x, y) => x + y, 0) / n; const sd = Math.sqrt(a.slice(0, n).reduce((x, y) => x + (y - m) ** 2, 0) / n) || 1; return a.slice(0, n).map((v) => (v - m) / sd); };
  const ozRaw = openFrac.slice(0, n).map((v) => -v);
  const oz = z(ozRaw), rz = z(rms);
  const sm = (a) => a.map((_, i) => (a[Math.max(0, i - 1)] + a[i] + a[Math.min(n - 1, i + 1)]) / 3);
  const ozS = sm(oz), rzS = sm(rz);
  let bestLag = 0, bestScore = -2; const scores = {};
  for (let L = -10; L <= 10; L++) {
    let s = 0, c = 0;
    for (let t = Math.max(0, L); t < Math.min(n, n + L); t++) { s += ozS[t] * rzS[t - L]; c++; }
    const v = c > 12 ? s / c : -2;
    scores[L] = +v.toFixed(3);
    if (v > bestScore) { bestScore = v; bestLag = L; }
  }
  console.log(`[${path.basename(OUT)}] openFrac[0..48]:`, openFrac.slice(0, 48).map((v) => v.toFixed(0)).join(','));
  console.log(`[${path.basename(OUT)}] rms[0..48]:      `, rms.slice(0, 48).map((v) => v.toFixed(3)).join(','));
  console.log(`[${path.basename(OUT)}] corr(smoothed):`, JSON.stringify(scores));
  console.log(`[${path.basename(OUT)}] BEST LAG = ${bestLag} frames (${(bestLag / FPS * 1000).toFixed(0)}ms; positive = mouth LEADS audio) score=${bestScore.toFixed(3)}`);
}
main();
