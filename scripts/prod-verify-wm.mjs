// 生产一键去水印验证: 真实"即梦AI"图片 → /api/ai-tools/image-dewatermark(无mask=一键) → 校验水印去除 + 内容保留
// 运行: node scripts/prod-verify-wm.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const BASE = process.env.BASE || 'https://www.clipopai.com';
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
let fetchImpl = globalThis.fetch;
let dispatcher;
if (proxyUrl) {
  const { fetch: ufetch, ProxyAgent } = await import('undici');
  fetchImpl = ufetch;
  dispatcher = new ProxyAgent(proxyUrl);
}
globalThis.fetch = (url, opts) => fetchImpl(url, { ...opts, ...(dispatcher ? { dispatcher } : {}) });

const env = readFileSync('.env.prod', 'utf8');
const SB_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL="?([^\n"]+)"?/)[1].trim();
const ANON = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY="?([^\n"]+)"?/)[1].trim();
const SERVICE = env.match(/SUPABASE_SERVICE_ROLE_KEY="?([^\n"]+)"?/)[1].trim();

// test account
let token, uid;
const email = `prod-wm-${Date.now()}@clipop.ai`;
const password = 'E2eTest#2026ai';
const created = await fetch(`${SB_URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, email_confirm: true }),
}).then((r) => r.json());
if (!created?.id) throw new Error('cannot create user');
const sess = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json());
token = sess.access_token; uid = sess.user.id;
console.log('account', email);

async function upload(blob, name, contentType) {
  const t = await fetch(`${BASE}/api/ai-tools/upload`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'ticket', filename: name }),
  }).then((r) => r.json());
  await fetch(t.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: blob });
  const s = await fetch(`${BASE}/api/ai-tools/upload`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'read-url', objectPath: t.objectPath }),
  }).then((r) => r.json());
  return s.signedUrl;
}

const src = '/Users/aiven/Downloads/微信图片_20260904222022_1128_246.png';
const imgBuf = await sharp(src).toFormat('png').toBuffer();

// BEFORE metric
const before = await sharp(imgBuf).ensureAlpha().removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = before.info.width, C = before.info.channels;
const lumS = new Float32Array(W * before.info.height);
for (let i = 0; i < W * before.info.height; i++) lumS[i] = 0.299 * before.data[i * C] + 0.587 * before.data[i * C + 1] + 0.114 * before.data[i * C + 2];
const bgS = [];
for (let y = 846; y < 858; y++) for (let x = 1006; x < 1274; x++) bgS.push(lumS[y * W + x]);
bgS.sort((a, b) => a - b);
const bg = bgS[Math.floor(bgS.length / 2)];
const thr = bg + 18;
let beforeBright = 0;
for (let y = 856; y < 924; y++) for (let x = 1006; x < 1274; x++) if (lumS[y * W + x] > thr) beforeBright++;
console.log('before bright glyph px', beforeBright, 'bg', Math.round(bg));

const t0 = Date.now();
const imageUrl = await upload(imgBuf, 'wm.png', 'image/png');
console.log('uploaded, calling one-click dewatermark (no mask)...');
const resp = await fetch(`${BASE}/api/ai-tools/image-dewatermark`, {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ imageUrl }),
});
const data = await resp.json().catch(() => ({}));
if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${JSON.stringify(data).slice(0, 300)} over ${(Date.now() - t0) / 1000}s`);
console.log(`one-click OK in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const outBuf = Buffer.from(await (await fetch(data.resultUrl)).arrayBuffer());
writeFileSync('/tmp/prod-wm-result.png', outBuf);
const after = await sharp(outBuf).ensureAlpha().removeAlpha().raw().toBuffer({ resolveWithObject: true });
const lumR = new Float32Array(W * after.info.height);
for (let i = 0; i < W * after.info.height; i++) lumR[i] = 0.299 * after.data[i * C] + 0.587 * after.data[i * C + 1] + 0.114 * after.data[i * C + 2];
let afterBright = 0;
for (let y = 856; y < 924; y++) for (let x = 1006; x < 1274; x++) if (lumR[y * W + x] > thr) afterBright++;
// content preserved check
const pts = [[430, 430], [620, 380], [950, 300], [150, 120]];
let contentOK = true;
for (const [x, y] of pts) {
  const i = (y * W + x) * C;
  const d = Math.abs(before.data[i] - after.data[i]) + Math.abs(before.data[i + 1] - after.data[i + 1]) + Math.abs(before.data[i + 2] - after.data[i + 2]);
  if (d > 3) { contentOK = false; console.log('content changed at', x, y, 'diff', d); }
}
console.log(`AFTER bright glyph px ${afterBright} (before ${beforeBright}); content preserved: ${contentOK}`);
// Robust metric: luminance CONTRAST (max-min) inside the watermark seal.
// Before: white "即梦AI" strokes against darker bg => high range.
// After (clean gradient fill): low range (smooth). Guards against bright-background false positives.
function rangeIn(lum, x0, x1, y0, y1) {
  let mn = 1e9, mx = -1e9;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const v = lum[y * W + x];
    if (v < mn) mn = v; if (v > mx) mx = v;
  }
  return [mn, mx];
}
const [bMin, bMax] = rangeIn(lumS, 1010, 1274, 860, 920);
const [aMin, aMax] = rangeIn(lumR, 1010, 1274, 860, 920);
const contrastBefore = bMax - bMin;
const contrastAfter = aMax - aMin;
console.log(`watermark-seal luminance range: BEFORE=${bMin.toFixed(0)}..${bMax.toFixed(0)} (Δ${contrastBefore})  AFTER=${aMin.toFixed(0)}..${aMax.toFixed(0)} (Δ${contrastAfter})`);
if (contrastAfter > contrastBefore * 0.5) throw new Error(`watermark residual: after contrast ${contrastAfter} too high vs before ${contrastBefore}`);
if (!contentOK) throw new Error('content damaged');
console.log('\n✓ PROD one-click dewatermark verified: 水印去除 (Δ对比'), contrastBefore, '→', contrastAfter, ') + 内容保留, result saved /tmp/prod-wm-result.png');