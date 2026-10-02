// Lab: measure wav2lip mouth response to different mel transformations
// on the SAME face frame — find what makes Kokoro audio drive bigger lip motion.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = '/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent';
const { RealHumanEngine, decodePcm16k } = require(path.join(ROOT, 'real-human-engine'));
const { Tensor } = require(path.join(ROOT, 'node_modules/onnxruntime-node'));
const ffmpegPath = require(path.join(ROOT, 'node_modules/@ffmpeg-installer/ffmpeg')).path;

const modelsDir = path.join(os.homedir(), 'Library/Application Support/clipop-macos-agent/realhuman-models');
const hostVideo = path.join(ROOT, 'resources/hosts/host_m_asia.mp4');

// mouth openness proxy: mean of darkest 15% pixels in mouth region of 256 face
function mouthDark(face256) {
  const px = [];
  // mouth region in wav2lip 256 face: x 95..160, y 150..200
  for (let y = 150; y < 200; y++) {
    for (let x = 95; x < 160; x++) {
      const i = (y * 256 + x) * 3;
      px.push((face256[i] + face256[i + 1] + face256[i + 2]) / 3);
    }
  }
  px.sort((a, b) => a - b);
  const k = Math.max(4, Math.floor(px.length * 0.15));
  return px.slice(0, k).reduce((a, b) => a + b, 0) / k;
}

