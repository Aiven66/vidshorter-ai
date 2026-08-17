/**
 * AI 工具箱 — 图像处理工具
 * Canvas 帮助函数 + CIE Lab 色彩空间转换（黑白上色用）
 */

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode canvas'))),
      type,
      quality
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 将图片绘制到限定尺寸内（保持纵横比） */
export function fitSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (width <= maxSide && height <= maxSide) return { width, height };
  const scale = maxSide / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/* -------------------------------------------------------------------------
 * CIE Lab 色彩空间（sRGB / D65）
 * ---------------------------------------------------------------------- */

const LAB_EPS = 216 / 24389; // 0.008856...
const LAB_KAPPA = 24389 / 27; // 903.296...

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
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

/** sRGB (0-255) -> CIE Lab (L: 0-100, a/b: ±128) */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbChannelToLinear(r / 255);
  const gl = srgbChannelToLinear(g / 255);
  const bl = srgbChannelToLinear(b / 255);

  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047;
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / 1.08883;

  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE Lab -> sRGB (0-255) */
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const x = labFInv(fx) * 0.95047;
  const y = labFInv(fy);
  const z = labFInv(fz) * 1.08883;

  const rl = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const gl = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

  return [
    Math.min(255, Math.max(0, Math.round(linearToSrgbChannel(rl) * 255))),
    Math.min(255, Math.max(0, Math.round(linearToSrgbChannel(gl) * 255))),
    Math.min(255, Math.max(0, Math.round(linearToSrgbChannel(bl) * 255))),
  ];
}

/**
 * 把单通道浮点图（如 Lab 的 a/b 通道，值域 ±range）绘制为灰度 canvas，
 * 借助 drawImage 的高质量插值缩放到目标尺寸，再读回浮点。
 */
export function resizeFloatChannel(
  channel: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  range: number
): Float32Array {
  if (srcW === dstW && srcH === dstH) return channel;

  const src = createCanvas(srcW, srcH);
  const srcCtx = src.getContext('2d')!;
  const srcData = srcCtx.createImageData(srcW, srcH);
  for (let i = 0; i < srcW * srcH; i++) {
    const v = Math.round(((channel[i] / range) + 1) * 127.5);
    const clamped = Math.min(255, Math.max(0, v));
    srcData.data[i * 4] = clamped;
    srcData.data[i * 4 + 1] = clamped;
    srcData.data[i * 4 + 2] = clamped;
    srcData.data[i * 4 + 3] = 255;
  }
  srcCtx.putImageData(srcData, 0, 0);

  const dst = createCanvas(dstW, dstH);
  const dstCtx = dst.getContext('2d')!;
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = 'high';
  dstCtx.drawImage(src, 0, 0, dstW, dstH);
  const dstData = dstCtx.getImageData(0, 0, dstW, dstH).data;

  const out = new Float32Array(dstW * dstH);
  for (let i = 0; i < dstW * dstH; i++) {
    out[i] = ((dstData[i * 4] / 127.5) - 1) * range;
  }
  return out;
}

/**
 * 掩码形态学膨胀（近似方形结构元），
 * 用于把用户涂抹区域外扩几个像素，保证水印边缘被完全覆盖。
 */
export function dilateMask(
  maskData: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  if (radius <= 0) {
    const out = new Uint8Array(width * height);
    for (let i = 0; i < out.length; i++) out[i] = maskData[i * 4] > 128 ? 1 : 0;
    return out;
  }

  let current = new Uint8Array(width * height);
  for (let i = 0; i < current.length; i++) current[i] = maskData[i * 4] > 128 ? 1 : 0;

  for (let iter = 0; iter < radius; iter++) {
    const next = new Uint8Array(current);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
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

/** 掩码 canvas 的非空 bounding box（白色涂抹区） */
export function maskBoundingBox(
  maskData: Uint8ClampedArray,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (maskData[(y * width + x) * 4] > 128) {
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
