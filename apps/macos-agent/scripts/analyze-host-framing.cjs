/* Detect face box in first frames of all host videos (composition analysis) */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = '/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent';
const { RealHumanEngine } = require(path.join(ROOT, 'real-human-engine.js'));
const FF = require(path.join(ROOT, 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path;
const MODELS = path.join(process.env.HOME, 'Library/Application Support/clipop-macos-agent/realhuman-models');

(async () => {
  const eng = new RealHumanEngine({ modelsDir: MODELS, ffmpegPath: FF });
  await eng.load();
  const hosts = fs.readdirSync(path.join(ROOT, 'resources/hosts')).filter(f => f.endsWith('.mp4'));
  for (const h of hosts) {
    const vp = path.join(ROOT, 'resources/hosts', h);
    // extract frame #30 as raw rgb24 720x1280
    const buf = execFileSync(FF, ['-ss', '1', '-i', vp, '-vframes', '1', '-vf', 'scale=720:1280', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
    const det = await eng.detectFace(buf);
    if (det) {
      const [x1, y1, x2, y2] = det.box;
      console.log(`${h}: face box x1=${x1.toFixed(0)} y1=${y1.toFixed(0)} x2=${x2.toFixed(0)} y2=${y2.toFixed(0)}  (cx=${((x1+x2)/2).toFixed(0)}, faceW=${(x2-x1).toFixed(0)}, faceH=${(y2-y1).toFixed(0)})`);
    } else {
      console.log(`${h}: NO FACE DETECTED`);
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
