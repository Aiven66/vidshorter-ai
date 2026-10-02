/* Reproduce user scenario: Amazon-style WHITE-BG product images + engine card.
 * 1) make 3 white-bg product pngs (small product in center, like Amazon shots)
 * 2) synthesize with f_asia (worst case: face bottom y=569, closest to card y0=622)
 * 3) measure: face-region luma vs pure host frame; card-region white ratio; gap
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { RealHumanEngine } = require(path.join(ROOT, 'real-human-engine.js'));
const FF = require(path.join(ROOT, 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path;
const MODELS = path.join(process.env.HOME, 'Library/Application Support/clipop-macos-agent/realhuman-models');
const HOST = path.join(ROOT, 'resources/hosts/host_f_asia.mp4'); // face x216-508 y153-569
const W = 720, H = 1280;

function whiteBgProduct(out, rgb) {
  // Amazon-style: pure white 800x800, product rect in center (lavfi; no svg decoder in this ffmpeg)
  const [r, g, b] = rgb;
  const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  execFileSync(FF, ['-y', '-f', 'lavfi', '-i', 'color=c=white:s=800x800',
    '-vf', `drawbox=x=220:y=220:w=360:h=360:color=0x${hex}:t=fill`,
    '-frames:v', '1', out], { stdio: 'ignore' });
}

function frameAt(mp4, t) {
  return execFileSync(FF, ['-ss', String(t), '-i', mp4, '-vframes', '1', '-vf', 'scale=720:1280', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
}
function lumaStats(f, x0, y0, x1, y1) {
  let sum = 0, n = 0, mx = 0;
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
    const i = (y * 720 + x) * 3;
    const l = 0.299 * f[i] + 0.587 * f[i + 1] + 0.114 * f[i + 2];
    sum += l; n++; if (l > mx) mx = l;
  }
  return { mean: sum / n, max: mx };
}
function whiteRatio(f, x0, y0, x1, y1) {
  let hit = 0, n = 0;
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
    const i = (y * 720 + x) * 3;
    n++; if (f[i] > 235 && f[i + 1] > 235 && f[i + 2] > 235) hit++;
  }
  return hit / n;
}

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rhfix-'));
  const imgs = [path.join(work, 'p1.png'), path.join(work, 'p2.png'), path.join(work, 'p3.png')];
  whiteBgProduct(imgs[0], [212, 106, 234]); // purple
  whiteBgProduct(imgs[1], [234, 182, 46]);  // amber
  whiteBgProduct(imgs[2], [86, 170, 228]);  // blue
  console.log('work:', work);

  const eng = new RealHumanEngine({ modelsDir: MODELS, ffmpegPath: FF });
  await eng.load();
  const out = path.join(work, 'out.mp4');
  await eng.synthesize({
    hostVideo: HOST,
    script: '大家好，今天给大家带来一款非常好用的产品，它的效果特别棒，性价比非常高，大家一定要试试看。',
    locale: 'zh-CN',
    outPath: out,
    workDir: path.join(work, 'w'),
    overlays: [{ type: 'text', from: 0, to: 99, text: '测试字幕', size: 40 }],
    productImages: imgs,
  });
  console.log('generated:', out);

  const dur = (() => {
    const r = spawnSync(FF, ['-i', out, '-f', 'null', '-'], { encoding: 'utf8' });
    const ts = r.stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/g) || [];
    const m = (ts.pop() || '').match(/time=(\d+):(\d+):(\d+\.\d+)/);
    return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
  })();
  console.log('dur:', dur.toFixed(2));

  for (const t of [3.0, 6.0]) {
    const fOut = frameAt(out, t);
    const fHost = frameAt(HOST, t % 10); // host is 10.08s loop
    // face region of f_asia: x216-508 y153-569 -> sample cheeks/forehead safe band
    const faceOut = lumaStats(fOut, 250, 200, 470, 400);
    const faceHost = lumaStats(fHost, 250, 200, 470, 400);
    // gap band between chin (569) and card top (~613): y575-610
    const gapOut = lumaStats(fOut, 330, 575, 690, 610);
    const gapHost = lumaStats(fHost, 330, 575, 690, 610);
    const cardWhite = whiteRatio(fOut, 380, 640, 680, 900);
    console.log(`t=${t}: face luma out=${faceOut.mean.toFixed(1)} host=${faceHost.mean.toFixed(1)} Δ=${(faceOut.mean - faceHost.mean).toFixed(1)} | chin-gap luma out=${gapOut.mean.toFixed(1)} host=${gapHost.mean.toFixed(1)} Δ=${(gapOut.mean - gapHost.mean).toFixed(1)} | card white ratio=${cardWhite.toFixed(3)}`);
  }
})().catch(e => { console.error('ERR', e); process.exit(1); });
