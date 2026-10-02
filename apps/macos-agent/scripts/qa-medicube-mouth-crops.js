// 仅抽嘴部帧（跳过完整合成 — 视频已生成在 /tmp/rh_visual_v46_out.mp4）
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = '/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent';
const ffmpegPath = require(path.join(ROOT, 'node_modules/@ffmpeg-installer/ffmpeg')).path;
const outPath = '/tmp/rh_visual_v46_out.mp4';
const DESK = os.homedir() + '/Desktop';
const W = 720, H = 1280;

function sh(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = [];
    p.stdout.on('data', (d) => chunks.push(d));
    p.on('close', (c) => (c === 0 ? res(Buffer.concat(chunks)) : rej(new Error(cmd + ' exit ' + c))));
  });
}

(async () => {
  // 复制视频到桌面
  const deskOut = path.join(DESK, 'medicube_v46_full.mp4');
  fs.copyFileSync(outPath, deskOut);
  console.log('video ->', deskOut, fs.statSync(deskOut).size, 'bytes');

  // 在视频里找一张清晰的脸，用 ffmpeg 抽 t=1s 一帧 rgb24 喂 YOLO
  const { RealHumanEngine } = require(path.join(ROOT, 'real-human-engine'));
  const modelsDir = path.join(os.homedir(), 'Library/Application Support/clipop-macos-agent/realhuman-models');
  const engine = new RealHumanEngine({ modelsDir, ffmpegPath });
  await engine.load(() => {});

  const first = await sh(ffmpegPath, ['-ss', '1', '-i', outPath, '-frames:v', '1', '-vf', 'scale=720:1280', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
  const det = await engine.detectFace(first.subarray(0, W * H * 3));
  if (!det) { console.error('NO FACE'); process.exit(1); }
  console.log('face box:', JSON.stringify(det.box));

  const [bx1, by1, bx2, by2] = det.box;
  const fw = bx2 - bx1, fh = by2 - by1;
  const PAD = 0.05;
  const mox1 = Math.max(0, Math.round(bx1 + fw * (0.18 - PAD)));
  const mox2 = Math.min(W, Math.round(bx2 - fw * (0.18 - PAD)));
  const moy1 = Math.max(0, Math.round(by1 + fh * (0.55 - PAD)));
  const moy2 = Math.min(H, Math.round(by1 + fh * (0.95 + PAD)));
  const moW = mox2 - mox1, moH = moy2 - moy1;
  console.log('mouth crop:', JSON.stringify({ mox1, moy1, moW, moH }));

  // 抽 12 张嘴部特写 PNG（清晰度提升 + 直接目检）
  const totalDur = 14.92;
  const N_SAMPLES = 12;
  const stride = totalDur / (N_SAMPLES + 1);
  const samples = [];
  for (let i = 0; i < N_SAMPLES; i++) {
    const ts = stride * (i + 0.5);
    const raw = await sh(ffmpegPath, ['-ss', ts.toFixed(2), '-i', outPath, '-frames:v', '1', '-vf', 'scale=720:1280', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
    const frame = raw.subarray(0, W * H * 3);
    let s = 0, s2 = 0, c = 0;
    for (let y = 1; y < moH - 1; y++) for (let x = 1; x < moW - 1; x++) {
      const i2 = ((moy1 + y) * W + mox1 + x) * 3;
      const g = (p) => 0.299 * frame[p] + 0.587 * frame[p + 1] + 0.114 * frame[p + 2];
      const lap = 4 * g(i2) - g(i2 - 3) - g(i2 + 3) - g(i2 - W * 3) - g(i2 + W * 3);
      s += lap; s2 += lap * lap; c++;
    }
    const lapVar = s2 / c - (s / c) ** 2;
    samples.push({ ts, lapVar });
    const out = path.join(DESK, `medicube_v46_mouth_${String(i + 1).padStart(2, '0')}_t${ts.toFixed(1)}.png`);
    await new Promise((res2, rej2) => {
      const p = spawn(ffmpegPath, ['-ss', ts.toFixed(2), '-i', outPath, '-frames:v', '1',
        '-vf', `crop=${moW}:${moH}:${mox1}:${moy1},scale=${moW * 2}:${moH * 2}:flags=lanczos`, '-y', out],
        { stdio: ['ignore', 'ignore', 'ignore'] });
      p.on('close', (cc) => (cc === 0 ? res2() : rej2(new Error('crop exit'))));
    });
  }
  fs.writeFileSync(path.join(DESK, 'medicube_v46_frames.json'),
    JSON.stringify({ samples, faceBox: det.box, mouthBox: { mox1, moy1, moW, moH } }, null, 2));
  console.log('\nmouth samples:');
  samples.forEach(s => console.log(`  t=${s.ts.toFixed(1)}s lapVar=${s.lapVar.toFixed(0)}`));
  const meds = samples.map(s => s.lapVar).sort((a, b) => a - b);
  console.log(`\nmedian LaplacianVar = ${meds[N_SAMPLES >> 1].toFixed(1)}`);
  console.log(`reference: v0.9.45 baseline ~40-60, original host video ~356`);
  console.log(`\nDesktop files:\n  ${deskOut}\n  ${path.join(DESK, 'medicube_v46_mouth_*.png')}\n  ${path.join(DESK, 'medicube_v46_frames.json')}`);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
