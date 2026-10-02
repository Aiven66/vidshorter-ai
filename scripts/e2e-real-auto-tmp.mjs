// 真实"即梦AI"图片 — 完整服务端一键去水印管线验证 — 用后即删
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const BASE = 'http://localhost:5199';
const { token } = JSON.parse(readFileSync('/tmp/ait-e2e.json', 'utf8'));

async function upload(blob, name, contentType) {
  const t = await fetch(`${BASE}/api/ai-tools/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'ticket', filename: name }),
  }).then((r) => r.json());
  if (!t?.uploadUrl) throw new Error(`ticket failed: ${JSON.stringify(t).slice(0, 200)}`);
  const put = await fetch(t.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: blob });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  const s = await fetch(`${BASE}/api/ai-tools/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'read-url', objectPath: t.objectPath }),
  }).then((r) => r.json());
  if (!s?.signedUrl) throw new Error(`read-url failed`);
  return s.signedUrl;
}

const IMG = '/Users/aiven/.trae-cn/attachments/6a943db22f1256d4a294840b/08a534cc-a487-467a-92a8-b90161b0a7b8_2df378e3-71a9-43dc-8a31-b916817f2571_微信图片_20260904222022_1128_246.png';
const imgBuf = readFileSync(IMG);
const srcMeta = await sharp(imgBuf).metadata();
console.log(`source: ${srcMeta.width}x${srcMeta.height}`);

const t0 = Date.now();
const imageUrl = await upload(imgBuf, 'real-jimeng.png', 'image/png');
const resp = await fetch(`${BASE}/api/ai-tools/image-dewatermark`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ imageUrl }), // 一键模式
});
const data = await resp.json();
if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${JSON.stringify(data).slice(0, 300)}`);
const result = Buffer.from(await (await fetch(data.resultUrl)).arrayBuffer());
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s, result ${data.width}x${data.height}, ${(result.byteLength / 1024).toFixed(0)} KB`);

const raw = await sharp(result).raw().toBuffer({ resolveWithObject: true });
const W = raw.info.width;
const srcRaw = await sharp(imgBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const px = (buf, x, y) => {
  const i = (y * W + x) * buf.info.channels;
  return [buf.data[i], buf.data[i + 1], buf.data[i + 2]];
};
// 参考背景: 水印左侧未涂区 (990,905)
const bgRef = px(srcRaw, 990, 905);

let fail = 0;
// 水印笔画中心: 修复后亮度必须接近背景（不再亮白）
const CHECKS = [
  ['logo中心', 1040, 905], ['logo内部', 1030, 895],
  ['"即"', 1105, 905], ['"梦"', 1133, 905],
  ['"A"左', 1170, 905], ['"A"右', 1195, 905], ['"A"下', 1183, 915],
  ['"I"', 1259, 905],
];
for (const [label, x, y] of CHECKS) {
  const before = px(srcRaw, x, y);
  const after = px(raw, x, y);
  const lum = 0.299 * after[0] + 0.587 * after[1] + 0.114 * after[2];
  const bgLum = 0.299 * bgRef[0] + 0.587 * bgRef[1] + 0.114 * bgRef[2];
  const ok = lum < bgLum + 45;
  console.log(`  ${label} (${x},${y}): before rgb(${before}) lum=${(0.299 * before[0] + 0.587 * before[1] + 0.114 * before[2]).toFixed(0)} → after rgb(${after}) lum=${lum.toFixed(0)} (背景 lum=${bgLum.toFixed(0)}) ${ok ? '✓' : 'FAIL'}`);
  if (!ok) fail++;
}
// 右下角白块内容 (1282,940) 必须保持
const wbBefore = px(srcRaw, 1282, 940);
const wbAfter = px(raw, 1282, 940);
const wbOk = Math.abs(wbBefore[0] - wbAfter[0]) < 30 && Math.abs(wbBefore[1] - wbAfter[1]) < 30 && Math.abs(wbBefore[2] - wbAfter[2]) < 30;
console.log(`  右下角白块(1282,940): before rgb(${wbBefore}) → after rgb(${wbAfter}) ${wbOk ? '✓ 保留' : 'FAIL 误伤'}`);
if (!wbOk) fail++;
// 左半图 (100,500) 必须原样
const lfBefore = px(srcRaw, 100, 500);
const lfAfter = px(raw, 100, 500);
const lfOk = Math.abs(lfBefore[0] - lfAfter[0]) < 12 && Math.abs(lfBefore[1] - lfAfter[1]) < 12 && Math.abs(lfBefore[2] - lfAfter[2]) < 12;
console.log(`  左半图(100,500): before rgb(${lfBefore}) → after rgb(${lfAfter}) ${lfOk ? '✓ 保留' : 'FAIL 误伤'}`);
if (!lfOk) fail++;

// 水印区可视化对比
const vis = await sharp(result).extract({ left: 950, top: 850, width: Math.min(344, srcMeta.width - 950), height: Math.min(116, srcMeta.height - 850) }).resize(688, null, { kernel: 'nearest' }).png().toBuffer();
writeFileSync('/tmp/wm-real-auto-result.png', vis);
console.log(`result crop saved: /tmp/wm-real-auto-result.png`);
console.log(fail === 0 ? '\n=== REAL IMAGE AUTO PASS ===' : `\n=== ${fail} FAILURES ===`);
process.exit(fail === 0 ? 0 : 1);
