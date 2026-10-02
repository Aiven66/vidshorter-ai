/* Event-based A/V sync test: TTS "啊。啊。啊。啊。" -> crisp mouth-open events. */
'use strict';
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { RealHumanEngine } = require(path.join(ROOT, 'real-human-engine.js'));
const FF = require(path.join(ROOT, 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path;
const MODELS = process.env.RH_MODELS || path.join(process.env.HOME, 'Library/Application Support/clipop-macos-agent/realhuman-models');
const HOST = process.env.RH_HOST || path.join(ROOT, 'resources/hosts/host_f_asia.mp4');
const TAG = process.argv[2] || 'ev';
const OUT = `/tmp/rh-diag/${TAG}`;
const W = 720, H = 1280, FPS = 24;
const [fx1, fy1, fx2, fy2] = [191, 153, 545, 569];
const mw = Math.round((fx2 - fx1) * 0.46), mh = Math.round((fy2 - fy1) * 0.34);
const mx = Math.round((fx1 + fx2) / 2 - mw / 2), my = Math.round(fy1 + (fy2 - fy1) * 0.76 - mh / 2);

function eventsFrom(signal, thresh, minGap) {
  const ev = []; let armed = true;
  for (let i = 0; i < signal.length; i++) {
    if (signal[i] > thresh) {
      if (armed) { ev.push(i); armed = false; }
    } else if (signal[i] < thresh * 0.55) armed = true;
  }
  return ev.filter((e, i) => i === 0 || e - ev[i - 1] >= minGap);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const engine = new RealHumanEngine({ modelsDir: MODELS, ffmpegPath: FF });
  await engine.load(() => {});
  const outMp4 = path.join(OUT, 'video.mp4');
  await engine.synthesize({
    hostVideo: HOST,
    script: '啊。啊。啊。啊。',
    voice: 'zh-CN-XiaoxiaoNeural', locale: 'zh-CN',
    outPath: outMp4, workDir: path.join(OUT, 'work'),
    onProgress: () => {},
  });

  const pcmBuf = execFileSync(FF, ['-i', outMp4, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const pcm = new Float32Array(pcmBuf.length / 4);
  for (let i = 0; i < pcm.length; i++) pcm[i] = pcmBuf.readFloatLE(i * 4);
  const spf = 16000 / FPS;
  const nA = Math.floor(pcm.length / spf);
  const rms = [];
  for (let f = 0; f < nA; f++) { let s = 0; for (let i = 0; i < spf; i++) { const v = pcm[(f * spf + i) | 0]; s += v * v; } rms.push(Math.sqrt(s / spf)); }
  const audioEv = eventsFrom(rms, 0.06, 8);
  console.log('rms:', rms.map((v) => v.toFixed(2)).join(' '));
  console.log('audio burst frames:', audioEv.join(','));

  const mouthRaw = execFileSync(FF, ['-i', outMp4, '-vf', `fps=${FPS},crop=${mw}:${mh}:${mx}:${my}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const nFrames = Math.floor(mouthRaw.length / (mw * mh * 3));
  let skinLuma = 0, cnt = 0;
  for (let i = 0; i < mw * mh; i += 7) { const o = i * 3; skinLuma += 0.299 * mouthRaw[o] + 0.587 * mouthRaw[o + 1] + 0.114 * mouthRaw[o + 2]; cnt++; }
  skinLuma /= cnt;
  const open = [];
  for (let f = 0; f < nFrames; f++) {
    let best = 0, run = 0;
    for (let y = 0; y < mh; y++) {
      let dark = 0, tot = 0;
      for (let x = 2; x < mw - 2; x += 3) {
        const o = (f * mw * mh + y * mw + x) * 3;
        const l = 0.299 * mouthRaw[o] + 0.587 * mouthRaw[o + 1] + 0.114 * mouthRaw[o + 2];
        tot++; if (l < skinLuma - 42) dark++;
      }
      if (dark / tot > 0.28) { run++; if (run > best) best = run; } else run = 0;
    }
    open.push(best);
  }
  console.log('open:', open.join(','));
  const openEv = eventsFrom(open, 8, 8);
  console.log('mouth-open frames:', openEv.join(','));

  const pairs = [];
  for (let i = 0; i < Math.min(audioEv.length, openEv.length); i++) pairs.push(openEv[i] - audioEv[i]);
  console.log('per-event offset (mouth - audio, frames; + = mouth LATE):', pairs.join(','));
  if (pairs.length) {
    const mean = pairs.reduce((a, b) => a + b, 0) / pairs.length;
    console.log(`MEAN OFFSET = ${mean.toFixed(2)} frames (${(mean / FPS * 1000).toFixed(0)}ms; + = mouth LATE, - = mouth EARLY)`);
  }
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
