#!/usr/bin/env node
// Motion-energy scan: hands moving in the lower frame create temporal change;
// static studio background does not. Report per-region motion over time.
'use strict';
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileP = promisify(execFile);
const path = require('path');
const AGENT = path.join(__dirname, '..');
const FFMPEG = require(path.join(AGENT, 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path;
const W = 720, H = 1280;

async function allFrames(file, fps = 6) {
  const { stdout } = await execFileP(FFMPEG, ['-i', file, '-vf', `fps=${fps},scale=${W}:${H}`, '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  return Buffer.from(stdout);
}

function motion(g, i0, i1, x1, x2, y1, y2) {
  let sum = 0, n = 0;
  for (let y = y1; y < y2; y += 2) {
    for (let x = x1; x < x2; x += 2) {
      sum += Math.abs(g[i0 + y * W + x] - g[i1 + y * W + x]);
      n++;
    }
  }
  return sum / Math.max(1, n);
}

(async () => {
  for (const host of process.argv.slice(2)) {
    const file = path.join(AGENT, 'resources', 'hosts', host + '.mp4');
    const g = await allFrames(file);
    const fcount = Math.floor(g.length / (W * H));
    const bands = {
      'lower-left': [0, Math.round(W * 0.45), 700, H - 30],
      'lower-right': [Math.round(W * 0.55), W - 10, 700, H - 30],
      'face-area': [Math.round(W * 0.25), Math.round(W * 0.75), 200, 650],
    };
    console.log(`\n=== ${host} (${fcount} frames @6fps) ===`);
    const avgs = {};
    for (const k of Object.keys(bands)) avgs[k] = [];
    for (let f = 1; f < fcount; f++) {
      const i0 = (f - 1) * W * H, i1 = f * W * H;
      for (const [k, [x1, x2, y1, y2]] of Object.entries(bands)) {
        avgs[k].push(motion(g, i0, i1, x1, x2, y1, y2));
      }
    }
    for (const k of Object.keys(bands)) {
      const a = avgs[k];
      const mean = a.reduce((s, v) => s + v, 0) / a.length;
      const mx = Math.max(...a);
      console.log(`${k.padEnd(12)} mean=${mean.toFixed(2)} max=${mx.toFixed(2)} (face mean=${avgs['face-area'].reduce((s, v) => s + v, 0) / a.length | 0})`);
    }
  }
})();
