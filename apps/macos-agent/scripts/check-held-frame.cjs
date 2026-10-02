/* Verify held-product visually on a rendered frame: card gray + hand skin + product pixels.
 * Usage: node scripts/check-held-frame.cjs <png> */
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const FF = require(path.join(__dirname, '..', 'node_modules', '@ffmpeg-installer', 'ffmpeg')).path;
const png = process.argv[2];
const raw = execFileSync(FF, ['-i', png, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 27 });
const W = 720, H = 1280;
let card = 0, skin = 0, tot = 0, brightWhite = 0;
for (let y = 500; y < Math.min(1150, H); y += 2) {
  for (let x = 160; x < 560; x += 2) {
    const i = (y * W + x) * 3;
    const r = raw[i], g = raw[i + 1], b = raw[i + 2];
    tot++;
    if (Math.abs(r - 244) < 26 && Math.abs(g - 241) < 26 && Math.abs(b - 236) < 28 && Math.abs(r - b) < 22) card++;
    if (r > 235 && g > 235 && b > 235) brightWhite++;
    if (r > 140 && r < 245 && r - g > 14 && r - b > 26 && g - b > 6 && r - g < 62) skin++;
  }
}
console.log(`region y500-1150 x160-560: card=${(card / tot * 100).toFixed(1)}% skin=${(skin / tot * 100).toFixed(1)}% brightWhite=${(brightWhite / tot * 100).toFixed(1)}% (of ${(tot / 1000).toFixed(0)}k px)`);
