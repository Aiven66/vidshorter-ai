/**
 * Quick lip-motion verification for rh_test1.mp4:
 * samples frames, detects the face once, then measures per-frame variance
 * of the mouth region (lower third of the face box). Real lip-sync => mouth
 * region pixel intensity fluctuates strongly across frames.
 * Usage: node scripts/check-mouth.js [videoPath]
 */
'use strict';
const { spawn } = require('child_process');
const { RealHumanEngine } = require('../real-human-engine');

const FF = require('@ffmpeg-installer/ffmpeg').path;
const VID = process.argv[2] || '/tmp/w2l/out/rh_test1.mp4';
const W = 720, H = 1280;
const N = 96; // 4s worth of frames sampled at 24fps

function sh(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = [];
    p.stdout.on('data', (d) => chunks.push(d));
    p.on('close', (c) => (c === 0 ? res(Buffer.concat(chunks)) : rej(new Error(cmd + ' exit ' + c))));
  });
}

async function main() {
  const engine = new RealHumanEngine({ modelsDir: process.env.RH_MODELS || '/tmp/w2l/models', ffmpegPath: FF });
  await engine.load();

  // extract N frames from t=2s (speech active)
  const raw = await sh(FF, ['-ss', '2', '-i', VID, '-frames:v', String(N), '-vf', 'fps=24,scale=720:1280', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
  const FRAME = W * H * 3;
  const frames = [];
  for (let i = 0; i < N; i++) frames.push(raw.subarray(i * FRAME, (i + 1) * FRAME));
  console.log('extracted', frames.length, 'frames');

  const det = await engine.detectFace(frames[0]);
  if (!det) { console.error('NO FACE DETECTED'); process.exit(1); }
  const box = Array.isArray(det.box) ? det.box : [det.box.x1, det.box.y1, det.box.x2, det.box.y2];
  console.log('face box:', JSON.stringify(box));

  // mouth region: central horizontal band at 62%-88% of face height
  const bx1 = box[0], by1 = box[1], bx2 = box[2], by2 = box[3];
  const fw = bx2 - bx1, fh = by2 - by1;
  const mx1 = Math.round(bx1 + fw * 0.28), mx2 = Math.round(bx2 - fw * 0.28);
  const my1 = Math.round(by1 + fh * 0.62), my2 = Math.round(by1 + fh * 0.88);

  const means = frames.map((f) => {
    let sum = 0, cnt = 0;
    for (let y = my1; y < my2; y += 2) {
      for (let x = mx1; x < mx2; x += 2) {
        const i = (y * W + x) * 3;
        sum += 0.299 * f[i] + 0.587 * f[i + 1] + 0.114 * f[i + 2];
        cnt++;
      }
    }
    return sum / cnt;
  });

  // frame-to-frame absolute delta of mouth-region mean intensity
  let deltas = [];
  for (let i = 1; i < means.length; i++) deltas.push(Math.abs(means[i] - means[i - 1]));
  deltas.sort((a, b) => a - b);
  const med = deltas[Math.floor(deltas.length / 2)];
  const p90 = deltas[Math.floor(deltas.length * 0.9)];
  const spread = Math.max(...means) - Math.min(...means);
  console.log('mouth-region mean-intensity stats:');
  console.log('  median |Δ| =', med.toFixed(3), ' p90 |Δ| =', p90.toFixed(3), ' spread =', spread.toFixed(2));
  const lipMotion = med > 0.25 && spread > 3;
  console.log(lipMotion ? '✅ LIPS ARE MOVING (lip-sync active)' : '❌ mouth region nearly static — lip sync may be broken');

  // control: cheek region (should be far more static than the mouth)
  const cx1 = Math.round(bx1 + fw * 0.05), cx2 = Math.round(bx1 + fw * 0.2);
  const cy1 = Math.round(by1 + fh * 0.35), cy2 = Math.round(by1 + fh * 0.55);
  const cheek = frames.map((f) => {
    let s = 0, c = 0;
    for (let y = cy1; y < cy2; y += 3) for (let x = cx1; x < cx2; x += 3) {
      const i = (y * W + x) * 3;
      s += 0.299 * f[i] + 0.587 * f[i + 1] + 0.114 * f[i + 2]; c++;
    }
    return s / c;
  });
  let cd = [];
  for (let i = 1; i < cheek.length; i++) cd.push(Math.abs(cheek[i] - cheek[i - 1]));
  cd.sort((a, b) => a - b);
  console.log('cheek-region (control) median |Δ| =', cd[Math.floor(cd.length / 2)].toFixed(3));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
