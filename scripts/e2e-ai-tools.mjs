// E2E: 本地服务端推理全链路（真实 Supabase 存储直传 → /api/ai-tools/* → 结果签名 URL）
// 前置: pnpm next build && pnpm next start -p 5199
// 运行: BASE=http://localhost:5199 node scripts/e2e-ai-tools.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const BASE = process.env.BASE || 'http://localhost:5199';

// ---- Supabase 配置（.env.prod）----
const env = readFileSync('.env.prod', 'utf8');
const SB_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL="?([^\n"]+)"?/)[1].trim();
const ANON = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY="?([^\n"]+)"?/)[1].trim();
const SERVICE = env.match(/SUPABASE_SERVICE_ROLE_KEY="?([^\n"]+)"?/)[1].trim();
const BUCKET = 'uploads';

// ---- 测试账号 ----
let token, uid;
{
  const email = `e2e-ait-${Date.now()}@clipop.ai`;
  const password = 'E2eTest#2026ai';
  // 1) 直接 signup
  let j = await fetch(`${SB_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json()).catch(() => null);
  if (j?.access_token) {
    token = j.access_token; uid = j.user.id;
  } else {
    // 2) signup 需邮箱确认 → admin API 建号（email_confirm=true）再密码登录
    const created = await fetch(`${SB_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true }),
    }).then((r) => r.json());
    if (!created?.id) throw new Error(`cannot create test user: ${JSON.stringify(created).slice(0, 200)}`);
    const sess = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then((r) => r.json());
    if (!sess?.access_token) throw new Error(`cannot login test user: ${JSON.stringify(sess).slice(0, 200)}`);
    token = sess.access_token; uid = sess.user.id;
  }
  console.log(`✓ test account ready: ${email} (${uid})`);
  writeFileSync('/tmp/ait-e2e.json', JSON.stringify({ email, token, uid }));
}

// ---- 上传（票据直传，与 client-api.ts 同流程）+ 签名 URL ----
async function upload(blob, name, contentType) {
  // 1. 票据
  const t = await fetch(`${BASE}/api/ai-tools/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'ticket', filename: name }),
  }).then((r) => r.json());
  if (!t?.uploadUrl || !t?.objectPath) throw new Error(`ticket failed: ${JSON.stringify(t).slice(0, 200)}`);
  // 2. 直传
  const put = await fetch(t.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: blob,
  });
  if (!put.ok) throw new Error(`direct PUT failed ${put.status}: ${(await put.text()).slice(0, 200)}`);
  // 3. 读签名
  const s = await fetch(`${BASE}/api/ai-tools/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'read-url', objectPath: t.objectPath }),
  }).then((r) => r.json());
  if (!s?.signedUrl) throw new Error(`read-url failed: ${JSON.stringify(s).slice(0, 200)}`);
  return s.signedUrl;
}

async function callApi(tool, body) {
  const resp = await fetch(`${BASE}/api/ai-tools/${tool}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`${tool} HTTP ${resp.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function verifyResult(tool, data, expectType) {
  if (!data.resultUrl) throw new Error(`${tool}: no resultUrl`);
  const r = await fetch(data.resultUrl);
  if (!r.ok) throw new Error(`${tool}: result fetch HTTP ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  const buf = Buffer.from(await r.arrayBuffer());
  if (!ct.includes(expectType)) throw new Error(`${tool}: content-type ${ct}`);
  if (buf.byteLength < 1000) throw new Error(`${tool}: result too small ${buf.byteLength}`);
  return buf;
}

// ---- 测试素材 ----
const workDir = mkdtempSync(path.join(tmpdir(), 'ait-e2e-'));
try {
  // 蓝渐变图 + 中央白水印
  const W = 480, H = 360;
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    rgb[i] = Math.round((x / W) * 60); rgb[i + 1] = Math.round(80 + (y / H) * 100); rgb[i + 2] = Math.round(150 + (x / W) * 90);
  }
  for (let y = 150; y < 200; y++) for (let x = 180; x < 300; x++) {
    const i = (y * W + x) * 3; rgb[i] = 255; rgb[i + 1] = 255; rgb[i + 2] = 255;
  }
  const testPng = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  const maskRgb = Buffer.alloc(W * H * 3, 0);
  for (let y = 150; y < 200; y++) for (let x = 180; x < 300; x++) {
    const i = (y * W + x) * 3; maskRgb[i] = 255; maskRgb[i + 1] = 255; maskRgb[i + 2] = 255;
  }
  const maskPng = await sharp(maskRgb, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();

  // 小测试视频 2s 320x240 + 左上白块
  const mp4Path = path.join(workDir, 'test.mp4');
  await execFileAsync('ffmpeg', ['-y', '-hide_banner', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=12',
    '-vf', 'drawbox=x=16:y=16:w=80:h=40:color=white@0.95:t=fill',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-an', mp4Path], { timeout: 60_000 });
  const testMp4 = readFileSync(mp4Path);

  // 1. 图片去水印
  {
    const t0 = Date.now();
    const imageUrl = await upload(testPng, 'e2e.png', 'image/png');
    const maskUrl = await upload(maskPng, 'e2e-mask.png', 'image/png');
    const data = await callApi('image-dewatermark', { imageUrl, maskUrl });
    const buf = await verifyResult('image-dewatermark', data, 'image/png');
    const meta = await sharp(buf).metadata();
    console.log(`✓ image-dewatermark (${((Date.now() - t0) / 1000).toFixed(1)}s): ${meta.width}x${meta.height}, ${(buf.byteLength / 1024).toFixed(0)} KB`);
  }

  // 2. 图片超分
  {
    const t0 = Date.now();
    const small = await sharp(testPng).resize(240, 180).png().toBuffer();
    const imageUrl = await upload(small, 'e2e-small.png', 'image/png');
    const data = await callApi('image-upscale', { imageUrl, scale: 2 });
    const buf = await verifyResult('image-upscale', data, 'image/png');
    const meta = await sharp(buf).metadata();
    // Swin2SR 前置 /8 对齐（180→184），输出允许 +16px 内的对齐余量
    const ok = meta.width >= 480 && meta.width <= 496 && meta.height >= 360 && meta.height <= 376;
    if (!ok) throw new Error(`upscale size ${meta.width}x${meta.height} outside aligned 2x range`);
    console.log(`✓ image-upscale 2x (${((Date.now() - t0) / 1000).toFixed(1)}s): 240x180 → ${meta.width}x${meta.height}`);
  }

  // 3. 黑白上色
  {
    const t0 = Date.now();
    const gray = await sharp(testPng).grayscale().png().toBuffer();
    const imageUrl = await upload(gray, 'e2e-gray.png', 'image/png');
    const data = await callApi('image-colorization', { imageUrl });
    await verifyResult('image-colorization', data, 'image/png');
    console.log(`✓ image-colorization (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  // 4. 视频去水印
  {
    const t0 = Date.now();
    const videoUrl = await upload(testMp4, 'e2e.mp4', 'video/mp4');
    const data = await callApi('video-dewatermark', { videoUrl, rects: [{ x: 0.05, y: 0.06, w: 0.25, h: 0.17 }] });
    const buf = await verifyResult('video-dewatermark', data, 'video/mp4');
    console.log(`✓ video-dewatermark (${((Date.now() - t0) / 1000).toFixed(1)}s): ${(buf.byteLength / 1024).toFixed(0)} KB mp4`);
  }

  console.log('\nAll AI-tools E2E checks passed ✓');
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
