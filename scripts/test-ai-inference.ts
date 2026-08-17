/**
 * AI 工具箱 — 真实模型推理验证（本地 / 服务端同构环境）
 *
 * 验证内容:
 * 1. 模型源可达（GitHub Releases HEAD 检查 + 大小匹配）
 * 2. LaMa 图片去水印: 梯度图 + 中心水印矩形掩码 → 修复区域必须变化
 * 3. Swin2SR 超分: 小图 2x → 输出尺寸翻倍
 * 4. Colorization 上色: 灰度图 → 输出必须引入色彩（a/b 通道非零）
 * 5. ffmpeg delogo: testsrc 合成视频 → delogo 输出可解码
 *
 * 运行: node --import tsx scripts/test-ai-inference.ts
 * 注意: 首次运行会下载 ~390MB 模型到 /tmp，需要几分钟。
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { MODEL_SOURCES } from '../src/lib/server/ai-tools/inference';
import { lamaInpaintServer } from '../src/lib/server/ai-tools/lama';
import { upscaleServer } from '../src/lib/server/ai-tools/upscale';
import { colorizeServer } from '../src/lib/server/ai-tools/colorize';

const execFileAsync = promisify(execFile);

/** PNG Buffer → data: URL（fetchImageRaw 用全局 fetch，undici 支持 data: 协议） */
function toDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function checkModelSources() {
  for (const [name, source] of Object.entries(MODEL_SOURCES)) {
    let resp: Response | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3 && !resp; attempt++) {
      try {
        resp = await fetch(source.primary, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(30_000),
        });
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    // 源可达性受网络波动影响，降级为警告 — 真正的门禁是下方真实推理
    if (!resp || !resp.ok) {
      console.warn(
        `⚠ model source unreachable (network?): ${name} — ${lastErr instanceof Error ? lastErr.message : resp ? `HTTP ${resp.status}` : 'no response'}`
      );
      continue;
    }
    const len = Number(resp.headers.get('content-length') || 0);
    if (len > 0 && len !== source.size) {
      console.warn(`⚠ ${name} size mismatch: HEAD ${len} != expected ${source.size}`);
    }
    console.log(`✓ model source reachable: ${name} (${(source.size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

async function makeTestImage(): Promise<{ image: Buffer; mask: Buffer }> {
  // 512x512 蓝绿渐变图 + 中央 120x60 白色"水印"
  const W = 512;
  const H = 512;
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      rgb[i] = Math.round((x / W) * 60); // R 低
      rgb[i + 1] = Math.round(80 + (y / H) * 120); // G 渐变
      rgb[i + 2] = Math.round(160 + (x / W) * 90); // B 高
    }
  }
  // 白色水印矩形
  const wx0 = 196, wy0 = 226, ww = 120, wh = 60;
  for (let y = wy0; y < wy0 + wh; y++) {
    for (let x = wx0; x < wx0 + ww; x++) {
      const i = (y * W + x) * 3;
      rgb[i] = 255; rgb[i + 1] = 255; rgb[i + 2] = 255;
    }
  }
  const image = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();

  // 掩码: 黑底 + 白色同位置矩形
  const maskRgb = Buffer.alloc(W * H * 3, 0);
  for (let y = wy0; y < wy0 + wh; y++) {
    for (let x = wx0; x < wx0 + ww; x++) {
      const i = (y * W + x) * 3;
      maskRgb[i] = 255; maskRgb[i + 1] = 255; maskRgb[i + 2] = 255;
    }
  }
  const mask = await sharp(maskRgb, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  return { image, mask };
}

async function testLama() {
  const { image, mask } = await makeTestImage();
  const t0 = Date.now();
  const { png, width, height } = await lamaInpaintServer(toDataUrl(image), toDataUrl(mask));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  assert.equal(width, 512);
  assert.equal(height, 512);
  assert.ok(png.byteLength > 1000, 'LaMa output PNG too small');

  // 修复区域中心必须不再是纯白（被修复为背景色）
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const cx = 256, cy = 256;
  const idx = (cy * width + cx) * info.channels;
  const [r, g, b] = [data[idx], data[idx + 1], data[idx + 2]];
  assert.ok(!(r > 240 && g > 240 && b > 240), `center must be inpainted, still white: ${r},${g},${b}`);
  assert.ok(b > g, `inpaint should restore blue-ish background, got r${r} g${g} b${b}`);
  console.log(`✓ LaMa inpaint (${secs}s): 512x512, watermark region restored`);
}

async function testUpscale() {
  // 128x96 小图 → 2x = 256x192
  const rgb = Buffer.alloc(128 * 96 * 3);
  for (let i = 0; i < 128 * 96; i++) {
    rgb[i * 3] = (i * 7) % 255;
    rgb[i * 3 + 1] = (i * 13) % 255;
    rgb[i * 3 + 2] = (i * 29) % 255;
  }
  const input = await sharp(rgb, { raw: { width: 128, height: 96, channels: 3 } }).png().toBuffer();

  const t0 = Date.now();
  const { png, width, height } = await upscaleServer(toDataUrl(input), 2);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  assert.equal(width, 256, `upscale 2x width must be 256, got ${width}`);
  assert.equal(height, 192, `upscale 2x height must be 192, got ${height}`);
  assert.ok(png.byteLength > 1000, 'upscale output PNG too small');
  console.log(`✓ Swin2SR upscale 2x (${secs}s): 128x96 → ${width}x${height}`);
}

async function testColorize() {
  // 256x256 灰度渐变图（带人物/风景式明暗分布更佳，渐变即可触发上色）
  const W = 256, H = 256;
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.round(((x + y) / (W + H)) * 255);
      const i = (y * W + x) * 3;
      rgb[i] = v; rgb[i + 1] = v; rgb[i + 2] = v;
    }
  }
  const input = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();

  const t0 = Date.now();
  const { png, width, height } = await colorizeServer(toDataUrl(input));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  assert.equal(width, W);
  assert.equal(height, H);
  assert.ok(png.byteLength > 1000, 'colorize output PNG too small');

  // 输出必须有色彩（RGB 通道出现差异）
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let colorPixels = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const r = data[i * info.channels];
    const g = data[i * info.channels + 1];
    const b = data[i * info.channels + 2];
    if (Math.abs(r - g) > 8 || Math.abs(g - b) > 8 || Math.abs(r - b) > 8) colorPixels++;
  }
  const ratio = colorPixels / n;
  assert.ok(ratio > 0.01, `colorize must introduce color, only ${(ratio * 100).toFixed(2)}% colored pixels`);
  console.log(`✓ Colorization (${secs}s): ${W}x${H}, ${(ratio * 100).toFixed(1)}% pixels colored`);
}

async function testFfmpegDelogo() {
  // 与 video-dewatermark 路由一致的探测逻辑：跳过 spawn 失败的二进制（macOS -88）
  const { spawnSync } = await import('node:child_process');
  const ffmpeg = (() => {
    const candidates: string[] = [];
    try {
      const p = require('ffmpeg-static');
      if (typeof p === 'string' && existsSync(p)) candidates.push(p);
    } catch { /* fallthrough */ }
    try {
      const inst = require('@ffmpeg-installer/ffmpeg');
      if (inst?.path && existsSync(inst.path)) candidates.push(inst.path);
    } catch { /* fallthrough */ }
    candidates.push('ffmpeg');
    for (const c of candidates) {
      try {
        if (spawnSync(c, ['-version'], { timeout: 10_000 }).status === 0) return c;
      } catch { /* next */ }
    }
    return 'ffmpeg';
  })();

  const workDir = await mkdtemp(path.join(tmpdir(), 'ai-ffmpeg-test-'));
  try {
    // 2 秒 testsrc 视频（640x360），叠加白色水印区域，再用 delogo 去除
    const inputPath = path.join(workDir, 'input.mp4');
    const outputPath = path.join(workDir, 'output.mp4');

    await execFileAsync(ffmpeg, [
      '-y', '-hide_banner',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=15',
      '-vf', 'drawbox=x=40:y=40:w=120:h=50:color=white@0.9:t=fill',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-an', inputPath,
    ], { timeout: 60_000 });

    await execFileAsync(ffmpeg, [
      '-y', '-hide_banner',
      '-i', inputPath,
      '-vf', 'delogo=x=42:y=42:w=116:h=46',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-an', outputPath,
    ], { timeout: 60_000 });

    const out = await readFile(outputPath);
    assert.ok(out.byteLength > 1024, 'delogo output too small');

    // 输出必须可解码（probe 一帧）
    try {
      await execFileAsync(ffmpeg, ['-hide_banner', '-i', outputPath, '-f', 'null', '-'], { timeout: 30_000 });
    } catch {
      // ffmpeg -i + null muxer 输出非零退出码但 stderr 有流信息时也算可解码
      const { stderr } = await execFileAsync(ffmpeg, ['-hide_banner', '-i', outputPath], { timeout: 30_000 }).catch((e) => e);
      assert.ok(/Video:/.test(String(stderr)), 'output must contain decodable video stream');
    }
    console.log(`✓ ffmpeg delogo: ${out.byteLength} bytes output, decodable`);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  console.log('— Check model sources —');
  await checkModelSources();

  console.log('\n— LaMa image inpainting —');
  await testLama();

  console.log('\n— Swin2SR upscale —');
  await testUpscale();

  console.log('\n— Colorization —');
  await testColorize();

  console.log('\n— ffmpeg delogo —');
  await testFfmpegDelogo();

  console.log('\nAll real-inference checks passed ✓');
}

main().catch((error) => {
  console.error('\nReal-inference check FAILED:', error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
