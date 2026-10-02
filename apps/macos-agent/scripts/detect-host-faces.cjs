/* detect face boxes for every host video (frame ~1s in) using the engine's yolo */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { RealHumanEngine } = require(path.join(ROOT, 'real-human-engine.js'));
const FF = require(path.join(ROOT, 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path;
const MODELS = path.join(process.env.HOME, 'Library/Application Support/clipop-macos-agent/realhuman-models');
const W = 720, H = 1280;

(async () => {
  const eng = new RealHumanEngine({ modelsDir: MODELS, ffmpegPath: FF });
  await eng.load();
  const hosts = fs.readdirSync(path.join(ROOT, 'resources/hosts')).filter(f => f.endsWith('.mp4'));
  for (const f of hosts) {
    const frame = execFileSync(FF, ['-ss', '1', '-i', path.join(ROOT, 'resources/hosts', f), '-vframes', '1', '-vf', `fps=1,scale=${W}:${H}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
    const det = await eng.detectFace(frame);
    if (det) {
      const [x1, y1, x2, y2] = det.box;
      console.log(`${f}: face x${x1}-${x2} y${y1}-${y2}  bottom=${y2}`);
    } else {
      console.log(`${f}: NO FACE`);
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
