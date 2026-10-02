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

// 本机访问 *.vercel.app 需走本地代理（Node 内置 fetch 不读代理环境变量）——
// HTTPS_PROXY 设置时整体换用 undici fetch + ProxyAgent；网络层失败再重试 3 次
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
let fetchImpl = globalThis.fetch;
let proxyDispatcher;
if (proxyUrl) {
  const { fetch: undiciFetch, ProxyAgent } = await import('undici');
  fetchImpl = undiciFetch;
  proxyDispatcher = new ProxyAgent(proxyUrl);
}
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  // localhost 直连（走代理会 HeadersTimeout）；仅外部域名走代理
  const isLocal = u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1');
  const impl = isLocal ? globalThis.__nodeFetch || fetchImpl : fetchImpl;
  const dispatcher = isLocal ? undefined : proxyDispatcher;
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      return await impl(url, { ...opts, ...(dispatcher ? { dispatcher } : {}) });
    } catch (e) {
      lastErr = e;
      const code = String(e?.cause?.code || e?.code || e?.message || '');
      if (code.includes('TIMEOUT') || code.includes('ECONNRESET') || code.includes('fetch failed')) {
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
};

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
  // 蓝渐变背景 + 右下角"即梦AI"风格水印（白字 + 高斯光晕 + 细笔画"AI"）
  const W = 640, H = 480;
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    rgb[i] = Math.round((x / W) * 60); rgb[i + 1] = Math.round(80 + (y / H) * 100); rgb[i + 2] = Math.round(150 + (x / W) * 90);
  }
  // 水印形状（白色 RGBA）: "即梦"粗块 + "AI"两根细竖条（紧贴右侧，模拟细笔画字样）
  const WM_SHAPES = [
    { x: 400, y: 380, w: 70, h: 26 }, // "即梦"
    { x: 478, y: 382, w: 5, h: 22 },  // "A" 竖条
    { x: 490, y: 382, w: 5, h: 22 },  // "I" 竖条
  ];
  const wmLayer = Buffer.alloc(W * H * 4);
  for (const s of WM_SHAPES) {
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
      const i = (y * W + x) * 4; wmLayer[i] = 255; wmLayer[i + 1] = 255; wmLayer[i + 2] = 255; wmLayer[i + 3] = 255;
    }
  }
  const solidPng = await sharp(wmLayer, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const glowPng = await sharp(wmLayer, { raw: { width: W, height: H, channels: 4 } }).blur(3).png().toBuffer();
  const testPng = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: glowPng }, { input: solidPng }])
    .png().toBuffer();
  // 用户涂抹掩码: 只盖住"即梦"和第一根细条——第二根细条在掩码边缘外 4px
  // （复现真实场景: 涂抹不精确，v2 的 4px 模型尺度膨胀盖不住 → "AI"残留）
  const maskLayer = Buffer.alloc(W * H * 4);
  for (let y = 376; y < 410; y++) for (let x = 396; x < 486; x++) {
    const i = (y * W + x) * 4; maskLayer[i] = 255; maskLayer[i + 1] = 255; maskLayer[i + 2] = 255; maskLayer[i + 3] = 255;
  }
  const maskPng = await sharp(maskLayer, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

  // 小测试视频 2s 320x240 + 左上白块
  const mp4Path = path.join(workDir, 'test.mp4');
  await execFileAsync('ffmpeg', ['-y', '-hide_banner', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=12',
    '-vf', 'drawbox=x=16:y=16:w=80:h=40:color=white@0.95:t=fill',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-an', mp4Path], { timeout: 60_000 });
  const testMp4 = readFileSync(mp4Path);

  // 1. 图片去水印（"即梦AI"风格: 白字+光晕+细笔画，用户涂抹漏掉右侧细笔画）
  {
    const t0 = Date.now();
    const imageUrl = await upload(testPng, 'e2e.png', 'image/png');
    const maskUrl = await upload(maskPng, 'e2e-mask.png', 'image/png');
    const data = await callApi('image-dewatermark', { imageUrl, maskUrl });
    const buf = await verifyResult('image-dewatermark', data, 'image/png');
    const meta = await sharp(buf).metadata();
    const raw = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const px = (x, y) => {
      const i = (y * raw.info.width + x) * raw.info.channels;
      return [raw.data[i], raw.data[i + 1], raw.data[i + 2]];
    };
    // 背景参考: (435,393) 处原始背景 ≈ rgb(41,162,211)；水印白 = (255,255,255)
    // 断言1: "即梦"中心必须被修复为背景（不再是白/亮色）
    const jm = px(435, 393);
    if (jm[0] > 200 || jm[1] > 220) throw new Error(`image-dewatermark ineffective: 即梦 center still bright rgb(${jm})`);
    // 断言2（核心回归）: 漏涂的"AI"细竖条中心 (492,393)——掩码边缘外 4px，
    // v2 膨胀不足会残留白色细条；v3 原图尺度等效 12px 膨胀必须覆盖并修复
    const ai = px(492, 393);
    if (ai[0] > 200 || ai[1] > 220) throw new Error(`image-dewatermark residual: un-brushed AI stroke still bright rgb(${ai}) — dilation failed to cover`);
    // 断言3: 水印上方光晕带 (435,370)（掩码外、膨胀圈内）不得残留亮色
    const glow = px(435, 370);
    if (glow[0] > 200 || glow[1] > 220) throw new Error(`image-dewatermark residual glow: rgb(${glow})`);
    // 断言4: 远离水印的区域必须原样保留（原图 (100,100) = rgb(9,101,164)）
    const far = px(100, 100);
    if (Math.abs(far[0] - 9) > 3 || Math.abs(far[1] - 101) > 3 || Math.abs(far[2] - 164) > 3) {
      throw new Error(`non-mask region altered: rgb(${far})`);
    }
    console.log(`✓ image-dewatermark (${((Date.now() - t0) / 1000).toFixed(1)}s): ${meta.width}x${meta.height}, 即梦→rgb(${jm}), 漏涂AI细条→rgb(${ai}), 光晕→rgb(${glow})), ${(buf.byteLength / 1024).toFixed(0)} KB`);
  }

  // 1b. 图片去水印 — 大间距漏涂场景（"AI"距涂抹边缘 25px，超出 12px 膨胀圈，
  //     只有亮度引导扩展算法能修复；复现真实"即梦AI"水印 AI 距涂抹 20-120px）
  {
    const t0 = Date.now();
    const W2 = 640, H2 = 480;
    const rgb2 = Buffer.alloc(W2 * H2 * 3);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const i = (y * W2 + x) * 3;
      rgb2[i] = Math.round((x / W2) * 60); rgb2[i + 1] = Math.round(80 + (y / H2) * 100); rgb2[i + 2] = Math.round(150 + (x / W2) * 90);
    }
    // 水印: "即梦"粗块 + 距离 25px 的"AI"细竖条（大间距分离元素）
    const WM2 = [
      { x: 380, y: 380, w: 70, h: 26 }, // "即梦"
      { x: 478, y: 382, w: 6, h: 22 },  // "A"（掩码右缘 x=470，距 8px 内——膨胀兜底）
      { x: 500, y: 382, w: 6, h: 22 },  // "I"（掩码右缘外 30px——只有扩展算法能盖住）
    ];
    const wm2 = Buffer.alloc(W2 * H2 * 4);
    for (const s of WM2) {
      for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
        const i = (y * W2 + x) * 4; wm2[i] = 255; wm2[i + 1] = 255; wm2[i + 2] = 255; wm2[i + 3] = 255;
      }
    }
    const solid2 = await sharp(wm2, { raw: { width: W2, height: H2, channels: 4 } }).png().toBuffer();
    const glow2 = await sharp(wm2, { raw: { width: W2, height: H2, channels: 4 } }).blur(3).png().toBuffer();
    const testPng2 = await sharp(rgb2, { raw: { width: W2, height: H2, channels: 3 } })
      .composite([{ input: glow2 }, { input: solid2 }]).png().toBuffer();
    // 掩码只盖"即梦"（x:376-470），A/I 均在掩码外（A 距 8px、I 距 30px）
    const mask2 = Buffer.alloc(W2 * H2 * 4);
    for (let y = 376; y < 410; y++) for (let x = 376; x < 470; x++) {
      const i = (y * W2 + x) * 4; mask2[i] = 255; mask2[i + 1] = 255; mask2[i + 2] = 255; mask2[i + 3] = 255;
    }
    const maskPng2 = await sharp(mask2, { raw: { width: W2, height: H2, channels: 4 } }).png().toBuffer();

    const imageUrl = await upload(testPng2, 'e2e-far.png', 'image/png');
    const maskUrl = await upload(maskPng2, 'e2e-far-mask.png', 'image/png');
    const data = await callApi('image-dewatermark', { imageUrl, maskUrl });
    const buf = await verifyResult('image-dewatermark-far', data, 'image/png');
    const raw = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const px = (x, y) => {
      const i = (y * raw.info.width + x) * raw.info.channels;
      return [raw.data[i], raw.data[i + 1], raw.data[i + 2]];
    };
    // 断言1: "即梦"中心修复
    const jm2 = px(415, 393);
    if (jm2[0] > 200 || jm2[1] > 220) throw new Error(`far ineffective: 即梦 still bright rgb(${jm2})`);
    // 断言2（核心）: 距掩码 30px 的"I"细条中心 (503,393) 必须被扩展算法修复
    const iPx = px(503, 393);
    if (iPx[0] > 200 || iPx[1] > 220) throw new Error(`far residual: un-brushed I stroke (30px from mask) still bright rgb(${iPx}) — brightness-guided expansion failed`);
    // 断言3: 距掩码 8px 的"A"细条中心 (481,393) 必须被修复
    const aPx = px(481, 393);
    if (aPx[0] > 200 || aPx[1] > 220) throw new Error(`far residual: un-brushed A stroke still bright rgb(${aPx})`);
    console.log(`✓ image-dewatermark-far (${((Date.now() - t0) / 1000).toFixed(1)}s): 即梦→rgb(${jm2}), 距8px的A→rgb(${aPx}), 距30px的I→rgb(${iPx})`);
  }

  // 1c. 图片去水印 — 一键模式（无 maskUrl，服务端自动检测角落水印）
  //     水印画在右下角（真实水印位置先验），并在图片中部放一块亮色内容——
  //     断言自动检测只去角落水印、不误伤中部内容（位置硬约束回归）
  {
    const t0 = Date.now();
    const W3 = 640, H3 = 480;
    const rgb3 = Buffer.alloc(W3 * H3 * 3);
    for (let y = 0; y < H3; y++) for (let x = 0; x < W3; x++) {
      const i = (y * W3 + x) * 3;
      rgb3[i] = Math.round((x / W3) * 60); rgb3[i + 1] = Math.round(80 + (y / H3) * 100); rgb3[i + 2] = Math.round(150 + (x / W3) * 90);
    }
    // 角落水印（右下角，贴近边 ~5%）: 空心环 logo + "即梦"三竖条 + "AI"两细条
    // （分离笔画元素，模拟真实文字水印——实心大块会被 solidity 过滤，
    //  这是刻意设计: 真实水印笔画也是细笔画）
    const WM3 = [
      { x: 486, y: 432, w: 22, h: 4 },  // logo 环-上
      { x: 486, y: 450, w: 22, h: 4 },  // logo 环-下
      { x: 486, y: 434, w: 4, h: 16 },  // logo 环-左
      { x: 504, y: 434, w: 4, h: 16 },  // logo 环-右
      { x: 518, y: 434, w: 10, h: 20 }, // "即"
      { x: 533, y: 434, w: 10, h: 20 }, // "梦"
      { x: 548, y: 434, w: 10, h: 20 }, // "梦"续
      { x: 566, y: 434, w: 5, h: 20 },  // "A"
      { x: 578, y: 434, w: 5, h: 20 },  // "I"
    ];
    const wm3 = Buffer.alloc(W3 * H3 * 4);
    for (const s of WM3) {
      for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
        const i = (y * W3 + x) * 4; wm3[i] = 255; wm3[i + 1] = 255; wm3[i + 2] = 255; wm3[i + 3] = 255;
      }
    }
    // 中部亮色内容（假阳性陷阱: 位置硬约束必须拒绝它）
    const midContent = Buffer.alloc(W3 * H3 * 4);
    for (let y = 220; y < 260; y++) for (let x = 300; x < 345; x++) {
      const i = (y * W3 + x) * 4; midContent[i] = 255; midContent[i + 1] = 255; midContent[i + 2] = 255; midContent[i + 3] = 255;
    }
    const solid3 = await sharp(wm3, { raw: { width: W3, height: H3, channels: 4 } }).png().toBuffer();
    const glow3 = await sharp(wm3, { raw: { width: W3, height: H3, channels: 4 } }).blur(3).png().toBuffer();
    const midPng = await sharp(midContent, { raw: { width: W3, height: H3, channels: 4 } }).png().toBuffer();
    const testPng3 = await sharp(rgb3, { raw: { width: W3, height: H3, channels: 3 } })
      .composite([{ input: glow3 }, { input: solid3 }, { input: midPng }]).png().toBuffer();

    const imageUrl = await upload(testPng3, 'e2e-auto.png', 'image/png');
    const data = await callApi('image-dewatermark', { imageUrl }); // 无 maskUrl = 一键模式
    const buf = await verifyResult('image-dewatermark-auto', data, 'image/png');
    const raw = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const px = (x, y) => {
      const i = (y * raw.info.width + x) * raw.info.channels;
      return [raw.data[i], raw.data[i + 1], raw.data[i + 2]];
    };
    // 断言1: 角落水印"即梦"中心 (538,444) 必须被自动检测并修复
    const jm3 = px(538, 444);
    if (jm3[0] > 200 || jm3[1] > 220) throw new Error(`auto ineffective: corner 即梦 still bright rgb(${jm3}) — auto-detection missed corner watermark`);
    // 断言2: 角落"AI"细条中心 (580,444) 必须被修复
    const ai3 = px(580, 444);
    if (ai3[0] > 200 || ai3[1] > 220) throw new Error(`auto residual: corner AI stroke still bright rgb(${ai3})`);
    // 断言3（核心）: 中部亮色内容 (322,240) 必须原样保留（白 = 255,255,255）
    const mid = px(322, 240);
    if (mid[0] < 240 || mid[1] < 240 || mid[2] < 240) {
      throw new Error(`auto false-positive: mid-image content damaged rgb(${mid}) — corner gate failed`);
    }
    // 断言4: 远离水印的背景 (100,100) 原样
    const far3 = px(100, 100);
    if (Math.abs(far3[0] - 9) > 3 || Math.abs(far3[1] - 101) > 3 || Math.abs(far3[2] - 164) > 3) {
      throw new Error(`auto non-mask region altered: rgb(${far3})`);
    }
    console.log(`✓ image-dewatermark-auto (${((Date.now() - t0) / 1000).toFixed(1)}s): 角落即梦→rgb(${jm3}), 角落AI→rgb(${ai3}), 中部内容保留→rgb(${mid})`);
  }

  // 1d. 图片去水印 — 一键模式负面场景（无水印 → WATERMARK_NOT_FOUND）
  {
    const W4 = 640, H4 = 480;
    const rgb4 = Buffer.alloc(W4 * H4 * 4);
    for (let y = 0; y < H4; y++) for (let x = 0; x < W4; x++) {
      const i = (y * W4 + x) * 4;
      rgb4[i] = Math.round((x / W4) * 60); rgb4[i + 1] = Math.round(80 + (y / H4) * 100); rgb4[i + 2] = Math.round(150 + (x / W4) * 90); rgb4[i + 3] = 255;
    }
    const plainPng = await sharp(rgb4, { raw: { width: W4, height: H4, channels: 4 } }).png().toBuffer();
    const imageUrl = await upload(plainPng, 'e2e-plain.png', 'image/png');
    const resp = await fetch(`${BASE}/api/ai-tools/image-dewatermark`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ imageUrl }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.status !== 400 || data.error !== 'WATERMARK_NOT_FOUND') {
      throw new Error(`auto negative failed: HTTP ${resp.status} ${JSON.stringify(data).slice(0, 200)} — expected 400 WATERMARK_NOT_FOUND`);
    }
    console.log('✓ image-dewatermark-auto-negative: 无水印图正确返回 WATERMARK_NOT_FOUND');
  }

  // 1e. 图片去水印 — 一键模式分离元素场景（"即梦" + 94px 留白 + "AI"，复现
  //     用户的"AI 水印还是没去掉": 检测聚簇阈值 hgap 归并不了分离元素，印章
  //     矩形只盖住"即梦"，必须靠链式亮度扩展补上 "AI"）
  {
    const t0 = Date.now();
    const W5 = 640, H5 = 480;
    const rgb5 = Buffer.alloc(W5 * H5 * 3);
    for (let y = 0; y < H5; y++) for (let x = 0; x < W5; x++) {
      const i = (y * W5 + x) * 3;
      rgb5[i] = Math.round((x / W5) * 60); rgb5[i + 1] = Math.round(80 + (y / H5) * 100); rgb5[i + 2] = Math.round(150 + (x / W5) * 90);
    }
    // 右下角水印: "即梦"三竖条(x530-574) + 相隔 40px 的"AI"两细条(x614-629)
    //   gap 40 > hgap max(32, 20*1.8)=36 → 检测分成两个 cluster，bbox
    //   只盖"即梦"；"AI"必须由链式亮度扩展从右向左传播盖上
    //   （贴边: 即梦右缘 x574 距边 66px→distR=0.103<0.11 过角落门禁；
    //    AI右缘 x629 距边 11px）
    const WM5 = [
      { x: 530, y: 440, w: 14, h: 20 }, // "即"
      { x: 548, y: 440, w: 14, h: 20 }, // "梦"
      { x: 566, y: 440, w: 8, h: 20 },  // "梦"续（即梦右缘 x574）
      { x: 614, y: 442, w: 5, h: 18 },  // "A"（gap 40px）
      { x: 625, y: 442, w: 5, h: 18 },  // "I"（再右 11px）
    ];
    const wm5 = Buffer.alloc(W5 * H5 * 4);
    for (const s of WM5) for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
      const i = (y * W5 + x) * 4; wm5[i] = 255; wm5[i + 1] = 255; wm5[i + 2] = 255; wm5[i + 3] = 255;
    }
    const solid5 = await sharp(wm5, { raw: { width: W5, height: H5, channels: 4 } }).png().toBuffer();
    const glow5 = await sharp(wm5, { raw: { width: W5, height: H5, channels: 4 } }).blur(3).png().toBuffer();
    const testPng5 = await sharp(rgb5, { raw: { width: W5, height: H5, channels: 3 } })
      .composite([{ input: glow5 }, { input: solid5 }]).png().toBuffer();

    const imageUrl = await upload(testPng5, 'e2e-auto-far.png', 'image/png');
    const data = await callApi('image-dewatermark', { imageUrl }); // 无 maskUrl = 一键模式
    const buf = await verifyResult('image-dewatermark-auto-far', data, 'image/png');
    const raw = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const px = (x, y) => {
      const i = (y * raw.info.width + x) * raw.info.channels;
      return [raw.data[i], raw.data[i + 1], raw.data[i + 2]];
    };
    // 断言1: "即梦"中心 (537,450) 已修复
    const jm5 = px(537, 450);
    if (jm5[0] > 200 || jm5[1] > 220) throw new Error(`auto-far ineffective: 即梦 still bright rgb(${jm5})`);
    // 断言2（核心回归）: 相隔 40px 的"A"细条中心 (616,451) 必须被链式扩展盖住并修复
    const a5 = px(616, 451);
    if (a5[0] > 200 || a5[1] > 220) throw new Error(`auto-far residual: separated A stroke (40px) still bright rgb(${a5}) — chained brightness expansion failed`);
    // 断言3: 相隔 51px 的"I"细条中心 (627,451) 必须被修复
    const i5 = px(627, 451);
    if (i5[0] > 200 || i5[1] > 220) throw new Error(`auto-far residual: separated I stroke still bright rgb(${i5})`);
    // 断言4: 远处背景 (100,100) 原样
    const far5 = px(100, 100);
    if (Math.abs(far5[0] - 9) > 3 || Math.abs(far5[1] - 101) > 3 || Math.abs(far5[2] - 164) > 3) {
      throw new Error(`auto-far non-mask region altered: rgb(${far5})`);
    }
    console.log(`✓ image-dewatermark-auto-far (${((Date.now() - t0) / 1000).toFixed(1)}s): 即梦→rgb(${jm5}), 距40px的A→rgb(${a5}), 距51px的I→rgb(${i5})`);
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
    // 效果验证: 提取 1s 帧，水印中心 (56,36) 必须不再是白色
    const outPath = path.join(workDir, 'dw-out.mp4');
    const framePath = path.join(workDir, 'dw-frame.png');
    writeFileSync(outPath, buf);
    await execFileAsync('ffmpeg', ['-y', '-hide_banner', '-ss', '1', '-i', outPath, '-frames:v', '1', framePath], { timeout: 30_000 });
    const frame = await sharp(framePath).raw().toBuffer({ resolveWithObject: true });
    const fIdx = (36 * frame.info.width + 56) * frame.info.channels;
    const [fr, fg, fb] = [frame.data[fIdx], frame.data[fIdx + 1], frame.data[fIdx + 2]];
    if (fr > 240 && fg > 240 && fb > 240) throw new Error(`video-dewatermark ineffective: center still white ${fr},${fg},${fb}`);
    console.log(`✓ video-dewatermark (${((Date.now() - t0) / 1000).toFixed(1)}s): strategy=${data.strategy || 'n/a'}, watermark center → rgb(${fr},${fg},${fb}), ${(buf.byteLength / 1024).toFixed(0)} KB mp4`);
  }

  console.log('\nAll AI-tools E2E checks passed ✓');
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
