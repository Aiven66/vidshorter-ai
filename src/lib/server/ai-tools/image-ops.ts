/**
 * AI 工具箱 — 服务端图像处理工具（sharp + 纯数学函数）
 *
 * 色彩数学与 src/lib/ai-tools/image-utils.ts 保持同一套 sRGB/D65 Lab 约定，
 * 服务端用 LUT 加速大图逐像素转换。
 */

import sharp from 'sharp';

sharp.cache({ memory: 256 });
sharp.concurrency(2);

/* -------------------------------------------------------------------------
 * 尺寸工具
 * ---------------------------------------------------------------------- */

/** 将尺寸限制在 maxSide 内（保持纵横比） */
export function fitSize(
  width: number,
  height: number,
  maxSide: number
): { width: number; height: number } {
  if (width <= maxSide && height <= maxSide) return { width, height };
  const scale = maxSide / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** 把尺寸取整到 multiple 的倍数（≤ +multiple-1 的形变，可忽略） */
export function roundToMultiple(width: number, height: number, multiple: number) {
  return {
    width: Math.max(multiple, Math.round(width / multiple) * multiple),
    height: Math.max(multiple, Math.round(height / multiple) * multiple),
  };
}

/* -------------------------------------------------------------------------
 * sRGB <-> CIE Lab（D65），LUT 加速版
 * ---------------------------------------------------------------------- */

const LAB_EPS = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

/** 256 级 sRGB → 线性 RGB 查找表 */
const SRGB_TO_LINEAR = new Float64Array(256);
for (let c = 0; c < 256; c++) {
  const s = c / 255;
  SRGB_TO_LINEAR[c] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function linearToSrgbChannel(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function labF(t: number): number {
  return t > LAB_EPS ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}

function labFInv(t: number): number {
  const t3 = t * t * t;
  return t3 > LAB_EPS ? t3 : (116 * t - 16) / LAB_KAPPA;
}

export interface LabPixel {
  L: Float64Array;
  width: number;
  height: number;
}

/** 整幅 sRGB raw → Lab L 通道 [0,100]（LUT 加速） */
export function rgbRawToLChannel(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): LabPixel {
  const n = width * height;
  const L = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const rl = SRGB_TO_LINEAR[pixels[i * 4]];
    const gl = SRGB_TO_LINEAR[pixels[i * 4 + 1]];
    const bl = SRGB_TO_LINEAR[pixels[i * 4 + 2]];

    // L 只依赖 Y（相对亮度）
    const y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
    L[i] = 116 * labF(y) - 16;
  }
  return { L, width, height };
}

/** CIE Lab -> sRGB (0-255)，写入 pixels 的 RGB（alpha 不动） */
export function labToRgbInto(
  pixels: Uint8ClampedArray,
  L: Float64Array | Float32Array,
  a: Float64Array | Float32Array,
  b: Float64Array | Float32Array,
  offset = 0
): void {
  const n = L.length;
  for (let i = 0; i < n; i++) {
    const fy = (L[i] + 16) / 116;
    const fx = a[i] / 500 + fy;
    const fz = fy - b[i] / 200;

    const x = labFInv(fx) * 0.95047;
    const y = labFInv(fy);
    const z = labFInv(fz) * 1.08883;

    const rl = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
    const gl = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
    const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

    const idx = (offset + i) * 4;
    pixels[idx] = Math.min(255, Math.max(0, Math.round(linearToSrgbChannel(rl) * 255)));
    pixels[idx + 1] = Math.min(255, Math.max(0, Math.round(linearToSrgbChannel(gl) * 255)));
    pixels[idx + 2] = Math.min(255, Math.max(0, Math.round(linearToSrgbChannel(bl) * 255)));
  }
}

/* -------------------------------------------------------------------------
 * 单通道浮点缩放（借助 sharp 高质量插值，如 ab 色度通道上采样）
 * ---------------------------------------------------------------------- */

export async function resizeFloatChannel(
  channel: Float32Array | Float64Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  range: number
): Promise<Float32Array> {
  if (srcW === dstW && srcH === dstH) {
    return new Float32Array(channel);
  }

  // 浮点 → 8bit 灰度 raw → sharp resize → 读回浮点
  const src8 = Buffer.alloc(srcW * srcH);
  for (let i = 0; i < src8.length; i++) {
    const v = Math.round((channel[i] / range + 1) * 127.5);
    src8[i] = Math.min(255, Math.max(0, v));
  }

  const resized = await sharp(src8, {
    raw: { width: srcW, height: srcH, channels: 1 },
  })
    .resize(dstW, dstH, { kernel: 'cubic' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  const out = new Float32Array(dstW * dstH);
  for (let i = 0; i < out.length; i++) {
    out[i] = ((resized[i] / 127.5) - 1) * range;
  }
  return out;
}

/* -------------------------------------------------------------------------
 * 掩码处理
 * ---------------------------------------------------------------------- */

/** 掩码 bbox（单通道 raw，> threshold 视为选中） */
export function maskBBoxSingleChannel(
  mask: Uint8Array,
  width: number,
  height: number,
  threshold = 128
): { x: number; y: number; w: number; h: number } | null {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[row + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** 二值掩码形态学膨胀（可分解矩形结构元: 先水平 radiusX 再垂直 radiusY，
 *  等价于 [-rx,rx]x[-ry,ry] 方形核；窗口缩放比 x/y 不同时保持原图尺度等效） */
export function dilateBinary(
  mask: Uint8Array,
  width: number,
  height: number,
  radiusX: number,
  radiusY: number = radiusX
): Uint8Array {
  if (radiusX <= 0 && radiusY <= 0) return mask;
  // 水平 pass
  let current = mask;
  if (radiusX > 0) {
    for (let iter = 0; iter < radiusX; iter++) {
      const src = current;
      const dst = new Uint8Array(src);
      for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
          const idx = row + x;
          if (src[idx]) continue;
          if ((x > 0 && src[idx - 1]) || (x < width - 1 && src[idx + 1])) {
            dst[idx] = 1;
          }
        }
      }
      current = dst;
    }
  }
  // 垂直 pass
  if (radiusY > 0) {
    for (let iter = 0; iter < radiusY; iter++) {
      const src = current;
      const dst = new Uint8Array(src);
      for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
          const idx = row + x;
          if (src[idx]) continue;
          if ((y > 0 && src[idx - width]) || (y < height - 1 && src[idx + width])) {
            dst[idx] = 1;
          }
        }
      }
      current = dst;
    }
  }
  return current;
}

/* -------------------------------------------------------------------------
 * 亮度引导掩码扩展（修复"即梦AI"类水印涂抹不完整残留）
 *
 * 场景: 水印由多个分离元素组成（logo + "即梦" + "AI"），用户涂抹常漏掉
 * 部分元素（如只涂 logo+即梦，"AI" 距涂抹边缘可达 20-120px，任何固定
 * 膨胀都无法覆盖）。本算法自动把掩码附近的"水印色像素"纳入掩码:
 *
 * 1. 在掩码 bbox 外扩 search px 的搜索框内统计亮度
 * 2. 水印亮度 = 掩码内 p85；背景亮度 = 搜索框内非掩码 p50
 * 3. 对比度 ≥ 24 时，阈值 thr = bg + 0.45*diff 圈出候选像素
 *    （白色水印取更亮侧；黑色水印对称处理）
 * 4. 候选做 8 连通域，过滤噪点/大块背景，再要求与掩码行对齐
 *    （y 方向重叠 ≥ blob 高度 40%，防止误吞上下方的亮色内容）
 * 5. 通过约束的 blob 并入掩码
 * ---------------------------------------------------------------------- */

export interface ExpandedMask {
  bin: Buffer; // 0/255（供 sharp raw 管线）
  gray: Uint8Array; // 0/1
  addedPixels: number;
}

/** 掩码内像素太少时无法可靠估计水印亮度 */
const WM_EXTEND_MIN_MASK_PX = 8;
/** 低于该亮度对比度时放弃扩展（避免低对比度场景误伤） */
const WM_EXTEND_MIN_CONTRAST = 24;
/** 阈值分割系数: thr = bg + ratio * (wm - bg) */
const WM_EXTEND_THR_RATIO = 0.45;
/** 搜索框外扩量: max(72, bbox.w + bbox.h)，上限 220 */
const WM_EXTEND_SEARCH_MIN = 72;
const WM_EXTEND_SEARCH_MAX = 220;
/** 候选连通域最小面积（噪点过滤） */
const WM_EXTEND_MIN_BLOB = 12;

export function expandMaskByBrightness(
  rgba: Uint8ClampedArray | Uint8Array,
  maskBin: Buffer,
  maskGray: Uint8Array,
  width: number,
  height: number
): ExpandedMask {
  const bbox = maskBBoxSingleChannel(maskGray, width, height, 0);
  if (!bbox) return { bin: maskBin, gray: maskGray, addedPixels: 0 };

  // 掩码总面积（blob 大小上限用）
  let maskArea = 0;
  for (let i = 0; i < maskGray.length; i++) maskArea += maskGray[i];

  // 搜索框
  const search = Math.min(
    WM_EXTEND_SEARCH_MAX,
    Math.max(WM_EXTEND_SEARCH_MIN, bbox.w + bbox.h)
  );
  const sx0 = Math.max(0, bbox.x - search);
  const sy0 = Math.max(0, bbox.y - search);
  const sx1 = Math.min(width - 1, bbox.x + bbox.w - 1 + search);
  const sy1 = Math.min(height - 1, bbox.y + bbox.h - 1 + search);
  const sw = sx1 - sx0 + 1;
  const sh = sy1 - sy0 + 1;

  // 搜索框内亮度 + 水印/背景亮度采样
  const lum = new Uint8Array(sw * sh);
  const isMask = new Uint8Array(sw * sh);
  const wmSamples: number[] = [];
  const bgSamples: number[] = [];
  for (let y = sy0; y <= sy1; y++) {
    const rowOff = y * width;
    for (let x = sx0; x <= sx1; x++) {
      const gi = rowOff + x;
      const si = (y - sy0) * sw + (x - sx0);
      const pi = gi * 4;
      lum[si] =
        (0.299 * rgba[pi] + 0.587 * rgba[pi + 1] + 0.114 * rgba[pi + 2]) | 0;
      if (maskGray[gi]) {
        isMask[si] = 1;
        wmSamples.push(lum[si]);
      } else {
        bgSamples.push(lum[si]);
      }
    }
  }
  if (wmSamples.length < WM_EXTEND_MIN_MASK_PX || bgSamples.length < 32) {
    return { bin: maskBin, gray: maskGray, addedPixels: 0 };
  }

  wmSamples.sort((a, b) => a - b);
  bgSamples.sort((a, b) => a - b);
  // p97: 掩码内笔画亮度。用户画笔往往大面积盖住背景（笔画仅占掩码面积
  // 5%-40%），p85 在粗画笔下落在背景上导致对比度误判为不足、扩展失效
  // （"AI"残留的根因）；p97 只要笔画占 ≥3% 即稳定命中笔画
  const wmLum = wmSamples[Math.floor(wmSamples.length * 0.97)];
  const bgLum = bgSamples[Math.floor(bgSamples.length * 0.5)];
  const diff = wmLum - bgLum;
  if (Math.abs(diff) < WM_EXTEND_MIN_CONTRAST) {
    return { bin: maskBin, gray: maskGray, addedPixels: 0 };
  }
  const thr = bgLum + WM_EXTEND_THR_RATIO * diff;

  // 候选: 搜索框内非掩码的"水印色"像素
  const cand = new Uint8Array(sw * sh);
  for (let i = 0; i < cand.length; i++) {
    if (isMask[i]) continue;
    cand[i] = (diff > 0 ? lum[i] > thr : lum[i] < thr) ? 1 : 0;
  }

  // 8 连通域 BFS + 约束过滤
  const visited = new Uint8Array(sw * sh);
  const added = new Uint8Array(sw * sh);
  const queue = new Int32Array(sw * sh);
  const blobPixels = new Int32Array(sw * sh);
  const maxBlob = Math.max(400, maskArea * 3);
  const maskY0 = bbox.y;
  const maskY1 = bbox.y + bbox.h - 1;

  for (let seed = 0; seed < cand.length; seed++) {
    if (!cand[seed] || visited[seed]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    visited[seed] = 1;
    let bx0 = sw;
    let by0 = sh;
    let bx1 = -1;
    let by1 = -1;
    while (head < tail) {
      const p = queue[head++];
      blobPixels[head - 1] = p;
      const px = p % sw;
      const py = (p / sw) | 0;
      if (px < bx0) bx0 = px;
      if (px > bx1) bx1 = px;
      if (py < by0) by0 = py;
      if (py > by1) by1 = py;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= sh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = px + dx;
          if (nx < 0 || nx >= sw) continue;
          const ni = ny * sw + nx;
          if (cand[ni] && !visited[ni]) {
            visited[ni] = 1;
            queue[tail++] = ni;
          }
        }
      }
    }
    const area = tail;
    if (area < WM_EXTEND_MIN_BLOB || area > maxBlob) continue;
    // 行对齐约束: blob 与掩码 bbox 的 y 重叠 ≥ blob 高度的 40%
    // （排除上下方紧邻的亮色内容；水印同行字符 100% 通过）
    const blobY0 = by0 + sy0;
    const blobY1 = by1 + sy0;
    const blobH = blobY1 - blobY0 + 1;
    const overlap =
      Math.min(blobY1, maskY1) - Math.max(blobY0, maskY0) + 1;
    if (overlap < blobH * 0.4) continue;
    for (let i = 0; i < area; i++) added[blobPixels[i]] = 1;
  }

  // 生成扩展掩码
  let addedCount = 0;
  const newBin = Buffer.from(maskBin);
  const newGray = Uint8Array.from(maskGray);
  for (let y = sy0; y <= sy1; y++) {
    const rowOff = y * width;
    for (let x = sx0; x <= sx1; x++) {
      const gi = rowOff + x;
      if (maskGray[gi]) continue;
      const si = (y - sy0) * sw + (x - sx0);
      if (added[si]) {
        newGray[gi] = 1;
        newBin[gi] = 255;
        addedCount++;
      }
    }
  }
  return { bin: newBin, gray: newGray, addedPixels: addedCount };
}

/* -------------------------------------------------------------------------
 * 自动水印检测（一键去水印）
 *
 * 绝大多数水印（即梦AI / 剪映 / 抖音 / Sora / Midjourney …）是位于角落
 * 或底边的单行文字+logo: 颜色一致（全亮或全暗）、细笔画、与背景有对比度、
 * 多个笔画基线对齐（top/bottom 一致）。
 *
 * 算法（真实照片纹理复杂，内容 blob 常占多数，不能全局过滤）:
 * 1. 5 个候选区域: 右下/左下/右上/左上/底部中央（各 46%W x 30%H）
 * 2. 分块中位数估计局部背景（对渐变背景稳健），残差 = 亮度 - 局部背景
 * 3. 自适应阈值 thr = clamp(2.5σ_robust, 24, 60)，分亮/暗两个极性各自检测
 * 4. 连通域过滤: 面积/尺寸约束 + 实心内容块过滤（solidity ≥0.85 且
 *    bbox ≥350px² 是贴片/内容，细笔画文字不会近乎填满 bbox）
 * 5. 种子枚举聚簇: 每个 blob 作种子，按「近邻 + 与种子基线对齐」生长
 *    聚簇——同簇笔画 top/bottom 与种子一致（±55% 笔画高），紧邻但
 *    基线不符的内容块被排除
 * 6. 几何校验: 联合 bbox 尺寸（≤45%W，真水印 10-30%W）/纵横比/填充率
 *    符合"单行文字水印"先验
 * 7. 位置硬约束 + 评分: 簇 bbox 必须贴近图角（量纲距离 ≤11%）或贴近
 *    底边且水平居中——照片中部的内容文字一律拒绝（zone 锚点评分会把
 *    zone 内部的内容文字误判为水印，实测假阳性 0.86 分胜过真水印
 *    0.84 分）。评分 = 0.35*对比度 + 0.35*文字性 + 0.30*位置，
 *    全局最优且 ≥ 0.5 才采用
 * ---------------------------------------------------------------------- */

export interface DetectedWatermark {
  /** 全图 0/255 二值掩码（供 sharp raw 管线） */
  bin: Buffer;
  /** 全图 0/1 掩码 */
  gray: Uint8Array;
  bbox: { x: number; y: number; w: number; h: number };
  /** 聚簇评分 [0,1] */
  score: number;
}

/** 无有效水印时返回 null（调用方提示用户手动涂抹） */
export function detectWatermark(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): DetectedWatermark | null {
  // 小图不值得检测（水印检测无意义）
  if (width < 160 || height < 120) return null;

  const zw = Math.max(48, Math.round(width * 0.46));
  const zh = Math.max(48, Math.round(height * 0.3));
  const zones: Array<{ name: string; x0: number; y0: number }> = [
    { name: 'br', x0: width - zw, y0: height - zh },
    { name: 'bl', x0: 0, y0: height - zh },
    { name: 'tr', x0: width - zw, y0: 0 },
    { name: 'tl', x0: 0, y0: 0 },
    { name: 'bc', x0: Math.round((width - zw) / 2), y0: height - zh },
  ];

  const candidates: Array<{
    gray: Uint8Array;
    bbox: { x: number; y: number; w: number; h: number };
    score: number;
  }> = [];

  for (const zone of zones) {
    const zwEff = Math.min(zw, width - zone.x0);
    const zhEff = Math.min(zh, height - zone.y0);
    if (zwEff < 48 || zhEff < 48) continue;
    const zoneArea = zwEff * zhEff;

    // 亮度图
    const lum = new Uint8Array(zoneArea);
    for (let y = 0; y < zhEff; y++) {
      const rowOff = (zone.y0 + y) * width + zone.x0;
      for (let x = 0; x < zwEff; x++) {
        const pi = (rowOff + x) * 4;
        lum[y * zwEff + x] =
          (0.299 * rgba[pi] + 0.587 * rgba[pi + 1] + 0.114 * rgba[pi + 2]) | 0;
      }
    }

    // 分块中位数背景（对渐变背景稳健）
    const bs = Math.max(16, Math.ceil(Math.min(zwEff, zhEff) / 8));
    const bw = Math.ceil(zwEff / bs);
    const bh = Math.ceil(zhEff / bs);
    const blockMed = new Uint8Array(bw * bh);
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const hist = new Uint32Array(256);
        const x1 = Math.min(zwEff, (bx + 1) * bs);
        const y1 = Math.min(zhEff, (by + 1) * bs);
        const n = (x1 - bx * bs) * (y1 - by * bs);
        for (let y = by * bs; y < y1; y++) {
          for (let x = bx * bs; x < x1; x++) hist[lum[y * zwEff + x]]++;
        }
        let acc = 0;
        const half = n >> 1;
        for (let v = 0; v < 256; v++) {
          acc += hist[v];
          if (acc > half) { blockMed[by * bw + bx] = v; break; }
        }
      }
    }

    // 残差 + 稳健 σ（MAD）
    const residual = new Int16Array(zoneArea);
    const absRes = new Uint16Array(zoneArea);
    for (let y = 0; y < zhEff; y++) {
      const by = Math.min(bh - 1, (y / bs) | 0);
      for (let x = 0; x < zwEff; x++) {
        const bx = Math.min(bw - 1, (x / bs) | 0);
        const r = lum[y * zwEff + x] - blockMed[by * bw + bx];
        residual[y * zwEff + x] = r;
        absRes[y * zwEff + x] = Math.abs(r);
      }
    }
    const sortedAbs = Array.from(absRes).sort((a, b) => a - b);
    const mad = sortedAbs[sortedAbs.length >> 1];
    const thr = Math.max(24, Math.min(60, Math.round(2.5 * 1.4826 * mad)));

    // 两个极性分别检测（水印颜色一致: 全亮或全暗）
    for (const polarity of [1, -1] as const) {
      const cand = new Uint8Array(zoneArea);
      for (let i = 0; i < zoneArea; i++) {
        cand[i] = polarity * residual[i] > thr ? 1 : 0;
      }

      // 连通域 BFS
      interface Blob { x0: number; y0: number; x1: number; y1: number; area: number }
      const blobs: Blob[] = [];
      const visited = new Uint8Array(zoneArea);
      const queue = new Int32Array(zoneArea);
      const maxBlobArea = zoneArea * 0.08;
      for (let seed = 0; seed < zoneArea; seed++) {
        if (!cand[seed] || visited[seed]) continue;
        let head = 0, tail = 0;
        queue[tail++] = seed;
        visited[seed] = 1;
        let bx0 = zwEff, by0 = zhEff, bx1 = -1, by1 = -1;
        while (head < tail) {
          const p = queue[head++];
          const px = p % zwEff;
          const py = (p / zwEff) | 0;
          if (px < bx0) bx0 = px;
          if (px > bx1) bx1 = px;
          if (py < by0) by0 = py;
          if (py > by1) by1 = py;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = py + dy;
            if (ny < 0 || ny >= zhEff) continue;
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = px + dx;
              if (nx < 0 || nx >= zwEff) continue;
              const ni = ny * zwEff + nx;
              if (cand[ni] && !visited[ni]) { visited[ni] = 1; queue[tail++] = ni; }
            }
          }
        }
        const area = tail;
        const w = bx1 - bx0 + 1;
        const h = by1 - by0 + 1;
        if (area < 10 || area > maxBlobArea) continue;
        if (w > zwEff * 0.8 || h > zhEff * 0.6) continue;
        // 实心内容块过滤: bbox 较大且近乎填满的 blob 是内容（如右下角
        // 白色贴片 solidity 0.94），不是细笔画文字；实心圆形 logo
        // (π/4≈0.785) 与小图标 (<350px²) 不受影响
        if (w * h >= 350 && area / (w * h) >= 0.85) continue;
        blobs.push({ x0: bx0, y0: by0, x1: bx1, y1: by1, area });
      }
      if (blobs.length === 0) continue;

      // 种子枚举聚簇 + 评分竞选
      const seenClusters = new Set<string>();
      for (const seedBlob of blobs) {
        const medTop = seedBlob.y0;
        const medBottom = seedBlob.y1;
        const medH = seedBlob.y1 - seedBlob.y0 + 1;
        const tol = Math.max(8, medH * 0.55);
        // 水印是横排文字: 水平间隙容忍大，垂直间隙容忍小
        const hgap = Math.max(32, medH * 1.8);
        const vgap = Math.max(10, medH * 0.6);

        const cluster: Blob[] = [seedBlob];
        const inCluster = new Set<Blob>([seedBlob]);
        let cx0 = seedBlob.x0, cy0 = seedBlob.y0, cx1 = seedBlob.x1, cy1 = seedBlob.y1;
        let grew = true;
        while (grew) {
          grew = false;
          for (const b of blobs) {
            if (inCluster.has(b)) continue;
            const near =
              b.x0 <= cx1 + hgap && b.x1 >= cx0 - hgap &&
              b.y0 <= cy1 + vgap && b.y1 >= cy0 - vgap;
            if (!near) continue;
            // 基线对齐: 与种子 top/bottom 一致（排除紧邻但基线不符的内容块）
            if (Math.abs(b.y0 - medTop) > tol || Math.abs(b.y1 - medBottom) > tol) continue;
            cluster.push(b);
            inCluster.add(b);
            cx0 = Math.min(cx0, b.x0);
            cy0 = Math.min(cy0, b.y0);
            cx1 = Math.max(cx1, b.x1);
            cy1 = Math.max(cy1, b.y1);
            grew = true;
          }
        }

        // 联合 bbox 几何校验（"单行文字水印"先验）
        const unionW = cx1 - cx0 + 1;
        const unionH = cy1 - cy0 + 1;
        const unionArea = unionW * unionH;
        if (unionW < width * 0.04 || unionW > width * 0.45) continue;
        if (unionH < height * 0.012 || unionH > height * 0.22) continue;
        if (unionW / unionH < 0.8) continue;
        const strokeArea = cluster.reduce((s, b) => s + b.area, 0);
        const fill = strokeArea / unionArea;
        if (fill < 0.02 || fill > 0.82) continue;
        // 单 blob 且填充率高 → 实心内容块，拒绝；实心圆形 logo (π/4≈0.78) 放行
        if (cluster.length < 2 && fill > 0.72) continue;

        // 去重（相同簇从不同种子枚举多次）
        const key = `${cx0},${cy0},${cx1},${cy1}`;
        if (seenClusters.has(key)) continue;

        // 角落/底边先验（硬约束）: 真水印贴近图角或底边（量纲距离 ≤11%），
        // 照片中部的内容文字一律拒绝。用簇 bbox 到图像边缘的距离评分，
        // 不用 zone 锚点（zone 内部的内容文字会误拿高分）
        const abx = cx0 + zone.x0;
        const aby = cy0 + zone.y0;
        const distL = abx / width;
        const distR = (width - (abx + unionW)) / width;
        const distT = aby / height;
        const distB = (height - (aby + unionH)) / height;
        const nearCorner =
          1 - Math.min(1, Math.max(Math.min(distL, distR), Math.min(distT, distB)) / 0.15);
        const centerDev = Math.abs((abx + unionW / 2) / width - 0.5);
        const nearBottomCenter =
          1 - Math.min(1, Math.max(distB / 0.15, centerDev / 0.25));
        const cornerN = Math.max(nearCorner, nearBottomCenter);
        if (cornerN < 0.25) continue;

        // 评分
        let sumAbs = 0;
        for (const b of cluster) {
          for (let y = b.y0; y <= b.y1; y++) {
            for (let x = b.x0; x <= b.x1; x++) {
              const i = y * zwEff + x;
              if (cand[i]) sumAbs += Math.abs(residual[i]);
            }
          }
        }
        const contrastN = Math.min(1, sumAbs / strokeArea / 70);
        const textN = Math.min(1, cluster.length / 4);
        const score = 0.35 * contrastN + 0.35 * textN + 0.3 * cornerN;
        if (score < 0.5) continue;
        seenClusters.add(key);

        // 生成全图掩码
        const gray = new Uint8Array(width * height);
        for (const b of cluster) {
          for (let y = b.y0; y <= b.y1; y++) {
            const giRow = (zone.y0 + y) * width;
            for (let x = b.x0; x <= b.x1; x++) {
              const zi = y * zwEff + x;
              if (cand[zi]) gray[giRow + zone.x0 + x] = 1;
            }
          }
        }
        candidates.push({
          gray,
          bbox: { x: abx, y: aby, w: unionW, h: unionH },
          score,
        });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // 合并: 同一水印从不同种子枚举会得到不同成员子集（logo 种子的基线
  // 容忍会拒绝与它偏差略超限的笔画 blob，如 "A" 的下半部，而笔画种子
  // 收了它）——把与胜出簇 bbox 显著重叠（≥35% 小者面积）的其它簇
  // 并入，掩码取并集
  let outGray = best.gray;
  let outBBox = best.bbox;
  const bestArea = best.bbox.w * best.bbox.h;
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const ox =
      Math.min(outBBox.x + outBBox.w, c.bbox.x + c.bbox.w) -
      Math.max(outBBox.x, c.bbox.x);
    const oy =
      Math.min(outBBox.y + outBBox.h, c.bbox.y + c.bbox.h) -
      Math.max(outBBox.y, c.bbox.y);
    if (ox <= 0 || oy <= 0) continue;
    if ((ox * oy) / Math.min(bestArea, c.bbox.w * c.bbox.h) < 0.35) continue;
    const g = new Uint8Array(outGray.length);
    for (let k = 0; k < g.length; k++) g[k] = outGray[k] | c.gray[k];
    outGray = g;
    outBBox = {
      x: Math.min(outBBox.x, c.bbox.x),
      y: Math.min(outBBox.y, c.bbox.y),
      w:
        Math.max(outBBox.x + outBBox.w, c.bbox.x + c.bbox.w) -
        Math.min(outBBox.x, c.bbox.x),
      h:
        Math.max(outBBox.y + outBBox.h, c.bbox.y + c.bbox.h) -
        Math.min(outBBox.y, c.bbox.y),
    };
  }

  const bin = Buffer.alloc(width * height);
  for (let i = 0; i < bin.length; i++) bin[i] = outGray[i] ? 255 : 0;
  return { bin, gray: outGray, bbox: outBBox, score: best.score };
}

