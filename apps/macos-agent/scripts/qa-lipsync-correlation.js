// QA: audio-energy ↔ mouth-motion cross-correlation (lip sync verification)
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const FF = require(path.join(__dirname, '..', 'node_modules/@ffmpeg-installer/ffmpeg')).path;

const video = process.argv[2] || '/tmp/rh_e2e_out.mp4';
const crop = process.argv[3] || '76:60:339:425'; // mouth region (use scripts/qa-autocrop.js)

// 1. mouth darkness per frame (24fps)
const vbuf = execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', video,
  '-vf', `fps=24,crop=${crop}`, '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 256 * 1024 * 1024 });
const [FW, FH] = crop.split(':').map(Number); // w:h:x:y — derive frame size from crop!
const N = Math.floor(vbuf.length / (FW * FH));
const darks = [];
for (let f = 0; f < N; f++) {
  const off = f * FW * FH;
  const px = [];
  for (let i = 0; i < FW * FH; i += 3) px.push(vbuf[off + i]);
  px.sort((a, b) => a - b);
  const k = Math.max(4, Math.floor(px.length * 0.2));
  darks.push(px.slice(0, k).reduce((a, b) => a + b, 0) / k);
}

// 2. audio RMS per 1/24s
const abuf = execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', video,
  '-ac', '1', '-ar', '24000', '-f', 'f32le', '-'], { maxBuffer: 256 * 1024 * 1024 });
const PCM = new Float32Array(abuf.buffer, abuf.byteOffset, Math.floor(abuf.length / 4));
const win = Math.round(24000 / 24);
const M = Math.floor(PCM.length / win);
const rms = [];
for (let i = 0; i < M; i++) {
  let s = 0;
  for (let j = 0; j < win; j++) { const v = PCM[i * win + j]; s += v * v; }
  rms.push(Math.sqrt(s / win));
}

// 3. normalize both, cross-correlate.
// NOTE: the mel window for frame t is [t, t+200ms) — mouth openness is driven
// by the audio energy AHEAD of the frame. So correlate mouth[t] against the
// 200ms forward-looking mean RMS (winRms), not the instantaneous value.
const WIN = Math.round(0.2 * 24); // 5 frames = 200ms
const winRms = rms.map((_, i) => {
  let s = 0, n = 0;
  for (let k = 0; k < WIN; k++) { if (i + k < rms.length) { s += rms[i + k]; n++; } }
  return s / (n || 1);
});
const L = Math.min(darks.length, winRms.length);
// audio is ahead-of/behind mouth? test lags -12..+12 frames (±500ms)
const norm = (a) => {
  const arr = a.slice(0, L);
  let mu = 0; for (const v of arr) mu += v; mu /= arr.length;
  let sd = 0; for (const v of arr) sd += (v - mu) ** 2; sd = Math.sqrt(sd / arr.length);
  return arr.map((v) => (v - mu) / (sd || 1));
};
const mouth = norm(darks); // darker = more open → invert so higher = more open
for (let i = 0; i < mouth.length; i++) mouth[i] = -mouth[i];
const audio = norm(winRms);

let bestLag = 0, bestR = -Infinity;
const results = [];
for (let lag = -12; lag <= 12; lag++) {
  let r = 0, n = 0;
  for (let t = 0; t < L; t++) {
    const ai = t + lag;
    if (ai < 0 || ai >= L) continue;
    r += audio[ai] * mouth[t]; n++;
  }
  r /= n || 1;
  results.push({ lag, r });
  if (r > bestR) { bestR = r; bestLag = lag; }
}
console.log('frames analyzed:', L, '(audio frames:', M + ')');
results.forEach((x) => console.log(`  lag ${x.lag >= 0 ? '+' : ''}${x.lag} (${(x.lag / 24 * 1000).toFixed(0)}ms): r=${x.r.toFixed(3)}`));
console.log(`\nBEST: lag ${bestLag} frames (${(bestLag / 24 * 1000).toFixed(0)}ms), r=${bestR.toFixed(3)}`);
console.log(bestR > 0.45 ? 'LIP SYNC: STRONG ✓' : bestR > 0.25 ? 'LIP SYNC: MODERATE' : 'LIP SYNC: WEAK ✗');
