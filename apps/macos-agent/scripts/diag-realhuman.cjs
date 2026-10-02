/* Diagnostic: run REAL synthesis, then measure the 3 reported problems. */
'use strict';
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { RealHumanEngine } = require(path.join(ROOT, 'real-human-engine.js'));
const FF = require(path.join(ROOT, 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path;
const MODELS = process.env.RH_MODELS || path.join(process.env.HOME, 'Library/Application Support/clipop-macos-agent/realhuman-models');
const HOST = process.env.RH_HOST || path.join(ROOT, 'resources/hosts/host_f_asia.mp4');
const TAG = process.argv[2] || 'base';
const OUT = `/tmp/rh-diag/${TAG}`;
const W = 720, H = 1280, FPS = 24;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const engine = new RealHumanEngine({ modelsDir: MODELS, ffmpegPath: FF });
  await engine.load(() => {});
  console.log('[diag] models loaded');

  const f0 = execFileSync(FF, ['-i', HOST, '-vf', `fps=1,scale=${W}:${H}`, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 27 });
  const det = await engine.detectFace(f0);
  if (!det) throw new Error('no face');
  const [fx1, fy1, fx2, fy2] = det.box;
  const fw = fx2 - fx1, fh = fy2 - fy1;
  console.log('[diag] face box', det.box);
  const mw = Math.round(fw * 0.46), mh = Math.round(fh * 0.34);
  const mx = Math.round((fx1 + fx2) / 2 - mw / 2), my = Math.round(fy1 + fh * 0.76 - mh / 2);
  console.log('[diag] mouth crop', { mx, my, mw, mh });

  const outMp4 = path.join(OUT, 'video.mp4');
  const t0 = Date.now();
  await engine.synthesize({
    hostVideo: HOST,
    script: '这款胶原面膜真的太好用了，深层滋养，焕亮肌肤，坚持用一周，皮肤状态肉眼可见变好，今天就下单吧！',
    voice: 'zh-CN-XiaoxiaoNeural', locale: 'zh-CN',
    outPath: outMp4, workDir: path.join(OUT, 'work'),
    productImages: ['/tmp/rh-diag/product.jpg'],
    onProgress: () => {},
  });
  console.log(`[diag] synthesized in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${outMp4}`);

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

  const pcmBuf = execFileSync(FF, ['-i', outMp4, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const pcm = new Float32Array(pcmBuf.length / 4);
  for (let i = 0; i < pcm.length; i++) pcm[i] = pcmBuf.readFloatLE(i * 4);
  const spf = 16000 / FPS;
  const nA = Math.floor(pcm.length / spf);
  const rms = [];
  for (let f = 0; f < nA; f++) { let s = 0; for (let i = 0; i < spf; i++) { const v = pcm[(f * spf + i) | 0]; s += v * v; } rms.push(Math.sqrt(s / spf)); }

  const n = Math.min(open.length, rms.length);
  const z = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) || 1; return a.map((v) => (v - m) / sd); };
  const oz = z(open.slice(0, n)), rz = z(rms.slice(0, n));
  let bestLag = null, bestScore = -2;
  const scores = {};
  for (let L = -8; L <= 8; L++) {
    let s = 0, c = 0;
    for (let t = Math.max(0, L); t < Math.min(n, n + L); t++) { s += oz[t] * rz[t - L]; c++; }
    const v = c > 12 ? s / c : -2;
    scores[L] = +v.toFixed(3);
    if (v > bestScore) { bestScore = v; bestLag = L; }
  }
  console.log('[P2] mouth frames=', n, 'audio frames=', nA);
  console.log('[P2] open[0..40]:', open.slice(0, 40).join(','));
  console.log('[P2] rms[0..40]:', rms.slice(0, 40).map((v) => v.toFixed(3)).join(','));
  console.log('[P2] corr:', JSON.stringify(scores));
  console.log(`[P2] BEST LAG = ${bestLag} frames (${(bestLag / FPS * 1000).toFixed(0)}ms; positive = mouth LEADS audio) score=${bestScore.toFixed(3)}`);

  const vdur = nA / FPS;
  const tP1 = Math.min(2.0, vdur * 0.5);
  const oFrame = execFileSync(FF, ['-ss', tP1.toFixed(2), '-i', outMp4, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 27 });
  const hFrame = execFileSync(FF, ['-ss', tP1.toFixed(2), '-i', HOST, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 27 });
  const mBX0 = Math.max(0, mx - 14), mBY0 = Math.max(0, my - 14), mBX1 = Math.min(W, mx + mw + 14), mBY1 = Math.min(H, my + mh + 14);
  let dIn = 0, nIn = 0, dOut = 0, nOut = 0, lumaIn = 0, lumaOut = 0, lumaH = 0;
  for (let y = fy1 | 0; y < fy2; y += 2) {
    for (let x = fx1 | 0; x < fx2; x += 2) {
      const i = (y * W + x) * 3;
      const inMouth = x >= mBX0 && x < mBX1 && y >= mBY0 && y < mBY1;
      const dr = Math.abs(oFrame[i] - hFrame[i]), dg = Math.abs(oFrame[i + 1] - hFrame[i + 1]), db = Math.abs(oFrame[i + 2] - hFrame[i + 2]);
      const dd = (dr + dg + db) / 3;
      const lo = 0.299 * oFrame[i] + 0.587 * oFrame[i + 1] + 0.114 * oFrame[i + 2];
      const lh = 0.299 * hFrame[i] + 0.587 * hFrame[i + 1] + 0.114 * hFrame[i + 2];
      if (inMouth) { dIn += dd; nIn++; lumaIn += lo; } else { dOut += dd; nOut++; lumaOut += lo; }
      lumaH += lh;
    }
  }
  console.log(`[P1] t=${tP1}s face diff OUTSIDE mouth = ${(dOut / nOut).toFixed(2)} | INSIDE mouth = ${(dIn / nIn).toFixed(2)}`);
  console.log(`[P1] luma host=${(lumaH / (nIn + nOut)).toFixed(1)} out-nonmouth=${(lumaOut / nOut).toFixed(1)} out-mouth=${(lumaIn / nIn).toFixed(1)}`);
  fs.writeFileSync(path.join(OUT, 'p1_out.raw'), oFrame);
  fs.writeFileSync(path.join(OUT, 'p1_host.raw'), hFrame);
  execFileSync(FF, ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', path.join(OUT, 'p1_out.raw'), '-frames:v', '1', path.join(OUT, 'p1_out.png')]);
  execFileSync(FF, ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', path.join(OUT, 'p1_host.raw'), '-frames:v', '1', path.join(OUT, 'p1_host.png')]);

  for (const t of [Math.min(3.0, vdur * 0.8), Math.max(0.5, Math.min(vdur - 0.4, vdur * 0.95))]) {
    execFileSync(FF, ['-y', '-ss', t.toFixed(2), '-i', outMp4, '-frames:v', '1', path.join(OUT, `p3_t${t.toFixed(1)}.png`)]);
  }
  console.log('[diag] artifacts saved to', OUT);
}
main().catch((e) => { console.error('DIAG FAILED:', e); process.exit(1); });
