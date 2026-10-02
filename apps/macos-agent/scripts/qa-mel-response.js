// QA: does wav2lip prediction mouth track the narration mel? (isolates model chain from blending)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = '/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent';
const { RealHumanEngine } = require(path.join(ROOT, 'real-human-engine'));
// resizeTo is module-internal; replicate the crop+resize inline
function cropResize96(frame, sx, sy, side) {
  const out = Buffer.alloc(96 * 96 * 3);
  for (let y = 0; y < 96; y++) {
    const sy2 = sy + Math.floor((y * side) / 96);
    for (let x = 0; x < 96; x++) {
      const sx2 = sx + Math.floor((x * side) / 96);
      const si = (sy2 * 720 + sx2) * 3;
      const di = (y * 96 + x) * 3;
      out[di] = frame[si]; out[di + 1] = frame[si + 1]; out[di + 2] = frame[si + 2];
    }
  }
  return out;
}
const ffmpegPath = require(path.join(ROOT, 'node_modules/@ffmpeg-installer/ffmpeg')).path;

const modelsDir = path.join(process.env.HOME, 'Library/Application Support/clipop-macos-agent/realhuman-models');
const narration = process.argv[2] || '/tmp/rh_e2e_work/narration.mp3';
const hostVideo = process.argv[3] || path.join(ROOT, 'resources/hosts/host_m_asia.mp4');

(async () => {
  const SWAP_BGR = process.argv.includes('--bgr'); // feed face as BGR (R<->B swap)
  const engine = new RealHumanEngine({ modelsDir, ffmpegPath });
  engine.gender = 'male';
  await engine.load(() => {});

  // decode narration -> pcm -> mel
  const pcm = await new Promise((resolve, reject) => {
    const chunks = [];
    const p = require('child_process').spawn(ffmpegPath, ['-i', narration, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-']);
    p.stdout.on('data', (c) => chunks.push(c));
    p.stderr.on('data', () => {});
    p.on('close', (c) => (c === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('decode'))));
  });
  const samples = new Float32Array(pcm.length / 4);
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readFloatLE(i * 4);
  const melT = await engine.computeMel(samples);
  const T = melT.dims[2];
  console.log('mel T =', T, 'audio dur =', (samples.length / 16000).toFixed(2) + 's');

  // host first frame -> face crop -> 96x96 curFace
  const frame = execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', hostVideo,
    '-frames:v', '1', '-vf', 'fps=24,scale=720:1280', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 64 * 1024 * 1024 });
  const det = await engine.detectFace(frame);
  const crop = engine.squareCrop(det.box);
  console.log('face crop:', JSON.stringify(crop));
  const curFace = cropResize96(frame, crop.sx1, crop.sy1, crop.side);
  if (SWAP_BGR) {
    for (let i = 0; i < curFace.length; i += 3) {
      const t = curFace[i]; curFace[i] = curFace[i + 2]; curFace[i + 2] = t;
    }
    console.log('FEEDING BGR (R<->B swapped) face');
  }

  // per-frame: mel chunk -> lipSync -> mouth darkness of prediction (rows 58..80, cols 32..64)
  const NF = Math.min(240, Math.floor((samples.length / 16000) * 24));
  const darks = [];
  for (let f = 0; f < NF; f++) {
    const melChunk = engine.fillMelChunk(melT.data, T, f);
    const pred = await engine.lipSync(melChunk, curFace);
    const px = [];
    for (let y = 58; y < 82; y++) {
      for (let x = 32; x < 64; x++) {
        const i = (y * 96 + x) * 3;
        px.push((pred[i] + pred[i + 1] + pred[i + 2]) / 3);
      }
    }
    px.sort((a, b) => a - b);
    const k = Math.max(4, Math.floor(px.length * 0.15));
    darks.push(px.slice(0, k).reduce((a, b) => a + b, 0) / k);
  }
  // audio windowed rms (forward 200ms like the mel window)
  const win = Math.round(16000 / 24);
  const rms = [];
  for (let f = 0; f < NF; f++) {
    let s = 0, n = 0;
    for (let k = 0; k < 5; k++) {
      const fi = f + k;
      for (let j = 0; j < win; j++) { const idx = fi * win + j; if (idx < samples.length) { s += samples[idx] ** 2; n++; } }
    }
    rms.push(Math.sqrt(s / (n || 1)));
  }
  const dMax = Math.max(...darks), dMin = Math.min(...darks);
  const rMax = Math.max(...rms);
  const bars = (v) => '#'.repeat(Math.round(v * 20));
  console.log(`pred mouth dark range: ${dMin.toFixed(0)}-${dMax.toFixed(0)} (spread ${(dMax - dMin).toFixed(1)})`);
  for (let g = 0; g < NF; g += 3) {
    const open = 1 - (darks[g] - dMin) / (dMax - dMin || 1);
    console.log(
      String((g / 24).toFixed(2)).padStart(5),
      'dark', String(darks[g].toFixed(0)).padStart(3),
      'rms', rms[g].toFixed(3).padStart(5),
      '|' + bars(open).padEnd(20) + '|' + bars(rms[g] / (rMax || 1))
    );
  }
  // correlation
  const n = Math.min(darks.length, rms.length);
  const muD = darks.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const muR = rms.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dd = 0, rr = 0;
  for (let i = 0; i < n; i++) {
    num += (darks[i] - muD) * (rms[i] - muR);
    dd += (darks[i] - muD) ** 2; rr += (rms[i] - muR) ** 2;
  }
  const r = num / (Math.sqrt(dd * rr) || 1);
  console.log(`\ncorr(dark, forwardRms) = ${r.toFixed(3)} (negative = correct sync: darker mouth on louder audio)`);
  console.log(r < -0.35 ? 'MODEL CHAIN: STRONG SYNC ✓' : r < -0.2 ? 'MODEL CHAIN: MODERATE' : 'MODEL CHAIN: WEAK ✗');
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