(async () => {
  const engine = new RealHumanEngine({ modelsDir, ffmpegPath });
  engine.gender = 'male';
  await engine.load(() => {});

  // 1. decode kokoro narration + mel
  const pcm = await decodePcm16k(ffmpegPath, '/tmp/rh_e2e_work/narration.mp3');
  const melT = await engine.computeMel(pcm);
  const T = melT.dims[2];
  const mel = Float32Array.from(melT.data);
  console.log('mel T =', T, 'pcm dur =', (pcm.length / 16000).toFixed(2) + 's');

  // mel stats
  let mn = Infinity, mx = -Infinity, sum = 0;
  for (let i = 0; i < mel.length; i++) { mn = Math.min(mn, mel[i]); mx = Math.max(mx, mel[i]); sum += mel[i]; }
  console.log('mel stats: min', mn.toFixed(2), 'max', mx.toFixed(2), 'mean', (sum / mel.length).toFixed(2));

  // 2. get a face frame (frame 0) + ref face
  const { spawn } = require('child_process');
  const frame = await new Promise((resolve, reject) => {
    const chunks = [];
    const p = spawn(ffmpegPath, ['-i', hostVideo, '-vf', 'fps=24,scale=720:1280', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.on('data', (c) => chunks.push(c));
    p.on('close', (c) => (c === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('decode'))));
  });
  const det = await engine.detectFace(frame);
  const { sx1, sy1, side } = engine.squareCrop(det.box);
  const refFace = Buffer.alloc(256 * 256 * 3);
  for (let y = 0; y < 256; y++) {
    const sy = Math.min(1279, sy1 + Math.floor(y * side / 256));
    for (let x = 0; x < 256; x++) {
      const sx = Math.min(719, sx1 + Math.floor(x * side / 256));
      const si = (sy * 720 + sx) * 3, di = (y * 256 + x) * 3;
      refFace[di] = frame[si]; refFace[di + 1] = frame[si + 1]; refFace[di + 2] = frame[si + 2];
    }
  }
  console.log('face crop at', sx1, sy1, side, 'baseline mouthDark(ref) =', mouthDark(refFace).toFixed(1));

  // 3. find loud frames (top mel energy)
  const frameEnergy = new Float32Array(T);
  for (let t = 0; t < T; t++) {
    let e = 0;
    for (let m = 0; m < 80; m++) e += Math.exp(mel[m * T + t]);
    frameEnergy[t] = e / 80;
  }
  const order = Array.from(frameEnergy.keys()).sort((a, b) => frameEnergy[b] - frameEnergy[a]);
  const loudTs = order.slice(0, 6);
  console.log('loud mel frames:', loudTs.join(','));

  // 4. run wav2lip with different mel transforms on loud frames
  let savePng = null;
  const runW2l = async (melArr, t, tag) => {
    const chunk = new Float32Array(80 * 16);
    for (let m = 0; m < 80; m++) {
      for (let j = 0; j < 16; j++) {
        const tt = Math.min(T - 1, t + j);
        chunk[m * 16 + j] = melArr[m * T + tt];
      }
    }
    const faceIn = engine.buildFaceInput(refFace, refFace);
    const res = await engine.sessions.wav2lip.run({
      mel_spectrogram: new Tensor('float32', chunk, [1, 1, 80, 16]),
      video_frames: new Tensor('float32', faceIn, [1, 6, 256, 256]),
    });
    const o = Object.values(res)[0].data;
    const face = Buffer.alloc(256 * 256 * 3);
    for (let i = 0; i < 256 * 256; i++) {
      face[i * 3] = Math.max(0, Math.min(255, o[i] * 255));
      face[i * 3 + 1] = Math.max(0, Math.min(255, o[256 * 256 + i] * 255));
      face[i * 3 + 2] = Math.max(0, Math.min(255, o[2 * 256 * 256 + i] * 255));
    }
    if (tag && savePng) savePng(face, tag);
    // whole-face L1 diff vs ref
    let l1 = 0;
    for (let i = 0; i < 256 * 256 * 3; i++) l1 += Math.abs(face[i] - refFace[i]);
    return { dark: mouthDark(face), l1: l1 / (256 * 256) };
  };

  // save PNGs via ffmpeg for visual check
  const { execFileSync } = require('child_process');
  savePng = (face, tag) => {
    const p = `/tmp/rh_lab_${tag}.png`;
    try {
      execFileSync(ffmpegPath, ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '256x256', '-i', '-', '-frames:v', '1', p], { input: face });
    } catch {}
  };

  // silence reference (all-zero mel)
  const silence = new Float32Array(mel.length);
  const s0 = await runW2l(silence, 0, 'silence');
  console.log(`\n[silence mel] mouthDark=${s0.dark.toFixed(1)} L1=${s0.l1.toFixed(2)}`);

  // extreme: all -4 (min) vs all +2 (max)
  const lo = new Float32Array(mel.length).fill(-4);
  const hi = new Float32Array(mel.length).fill(2);
  const rLo = await runW2l(lo, 0, 'mel_lo');
  const rHi = await runW2l(hi, 0, 'mel_hi');
  console.log(`[mel all -4] mouthDark=${rLo.dark.toFixed(1)} L1=${rLo.l1.toFixed(2)}`);
  console.log(`[mel all +2] mouthDark=${rHi.dark.toFixed(1)} L1=${rHi.l1.toFixed(2)}`);

  const mkScale = (k) => { const a = new Float32Array(mel.length); for (let i = 0; i < mel.length; i++) a[i] = mel[i] * k; return a; };
  const mkContrast = (k) => {
    const a = new Float32Array(mel.length);
    for (let m = 0; m < 80; m++) {
      let mu = 0;
      for (let t = 0; t < T; t++) mu += mel[m * T + t];
      mu /= T;
      for (let t = 0; t < T; t++) a[m * T + t] = mu + (mel[m * T + t] - mu) * k;
    }
    return a;
  };

  const variants = [
    ['raw', mel],
    ['scale1.5', mkScale(1.5)],
    ['scale2.0', mkScale(2.0)],
    ['contrast2.0', mkContrast(2.0)],
    ['contrast3.0', mkContrast(3.0)],
  ];

  for (const [name, arr] of variants) {
    const vals = [];
    for (const t of loudTs.slice(0, 3)) vals.push(await runW2l(arr, t));
    console.log(`[${name}] loud mouthDark: ${vals.map((x) => x.dark.toFixed(1)).join(' ')} | L1: ${vals.map((x) => x.l1.toFixed(2)).join(' ')}`);
  }
})().catch((e) => { console.error('LAB FAIL:', e); process.exit(1); });
