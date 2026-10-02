/* E2E: held-product composition in RealHumanEngine (v0.9.35)
 * Runs the REAL engine (say TTS + wav2lip_256 + BiSeNet + held-card composite)
 * with 2 fake product images (solid red / solid blue), then pixel-verifies:
 *   1. face cheek region stays UNCOVERED (similar to pre-card frame)
 *   2. card region contains white border + product color (red) mid-video
 *   3. after the flip boundary the card swaps to the 2nd product (blue)
 *   4. before t=1.2 no card pixels in the card region
 * Usage: node scripts/test-held-product.cjs   (~2 min, real inference)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { RealHumanEngine } = require(path.join(ROOT, 'real-human-engine.js'));
const FF = require(path.join(ROOT, 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path;
const MODELS = path.join(process.env.HOME, 'Library/Application Support/clipop-macos-agent/realhuman-models');
const HOST = path.join(ROOT, 'resources/hosts/host_m_asia.mp4'); // face 286-467 x 244-519

function makeSolidPng(outPath, r, g, b) {
  // 400x400 solid PNG via ffmpeg
  execFileSync(FF, ['-y', '-f', 'lavfi', '-i', `color=c=0x${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}:s=400x400`, '-frames:v', '1', outPath], { stdio: 'ignore' });
}

function frameAt(mp4, t) {
  const buf = execFileSync(FF, ['-ss', String(t), '-i', mp4, '-vframes', '1', '-vf', 'scale=720:1280', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
  return buf;
}

function px(frame, x, y) {
  const i = (y * 720 + x) * 3;
  return [frame[i], frame[i + 1], frame[i + 2]];
}

function regionStats(frame, x0, y0, x1, y1, pred) {
  let hit = 0, total = 0, sumR = 0, sumG = 0, sumB = 0;
  for (let y = y0; y < y1; y += 4) {
    for (let x = x0; x < x1; x += 4) {
      const [r, g, b] = px(frame, x, y);
      total++; sumR += r; sumG += g; sumB += b;
      if (pred(r, g, b)) hit++;
    }
  }
  return { hit, total, ratio: hit / Math.max(1, total), mean: [sumR / total, sumG / total, sumB / total] };
}

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  cond ? pass++ : fail++;
};

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'held-prod-'));
  const imgA = path.join(work, 'red.png'), imgB = path.join(work, 'blue.png');
  makeSolidPng(imgA, 200, 40, 40);
  makeSolidPng(imgB, 40, 60, 200);
  console.log('work dir:', work);

  const eng = new RealHumanEngine({ modelsDir: MODELS, ffmpegPath: FF });
  await eng.load();
  const out = path.join(work, 'out.mp4');
  const t0 = Date.now();
  await eng.synthesize({
    hostVideo: HOST,
    script: '大家好，今天给大家带来一款非常好用的产品，它的效果特别棒，性价比非常高，大家一定要试试看，绝对不会后悔。',
    locale: 'zh-CN',
    outPath: out,
    workDir: path.join(work, 'w'),
    overlays: [{ type: 'text', from: 0, to: 99, text: '测试字幕', size: 40 }],
    productImages: [imgA, imgB],
  });
  console.log(`generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const durOut = (() => {
    const r = require('child_process').spawnSync(FF, ['-i', out, '-f', 'null', '-'], { encoding: 'utf8' });
    const times = r.stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/g) || [];
    const m = (times.pop() || '').match(/time=(\d+):(\d+):(\d+\.\d+)/);
    return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
  })();
  console.log('duration:', durOut.toFixed(2));

  // flip boundary for 2 images: tStart=1.2, tEnd=dur+0.2, boundary = 1.2 + 0.58*span
  const tStart = 1.2, tEnd = durOut + 0.2, span = tEnd - tStart;
  const flipAt = tStart + span * 0.58;
  const tPre = 0.5, tA = tStart + 1.2, tB = Math.min(durOut - 0.6, flipAt + 1.2);

  const fPre = frameAt(out, tPre);
  const fA = frameAt(out, tA);
  const fB = frameAt(out, tB);
  console.log(`tA=${tA.toFixed(2)} tB=${tB.toFixed(2)} flipAt=${flipAt.toFixed(2)}`);

  // 1. face cheek UNCOVERED: pixel at (330, 380) (inside face box 286-467x244-519, left-of-mouth) similar pre vs mid
  const cheekPre = px(fPre, 330, 380), cheekA = px(fA, 330, 380);
  const cheekDelta = Math.abs(cheekPre[0] - cheekA[0]) + Math.abs(cheekPre[1] - cheekA[1]) + Math.abs(cheekPre[2] - cheekA[2]);
  check('face cheek region NOT covered by product (cheek stable pre/mid)', cheekDelta < 150, `cheek pre=(${cheekPre}) mid=(${cheekA}) delta=${cheekDelta}`);

  // 2. card region (x 380-690, y 620-930) at tA: white border + red product
  const cardA = regionStats(fA, 380, 620, 690, 930, (r, g, b) => r > 230 && g > 230 && b > 230);
  const redA = regionStats(fA, 380, 620, 690, 930, (r, g, b) => r > 140 && g < 110 && b < 110);
  check('card region has white border pixels at tA', cardA.ratio > 0.02, `white ratio=${cardA.ratio.toFixed(3)}`);
  check('card region shows product A (red) at tA', redA.ratio > 0.08, `red ratio=${redA.ratio.toFixed(3)}`);

  // 3. before entrance: same region at tPre has NO card (white+red rare — presenter chest)
  const cardPre = regionStats(fPre, 380, 620, 690, 930, (r, g, b) => (r > 230 && g > 230 && b > 230) || (r > 140 && g < 110 && b < 110));
  check('no card pixels before entrance (t=0.5)', cardPre.ratio < 0.02, `ratio=${cardPre.ratio.toFixed(3)}`);

  // 4. after flip: card region shows product B (blue)
  const blueB = regionStats(fB, 380, 620, 690, 930, (r, g, b) => b > 140 && r < 110);
  check('card flips to product B (blue) after boundary', blueB.ratio > 0.08, `blue ratio=${blueB.ratio.toFixed(3)} at t=${tB.toFixed(2)}`);

  // 5. bobbing: card vertical position differs between two nearby times (alive, not static)
  // topmost row that is mostly card-bg white (>=50% of row) = card top edge
  const topRow = (f) => {
    for (let y = 540; y < 950; y += 2) {
      let white = 0, n = 0;
      for (let x = 360; x < 640; x += 6) {
        const [r, g, b] = px(f, x, y);
        n++; if (r > 230 && g > 230 && b > 230) white++;
      }
      if (n && white / n > 0.5) return y;
    }
    return -1;
  };
  const fA2 = frameAt(out, tA + 0.25);
  const r1 = topRow(fA), r2 = topRow(fA2);
  check('card bobs while talking (position varies)', r1 > 0 && r2 > 0 && Math.abs(r1 - r2) >= 1, `topRow ${r1} vs ${r2}`);

  // 5.5 hand grip: skin-tone finger pixels at the card's bottom edge
  // m_asia anchor: x=336 y=560, card ~305px -> bottom ≈ 853; fingers at x 0.30..0.78 of card
  const skinBand = regionStats(fA, 410, 815, 610, 875, (r, g, b) => r > 150 && r > g && g >= b - 5 && (r - b) >= 20 && (r - b) <= 115);
  check('hand grip: skin-tone fingers wrap card bottom', skinBand.ratio > 0.05, `skin ratio=${skinBand.ratio.toFixed(3)}`);

  // 6. playback sanity: mp4 has video+audio streams (ffmpeg prints stream info to STDERR)
  const probe = require('child_process').spawnSync(FF, ['-i', out, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  check('output has audio stream', /Stream #\d+:\d+.*Audio: aac/.test(probe));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
