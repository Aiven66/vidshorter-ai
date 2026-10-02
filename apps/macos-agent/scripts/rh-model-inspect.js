// Inspect wav2lip_256.onnx input/output signature + test mel influence with ref != cur
'use strict';
const path = require('path');
const os = require('os');
const ROOT = '/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent';
const { RealHumanEngine } = require(path.join(ROOT, 'real-human-engine'));
const { Tensor } = require(path.join(ROOT, 'node_modules/onnxruntime-node'));
const ffmpegPath = require(path.join(ROOT, 'node_modules/@ffmpeg-installer/ffmpeg')).path;
const { spawn } = require('child_process');

const modelsDir = path.join(os.homedir(), 'Library/Application Support/clipop-macos-agent/realhuman-models');
const hostVideo = path.join(ROOT, 'resources/hosts/host_m_asia.mp4');

(async () => {
  const engine = new RealHumanEngine({ modelsDir, ffmpegPath });
  engine.gender = 'male';
  await engine.load(() => {});
  const s = engine.sessions.wav2lip;
  console.log('inputs:', s.inputNames);
  console.log('outputs:', s.outputNames);

  // grab two different frames (0 and 60 = 2.5s apart — different mouth pose)
  const grab = (n) => new Promise((resolve, reject) => {
    const chunks = [];
    const p = spawn(ffmpegPath, ['-i', hostVideo, '-vf', 'fps=24,scale=720:1280', '-frames:v', String(n + 1), '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.on('data', (c) => chunks.push(c));
    p.on('close', (c) => (c === 0 ? resolve(Buffer.concat(chunks).slice(n * 720 * 1280 * 3)) : reject(new Error('decode'))));
  });
  const f0 = await grab(0);
  const f60 = await grab(60);
  const det0 = await engine.detectFace(f0);
  const crop = engine.squareCrop(det0.box);
  // nearest-neighbor crop resize (same as engine's resizeTo)
  const resizeTo = (frame, sw, sh, x1, y1, cw, ch, dw, dh) => {
    const out = Buffer.alloc(dw * dh * 3);
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(sh - 1, y1 + Math.floor(y * ch / dh));
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(sw - 1, x1 + Math.floor(x * cw / dw));
        const si = (sy * sw + sx) * 3, di = (y * dw + x) * 3;
        out[di] = frame[si]; out[di + 1] = frame[si + 1]; out[di + 2] = frame[si + 2];
      }
    }
    return out;
  };
  const ref = resizeTo(f0, 720, 1280, crop.sx1, crop.sy1, crop.side, crop.side, 256, 256);
  const cur = resizeTo(f60, 720, 1280, crop.sx1, crop.sy1, crop.side, crop.side, 256, 256);

  const mouthDark = (face) => {
    const px = [];
    for (let y = 150; y < 200; y++) for (let x = 95; x < 160; x++) {
      const i = (y * 256 + x) * 3;
      px.push((face[i] + face[i + 1] + face[i + 2]) / 3);
    }
    px.sort((a, b) => a - b);
    const k = Math.max(4, Math.floor(px.length * 0.15));
    return px.slice(0, k).reduce((a, b) => a + b, 0) / k;
  };
  console.log('ref(frame0) mouthDark:', mouthDark(ref).toFixed(1), ' cur(frame60) mouthDark:', mouthDark(cur).toFixed(1));

  const run = async (fill) => {
    const chunk = new Float32Array(80 * 16);
    for (let m = 0; m < 80; m++) for (let j = 0; j < 16; j++) chunk[m * 16 + j] = fill;
    const faceIn = engine.buildFaceInput(ref, cur);
    const out = await s.run({
      mel_spectrogram: new Tensor('float32', chunk, [1, 1, 80, 16]),
      video_frames: new Tensor('float32', faceIn, [1, 6, 256, 256]),
    });
    const o = Object.values(out)[0].data;
    const face = Buffer.alloc(256 * 256 * 3);
    for (let i = 0; i < 256 * 256; i++) {
      face[i * 3] = Math.max(0, Math.min(255, o[i] * 255));
      face[i * 3 + 1] = Math.max(0, Math.min(255, o[256 * 256 + i] * 255));
      face[i * 3 + 2] = Math.max(0, Math.min(255, o[2 * 256 * 256 + i] * 255));
    }
    let l1 = 0;
    for (let i = 0; i < 256 * 256 * 3; i++) l1 += Math.abs(face[i] - cur[i]);
    return { dark: mouthDark(face), l1: l1 / (256 * 256) };
  };

  for (const v of [-4, -2, 0, 1, 2]) {
    const r = await run(v);
    console.log(`mel fill ${v}: mouthDark=${r.dark.toFixed(1)} L1vsCur=${r.l1.toFixed(2)}`);
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
