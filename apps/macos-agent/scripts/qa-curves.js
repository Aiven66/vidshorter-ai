// QA: print per-frame mouth-openness + audio-RMS curves side by side
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const FF = require(path.join(__dirname, '..', 'node_modules/@ffmpeg-installer/ffmpeg')).path;

const video = process.argv[2] || '/tmp/rh_e2e_out.mp4';
const crop = process.argv[3] || '76:60:339:425';

const vbuf = execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', video,
  '-vf', `fps=24,crop=${crop}`, '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 256 * 1024 * 1024 });
const [FW, FH] = crop.split(':').map(Number);
const N = Math.floor(vbuf.length / (FW * FH));
const darks = [];
for (let f = 0; f < N; f++) {
  const off = f * FW * FH;
  const px = [];
  for (let i = 0; i < FW * FH; i += 2) px.push(vbuf[off + i]);
  px.sort((a, b) => a - b);
  const k = Math.max(4, Math.floor(px.length * 0.15));
  darks.push(px.slice(0, k).reduce((a, b) => a + b, 0) / k);
}

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

// downsample print: group by 3 frames (125ms)
const bars = (v, max) => '#'.repeat(Math.round(v / max * 24));
const dMax = Math.max(...darks), dMin = Math.min(...darks);
const rMax = Math.max(...rms);
console.log(`frames: ${N} audio: ${M} | dark range ${dMin.toFixed(0)}-${dMax.toFixed(0)} rms max ${rMax.toFixed(3)}`);
console.log('t(s)  dark open%   rms  | mouth-bar (open) | audio-bar');
for (let g = 0; g < Math.min(N, M); g += 3) {
  const d = (darks[g] - dMin) / (dMax - dMin || 1); // 0=dark(open) 1=light(closed)
  const open = 1 - d;
  const r = rms[g] / (rMax || 1);
  console.log(
    String((g / 24).toFixed(2)).padStart(5),
    darks[g].toFixed(0).padStart(4),
    (open * 100).toFixed(0).padStart(4) + '%',
    rms[g].toFixed(3).padStart(5),
    '|' + bars(open, 1).padEnd(24) + '|' + bars(r, 1)
  );
}