/**
 * 对二值掩码做高斯羽化，得到 [0,1] soft mask。
 * 注意 1: 输入是 0/1 二值；必须先放大到 0/255 再 blur，
 * 否则 blur 输出仍在 [0,1]、除以 255 后 alpha ≤ 1/255，混合近似无操作。
 * 注意 2: sharp 对 1 通道 raw 输入经 blur 后会输出 3 通道，
 * 必须尾部 toColourspace('b-w') 强制回 1 通道，否则掩码数据错乱。
 */
export async function featherBinary(
  mask: Uint8Array,
  width: number,
  height: number,
  blurPx: number
): Promise<Float32Array> {
  const buf = Buffer.alloc(mask.length);
  for (let i = 0; i < mask.length; i++) buf[i] = mask[i] ? 255 : 0;
  let pipeline = sharp(buf, { raw: { width, height, channels: 1 } });
  if (blurPx > 0) pipeline = pipeline.blur(blurPx);
  const out = await pipeline.toColourspace('b-w').raw().toBuffer();
  const result = new Float32Array(width * height);
  for (let i = 0; i < result.length; i++) {
    result[i] = out[i] / 255;
  }
  return result;
}

/* -------------------------------------------------------------------------
 * sharp 帮助函数
 * ---------------------------------------------------------------------- */

/** 下载图片为 RGBA raw（限定 maxSide），返回像素 + 尺寸 */
export async function fetchImageRaw(
  url: string,
  maxSide?: number
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`Failed to fetch image: HTTP ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  let pipeline = sharp(Buffer.from(arrayBuffer), { failOn: 'none' }).ensureAlpha();
  const meta = await sharp(Buffer.from(arrayBuffer), { failOn: 'none' }).metadata();
  let width = meta.width ?? 0;
  let height = meta.height ?? 0;
  if (!width || !height) throw new Error('Invalid image dimensions');

  if (maxSide && (width > maxSide || height > maxSide)) {
    const fitted = fitSize(width, height, maxSide);
    width = fitted.width;
    height = fitted.height;
    pipeline = pipeline.resize(width, height, { kernel: 'lanczos3', fit: 'fill' });
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
    width: info.width,
    height: info.height,
  };
}

/** raw RGB（3 通道交错）→ PNG buffer */
export async function rawRgbToPng(
  rgb: Uint8Array,
  width: number,
  height: number
): Promise<Buffer> {
  return sharp(Buffer.from(rgb), {
    raw: { width, height, channels: 3 },
  })
    .png({ compressionLevel: 6 })
    .toBuffer();
}
