#!/usr/bin/env node
// Quick skin-blob scan below the face to find hand-raise moments in host videos.
'use strict';
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileP = promisify(execFile);
const path = require('path');
const AGENT = path.join(__dirname, '..');
const FFMPEG = require(path.join(AGENT, 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path;
const W = 720, H = 1280;

async function frames(file, times) {
  const out = [];
  for (const t of times) {
    const { stdout } = await execFileP(FFMPEG, ['-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
    out.push({ t, g: Buffer.from(stdout) });
  }
  return out;
}

// skin mask via YCbCr rule; count blobs in left/right bands below y=700 (torso center excluded)
function skinStats(g) {
  const counts = { left: 0, right: 0 };
  for (let y = 700; y < H - 40; y += 2) {
    for (let x = 20; x < W - 20; x += 2) {
      const i = (y * W + x) * 3;
      const r = g[i], gg = g[i + 1], b = g[i + 2];
      const cb = 128 - 0.168736 * r - 0.331264 * gg + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * gg - 0.081312 * b;
      if (cb >= 77 && cb <= 133 && cr >= 133 && cr <= 180 && r > 70 && r > b) {
        if (x < W * 0.42) counts.left++; else if (x > W * 0.58) counts.right++;
      }
    }
  }
  return counts;
}

(async () => {
  for (const host of process.argv.slice(2)) {
    const file = path.join(AGENT, 'resources', 'hosts', host + '.mp4');
    const times = [];
    for (let t = 0.2; t < 10; t += 0.4) times.push(+t.toFixed(1));
    const fs = await frames(file, times);
    console.log(`\n=== ${host} ===`);
    for (const f of fs) {
      const s = skinStats(f.g);
      const total = s.left + s.right;
      if (total > 40) console.log(`t=${f.t.toFixed(1)}s skinPx L=${s.left} R=${s.right}`);
    }
  }
})();
