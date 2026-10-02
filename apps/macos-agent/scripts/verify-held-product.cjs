/* verify held-product composition on an already-generated video */
const path = require('path');
const fs = require('fs');
const { spawnSync, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FF = require(path.join(ROOT, 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path;

const mp4 = process.argv[2];
if (!mp4 || !fs.existsSync(mp4)) { console.error('usage: node verify-held-product.cjs <out.mp4>'); process.exit(1); }

function frameAt(t) {
  return execFileSync(FF, ['-ss', String(t), '-i', mp4, '-vframes', '1', '-vf', 'scale=720:1280', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
}
function px(f, x, y) { const i = (y * 720 + x) * 3; return [f[i], f[i + 1], f[i + 2]]; }
function regionStats(f, x0, y0, x1, y1, pred) {
  let hit = 0, total = 0;
  for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) {
    const [r, g, b] = px(f, x, y); total++; if (pred(r, g, b)) hit++;
  }
  return { ratio: hit / Math.max(1, total) };
}

const r = spawnSync(FF, ['-i', mp4, '-f', 'null', '-'], { encoding: 'utf8' });
const times = r.stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/g) || [];
const last = times.pop() || '';
const m = last.match(/time=(\d+):(\d+):(\d+\.\d+)/);
const dur = m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
console.log('duration:', dur.toFixed(2));

const tStart = 1.2, tEnd = dur + 0.2, span = tEnd - tStart;
const flipAt = tStart + span * 0.58;
const tPre = 0.5, tA = 2.6, tB = Math.min(dur - 0.6, flipAt + 1.4);
console.log(`tA=${tA} tB=${tB.toFixed(2)} flipAt=${flipAt.toFixed(2)}`);

let pass = 0, fail = 0;
const check = (name, cond, detail) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); cond ? pass++ : fail++; };

const fPre = frameAt(tPre), fA = frameAt(tA), fB = frameAt(tB);

const cheekPre = px(fPre, 330, 380), cheekA = px(fA, 330, 380);
const cheekDelta = Math.abs(cheekPre[0] - cheekA[0]) + Math.abs(cheekPre[1] - cheekA[1]) + Math.abs(cheekPre[2] - cheekA[2]);
check('face cheek region NOT covered by product (cheek stable pre/mid)', cheekDelta < 150, `pre=(${cheekPre}) mid=(${cheekA}) delta=${cheekDelta}`);

const cardA = regionStats(fA, 380, 620, 690, 930, (r, g, b) => r > 230 && g > 230 && b > 230);
const redA = regionStats(fA, 380, 620, 690, 930, (r, g, b) => r > 140 && g < 110 && b < 110);
check('card region has white border pixels at tA', cardA.ratio > 0.02, `white ratio=${cardA.ratio.toFixed(3)}`);
check('card region shows product A (red) at tA', redA.ratio > 0.08, `red ratio=${redA.ratio.toFixed(3)}`);

const cardPre = regionStats(fPre, 380, 620, 690, 930, (r, g, b) => (r > 230 && g > 230 && b > 230) || (r > 140 && g < 110 && b < 110));
check('no card pixels before entrance (t=0.5)', cardPre.ratio < 0.02, `ratio=${cardPre.ratio.toFixed(3)}`);

const blueB = regionStats(fB, 380, 620, 690, 930, (r, g, b) => b > 140 && r < 110);
check('card flips to product B (blue) after boundary', blueB.ratio > 0.08, `blue ratio=${blueB.ratio.toFixed(3)} at t=${tB.toFixed(2)}`);

const topRow = (f) => {
  for (let y = 600; y < 950; y += 2) for (let x = 400; x < 680; x += 6) {
    const [r, g, b] = px(f, x, y);
    if (r > 230 && g > 230 && b > 230) return y;
  }
  return -1;
};
const fA2 = frameAt(tA + 0.25);
const r1 = topRow(fA), r2 = topRow(fA2);
check('card bobs while talking (position varies)', r1 > 0 && r2 > 0 && Math.abs(r1 - r2) >= 1, `topRow ${r1} vs ${r2}`);

check('output has audio stream', /Stream #\d+:\d+.*Audio: aac/.test(r.stderr));
check('output has video stream', /Stream #\d+:\d+.*Video: h264/.test(r.stderr));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
