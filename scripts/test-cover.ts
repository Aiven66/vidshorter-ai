/* 本地验证 cover 合成（不含 ffmpeg/CF）：用 sharp 造一张渐变帧 → 调真实 composeCover → 存 JPEG。 */
import { register } from 'node:module';
import sharp from 'sharp';
import { composeCover } from '../src/lib/server/video-cover';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

async function makeFrame(): Promise<Buffer> {
  const width = 640, height = 360;
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 90, b: 180 } },
  })
    .composite([
      { input: Buffer.from(
        `<svg width="640" height="360"><rect width="640" height="360" fill="url(#g)" /><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs><circle cx="320" cy="180" r="120" fill="#fff" fill-opacity="0.85"/></svg>`
      ), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

async function main() {
  const frame = await makeFrame();
  for (const [name, orientation] of [['16x9', '16:9'], ['9x16', '9:16']] as const) {
    for (const title of ['Big Tech Announcement Reveal', '三段中文标题测试：火爆全网的高光瞬间，一定要看完']) {
      const jpeg = await composeCover({
        frame,
        title,
        orientation,
        startTime: 63,
        brand: 'clipopai.com',
      });
      const out = `scripts/_cover_test_${name}_${title.startsWith('Big') ? 'en' : 'zh'}.jpg`;
      mkdirSync(resolve('scripts'), { recursive: true });
      writeFileSync(resolve(out), jpeg);
      const meta = await sharp(jpeg).metadata();
      console.log(`OK ${out}: ${meta.width}x${meta.height} type=${meta.format} bytes=${jpeg.byteLength}`);
    }
  }
}

main().then(() => { (process as any).exit(0); }).catch((e) => { console.error('FAIL', e); process.exit(1); });