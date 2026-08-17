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

/** 二值掩码形态学膨胀（方形结构元，radius 次迭代） */
export function dilateBinary(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  if (radius <= 0) return mask;
  let current = mask;
  for (let iter = 0; iter < radius; iter++) {
    const next = new Uint8Array(current); // 复制
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const idx = row + x;
        if (current[idx]) continue;
        if (
          (x > 0 && current[idx - 1]) ||
          (x < width - 1 && current[idx + 1]) ||
          (y > 0 && current[idx - width]) ||
          (y < height - 1 && current[idx + width])
        ) {
          next[idx] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

/** 对二值掩码做盒式模糊，得到 [0,1] 羽化权重（soft mask） */
export async function featherBinary(
  mask: Uint8Array,
  width: number,
  height: number,
  blurPx: number
): Promise<Float32Array> {
  const buf = Buffer.from(mask); // 0/1 灰度
  let pipeline = sharp(buf, { raw: { width, height, channels: 1 } });
  if (blurPx > 0) pipeline = pipeline.blur(blurPx);
  const out = await pipeline.raw().toBuffer();
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
