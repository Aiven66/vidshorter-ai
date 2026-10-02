import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mirror the production cutLocalFile attempt-2 watermark command exactly.
const FF = '/opt/homebrew/bin/ffmpeg';
const input = '/tmp/vs-src-color.mp4';
const out = '/tmp/wm-repro.mp4';

// Render the watermark the same way production does (via sharp).
const { default: sharp } = await import('sharp');
const svg =
  `<svg width="640" height="140" xmlns="http://www.w3.org/2000/svg">` +
  `<rect width="640" height="140" fill="rgba(0,0,0,0.30)" rx="24"/>` +
  `<text x="320" y="92" font-family="Arial,Helvetica,sans-serif" font-size="58" font-weight="700"` +
  ` fill="rgba(255,255,255,0.96)" text-anchor="middle"` +
  ` stroke="rgba(0,0,0,0.65)" stroke-width="3" paint-order="stroke">clipopai.com</text>` +
  `</svg>`;
const wmPng = path.join(os.tmpdir(), 'wm-repro-sharp.png');
try { rmSync(wmPng, { force: true }); } catch {}
await sharp(Buffer.from(svg)).png().toFile(wmPng);
console.log('rendered wmPng', readFileSync(wmPng).length, 'bytes');

const startTime = 1, duration = 2;
const exportVf = 'scale=trunc(min(iw\\,1280)/2)*2:trunc(min(ih\\,720)/2)*2:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2';
const base = `[0:v]${exportVf}[base];`;
const wm = `[1:v]scale=w=-2:h=64[wm];`;
const fc = `${base}${wm}[base][wm]overlay=(main_w-overlay_w-24):(main_h-overlay_h-24):eof_action=repeat[out]`;
const args = ['-y', '-ss', String(startTime), '-t', String(duration), '-i', input, '-i', wmPng, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac', '-b:a', '128k', '-filter_complex', fc, '-map', '[out]', '-map', '0:a?', '-movflags', '+faststart', '-avoid_negative_ts', 'make_zero', out];

console.log('fc:', fc);
const t0 = Date.now();
try {
  execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  console.log('OK in', ((Date.now() - t0) / 1000).toFixed(1), 's');
} catch (e) {
  console.log('FAILED in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  console.log('stderr:', (e.stderr || '').toString().slice(-800));
  process.exit(1);
}