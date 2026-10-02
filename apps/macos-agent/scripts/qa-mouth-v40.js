// QA: mouth-region luminance variance across frames (lip articulation proxy)
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const FF = require(path.join(__dirname, '..', 'node_modules/@ffmpeg-installer/ffmpeg')).path;

const video = process.argv[2] || '/tmp/rh_e2e_out.mp4';
const crop = process.argv[3] || '76:60:340:425'; // mouth region (use scripts/qa-autocrop.js)

const buf = execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', video,
  '-vf', `fps=24,select=not(mod(n\\,6)),crop=${crop}`, '-pix_fmt', 'gray', '-f', 'rawvideo', '-'],
  { maxBuffer: 128 * 1024 * 1024 });

const [FW, FH] = crop.split(':').map(Number); // derive frame size from crop
const N = Math.floor(buf.length / (FW * FH));
if (N < 4) { console.error('too few frames:', N); process.exit(1); }
const darks = [];
for (let f = 0; f < N; f++) {
  const off = f * FW * FH;
  const px = [];
  for (let i = 0; i < FW * FH; i += 5) px.push(buf[off + i]);
  px.sort((a, b) => a - b);
  // mean of darkest 20% = mouth interior darkness
  const k = Math.max(4, Math.floor(px.length * 0.2));
  darks.push(px.slice(0, k).reduce((a, b) => a + b, 0) / k);
}
const mean = darks.reduce((a, b) => a + b, 0) / darks.length;
const spread = Math.max(...darks) - Math.min(...darks);
const std = Math.sqrt(darks.reduce((a, b) => a + (b - mean) ** 2, 0) / darks.length);
console.log('frames:', N);
console.log('dark-frac per frame:', darks.map((d) => d.toFixed(0)).join(' '));
console.log(`SPREAD=${spread.toFixed(1)} STD=${std.toFixed(2)} (v1 ~12 / v2 ~30 reference)`);
