// QA: does the HOST template video's mouth move? (leak-through check)
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const FF = require(path.join(__dirname, '..', 'node_modules/@ffmpeg-installer/ffmpeg')).path;

const video = process.argv[2] || path.join(__dirname, '..', 'resources/hosts/host_m_asia.mp4');
const crop = process.argv[3] || '76:60:340:425'; // mouth region (same as output QA)

const buf = execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', video,
  '-vf', `fps=24,scale=720:1280,crop=${crop}`, '-pix_fmt', 'gray', '-f', 'rawvideo', '-'],
  { maxBuffer: 256 * 1024 * 1024 });
const [FW, FH] = crop.split(':').map(Number);
const N = Math.floor(buf.length / (FW * FH));
const darks = [];
for (let f = 0; f < Math.min(N, 600); f++) {
  const off = f * FW * FH;
  const px = [];
  for (let i = 0; i < FW * FH; i += 2) px.push(buf[off + i]);
  px.sort((a, b) => a - b);
  const k = Math.max(4, Math.floor(px.length * 0.15));
  darks.push(px.slice(0, k).reduce((a, b) => a + b, 0) / k);
}
const mean = darks.reduce((a, b) => a + b, 0) / darks.length;
const spread = Math.max(...darks) - Math.min(...darks);
const std = Math.sqrt(darks.reduce((a, b) => a + (b - mean) ** 2, 0) / darks.length);
console.log(`host: ${path.basename(video)} frames=${Math.min(N, 600)}`);
console.log(`HOST MOUTH dark spread=${spread.toFixed(1)} std=${std.toFixed(2)} (spread>15 = template talks)`);
console.log('per-frame:', darks.map((d) => d.toFixed(0)).join(' '));
