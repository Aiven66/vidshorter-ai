// 生产验证 P0-A 付费导出差异: multipart 文件上传分支 /api/cut-clip
//   free   → 720p + 水印 (clipopai.com, 右下角白字)
//   starter→ 1080p 无水印
// 用纯色暗底视频, 解码帧右下角区域统计近白像素: free 应有明显白字, paid 应无。
// 运行: node scripts/prod-verify-export-wm.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const BASE = process.env.BASE || 'https://www.clipopai.com';
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
// 必须用 undici 的 FormData/Blob/fetch（Node 全局 FormData 会被 undici 当 text/plain）
const { fetch: ufetch, FormData, ProxyAgent } = await import('undici');
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
globalThis.fetch = (url, opts) => ufetch(url, { ...opts, ...(dispatcher ? { dispatcher } : {}) });

const SRC = '/tmp/vs-src-color.mp4'; // testsrc2 彩色带 -> 任何角落白字都能从"原本无纯白文字"中凸显
const srcBuf = readFileSync(SRC);

const FFMPEG = '/opt/homebrew/bin/ffmpeg';

async function cut(plan, tag) {
  const fd = new FormData();
  fd.append('file', new Blob([srcBuf], { type: 'video/mp4' }), 'clip.mp4');
  fd.append('startTime', '1');
  fd.append('duration', '2');
  fd.append('plan', plan);
  const t0 = Date.now();
  const resp = await fetch(`${BASE}/api/cut-clip`, { method: 'POST', body: fd });
  const ct = resp.headers.get('content-type') || '';
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`${tag} HTTP ${resp.status}: ${body.slice(0, 300)}`);
  }
  const outBuf = Buffer.from(await resp.arrayBuffer());
  const outPath = `/tmp/vs-${plan}-${tag}.mp4`;
  writeFileSync(outPath, outBuf);
  console.log(`[${tag}] plan=${plan} OK over ${((Date.now() - t0) / 1000).toFixed(1)}s size=${outBuf.length} ct=${ct.slice(0, 40)}`);
  // 解码一帧 (t=1s) 校验可播放
  let decodeErr = '';
  try {
    execFileSync(FFMPEG, ['-v', 'error', '-ss', '1', '-i', outPath, '-frames:v', '1', `/tmp/vs-${plan}-${tag}.png`, '-y'], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) { decodeErr = (e.stdout || '').toString().slice(0, 300); }
  return outPath;
}

// 右下角区域统计分析 (720p 输出: 水印在 x=w-tw-24, y=h-th-24, fontsize≈19, 宽可达 ~200px)
async function countBrightCorner(path, tag) {
  const img = sharp(path).ensureAlpha().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = await img;
  const W = info.width, H = info.height;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];
  // 采样右下角 300x50 区域 (水印文字所在)
  const x0 = W - 300, x1 = W, y0 = H - 50, y1 = H;
  let bright = 0, total = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    total++;
    if (lum[y * W + x] > 200) bright++;
  }
  // 整幅图近白像素 (排除全面白底源的误判)
  let brightAll = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (lum[y * W + x] > 200) brightAll++;
  const pct = (bright / total * 100).toFixed(2);
  console.log(`[${tag}] ${W}x${H} brightCorner=${bright}/${total} (${pct}%) allBright=${brightAll}`);
  return bright;
}

const freePath = await cut('free', 'free');
const starterPath = await cut('starter', 'starter');
const freeBright = await countBrightCorner(freePath, 'free');
const starterBright = await countBrightCorner(starterPath, 'starter');

// 判定: free 应有明显白字 (越大越好), starter 应接近 0
console.log(`\nfree bright=${freeBright}  starter bright=${starterBright}`);
if (freeBright < 50) throw new Error(`WATERMARK MISSING for free: only ${freeBright} bright px in corner`);
if (starterBright > 200) throw new Error(`UNEXPECTED bright px for paid: ${starterBright}`);
console.log('\n✓ PROD export-diff verified: free=水印 (bright corner px), starter=无水印');