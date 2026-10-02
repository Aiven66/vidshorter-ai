// 真实"即梦AI"水印图 — 自动检测 + 手动涂抹并集 验证 — 用后即删
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const IMG = '/Users/aiven/.trae-cn/attachments/6a943db22f1256d4a294840b/08a534cc-a487-467a-92a8-b90161b0a7b8_2df378e3-71a9-43dc-8a31-b916817f2571_微信图片_20260904222022_1128_246.png';
const imgBuf = readFileSync(IMG);
const { data, info } = await sharp(imgBuf, { failOn: 'none' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
console.log(`image: ${W}x${H}`);

const { detectWatermark, expandMaskByBrightness } = await import('../src/lib/server/ai-tools/image-ops.ts');

const t0 = Date.now();
const det = detectWatermark(data, W, H);
const ms = Date.now() - t0;
if (!det) {
  console.log('FAIL: detectWatermark returned null');
  process.exit(1);
}
console.log(`detected: bbox=${JSON.stringify(det.bbox)} score=${det.score.toFixed(3)} 耗时=${ms}ms`);

// 分区笔画覆盖率（亮像素 lum≥200 = 水印笔画本体）
const REGIONS = [
  { name: 'logo', x0: 1012, x1: 1073 },
  { name: '即梦', x0: 1092, x1: 1145 },
  { name: 'AI', x0: 1156, x1: 1265 },
];
let fail = 0;
const coverage = (mask, x0, x1, y0 = 870, y1 = 930) => {
  let tot = 0, cov = 0, yMin = 1e9, yMax = -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * W + x) * 4;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum >= 200) { tot++; if (mask[y * W + x] === 1) cov++; if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
  }
  return { cov, tot, yMin: yMin === 1e9 ? -1 : yMin, yMax };
};

// 一键管线掩码 = 检测 + 亮度扩展（lamaInpaintAuto 的实际输入，膨胀 12px 再兜底）
const exp = expandMaskByBrightness(data, det.bin, det.gray, W, H);
console.log(`expand: addedPixels=${exp.addedPixels}`);
for (const r of REGIONS) {
  const d = coverage(det.gray, r.x0, r.x1);
  const e = coverage(exp.gray, r.x0, r.x1);
  const dpct = d.tot ? (100 * d.cov / d.tot).toFixed(1) : 'n/a';
  const epct = e.tot ? (100 * e.cov / e.tot).toFixed(1) : 'n/a';
  console.log(`  ${r.name}: 亮px=${d.tot} (y ${d.yMin}-${d.yMax}) 检测覆盖=${d.cov}/${d.tot}=${dpct}% 管线覆盖=${e.cov}/${e.tot}=${epct}%`);
  if (d.tot === 0) { console.log(`    FAIL: 区域无亮像素，区域坐标错误`); fail++; continue; }
  if (d.cov / d.tot < 0.7) { console.log(`    FAIL: 检测覆盖 < 70%`); fail++; }
  if (e.cov / e.tot < 0.9) { console.log(`    FAIL: 管线(det+expand)覆盖 < 90%`); fail++; }
}

// 右下角白块内容 (1272-1293, 926-958) 必须排除（检测+扩展都不得覆盖其中心）
const wb = (mask) => mask[940 * W + 1282] === 1;
if (wb(det.gray)) { console.log('  右下角白块(1282,940): 检测误伤! FAIL'); fail++; }
else if (wb(exp.gray)) { console.log('  右下角白块(1282,940): 扩展误伤! FAIL'); fail++; }
else console.log('  右下角白块(1282,940): 正确排除 ✓');

// 手动涂抹路径: 用户只涂 logo+即梦（模拟 v4 失败场景）→ 检测并集后全覆盖
const maskGray0 = new Uint8Array(W * H);
const maskBin0 = Buffer.alloc(W * H);
for (let y = 884; y < 926; y++) for (let x = 1010; x < 1152; x++) {
  maskGray0[y * W + x] = 1; maskBin0[y * W + x] = 255;
}
const overlapX = Math.min(det.bbox.x + det.bbox.w, 1152) - Math.max(det.bbox.x, 1010);
const overlapY = Math.min(det.bbox.y + det.bbox.h, 926) - Math.max(det.bbox.y, 884);
console.log(`\n手动路径: 涂抹bbox与检测bbox重叠 = ${overlapX > 0 && overlapY > 0 ? '是' : '否'}`);
const unionGray = Uint8Array.from(maskGray0);
const unionBin = Buffer.from(maskBin0);
if (overlapX > 0 && overlapY > 0) {
  for (let i = 0; i < unionGray.length; i++) {
    if (det.gray[i] && !unionGray[i]) { unionGray[i] = 1; unionBin[i] = 255; }
  }
}
const exp2 = expandMaskByBrightness(data, unionBin, unionGray, W, H);
const ai = coverage(exp2.gray, 1156, 1265);
console.log(`  涂抹logo+即梦 → 并集+扩展后 "AI"覆盖: ${ai.cov}/${ai.tot} = ${(100 * ai.cov / ai.tot).toFixed(1)}%`);
if (ai.cov / ai.tot < 0.9) fail++;

// 无水印纯渐变图 → 必须返回 null
const gw = 640, gh = 480;
const gbuf = Buffer.alloc(gw * gh * 4);
for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
  const i = (y * gw + x) * 4;
  gbuf[i] = Math.round((x / gw) * 60); gbuf[i + 1] = Math.round(80 + (y / gh) * 100); gbuf[i + 2] = Math.round(150 + (x / gw) * 90); gbuf[i + 3] = 255;
}
const neg = detectWatermark(gbuf, gw, gh);
console.log(`\n无水印渐变图: detect=${neg === null ? 'null ✓' : JSON.stringify(neg.bbox) + ' FAIL'}`);
if (neg !== null) fail++;

// 检测掩码可视化
const vis = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
  vis[i * 3] = exp.gray[i] ? 255 : 30;
  vis[i * 3 + 1] = exp.gray[i] ? 60 : 30;
  vis[i * 3 + 2] = exp.gray[i] ? 60 : 30;
}
const png = await sharp(vis, { raw: { width: W, height: H, channels: 3 } }).extract({
  left: 950, top: 850, width: Math.min(344, W - 950), height: Math.min(116, H - 850),
}).resize(688, null, { kernel: 'nearest' }).png().toBuffer();
writeFileSync('/tmp/wm-auto-detected.png', png);

console.log(fail === 0 ? '\n=== ALL PASS ===' : `\n=== ${fail} FAILURES ===`);
process.exit(fail === 0 ? 0 : 1);
