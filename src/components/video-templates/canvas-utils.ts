/**
 * HyperFrames-style canvas drawing utilities.
 *
 * Each scene draws its deterministic state to a canvas at a given progress (0-1).
 * This mirrors HyperFrames' per-frame rendering philosophy: instead of capturing
 * a live DOM (which fails due to CORS / web fonts / external CSS), we render the
 * exact frame directly via Canvas 2D API.
 */

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  progress: number; // 0..1 within the scene
  width: number;
  height: number;
}

/* ----------------------------- Easing ----------------------------- */

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/**
 * Staggered timing helper: returns progress for a child element given its
 * start offset and duration within the parent timeline.
 *
 * @param parentProgress 0..1 of the parent scene
 * @param start          0..1 when this child should begin
 * @param duration       0..1 how long the child takes to complete
 */
export function stagger(
  parentProgress: number,
  start: number,
  duration: number,
): number {
  if (duration <= 0) return parentProgress >= start ? 1 : 0;
  return clamp01((parentProgress - start) / duration);
}

/* ----------------------------- Backgrounds ----------------------------- */

export function fillGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  stops: Array<{ offset: number; color: string }>,
  direction: 'vertical' | 'horizontal' | 'diagonal' = 'diagonal',
) {
  let gradient: CanvasGradient;
  if (direction === 'vertical') {
    gradient = ctx.createLinearGradient(0, 0, 0, height);
  } else if (direction === 'horizontal') {
    gradient = ctx.createLinearGradient(0, 0, width, 0);
  } else {
    gradient = ctx.createLinearGradient(0, 0, width, height);
  }
  for (const s of stops) gradient.addColorStop(s.offset, s.color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export function fillSolid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
}

/* ----------------------------- Text ----------------------------- */

export function setFont(
  ctx: CanvasRenderingContext2D,
  opts: {
    size: number;
    weight?: number | string;
    family?: string;
    italic?: boolean;
  },
) {
  const weight = opts.weight ?? 600;
  const style = opts.italic ? 'italic ' : '';
  const family = opts.family ?? '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.font = `${style}${weight} ${opts.size}px ${family}`;
}

/**
 * Word-wrap text into lines that fit within maxWidth.
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return [];
  // Split by explicit newlines first, then wrap each line.
  const paragraphs = String(text).split(/\n/);
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (para === '') {
      lines.push('');
      continue;
    }
    // CJK-aware: split by characters for CJK, by words for Latin.
    const hasCJK = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(para);
    if (hasCJK) {
      let current = '';
      for (const ch of para) {
        const test = current + ch;
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current);
          current = ch;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
    } else {
      const words = para.split(/\s+/);
      let current = '';
      for (const word of words) {
        const test = current ? current + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
    }
  }
  return lines;
}

/**
 * Draw wrapped text. Returns the y position after the last line.
 */
export function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: CanvasTextAlign = 'left',
  baseline: CanvasTextBaseline = 'top',
): number {
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  const lines = wrapText(ctx, text, maxWidth);
  let currentY = y;
  for (const line of lines) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

/**
 * Draw multiline text centered vertically within a bounding box.
 */
export function drawCenteredBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = wrapText(ctx, text, maxWidth);
  const totalHeight = lines.length * lineHeight;
  let y = centerY - totalHeight / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const line of lines) {
    ctx.fillText(line, centerX, y);
    y += lineHeight;
  }
  return y;
}

/* ----------------------------- Shapes ----------------------------- */

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Draw a rounded rectangle with fill.
 */
export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

/* ----------------------------- Color helpers ----------------------------- */

/** Returns an rgba() string with the given alpha override. */
export function withAlpha(color: string, alpha: number): string {
  // Handle hex (#rgb, #rrggbb, #rrggbbaa)
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  // Handle rgb()/rgba()
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((p) => p.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }
  return color;
}

/* ----------------------------- Remote image cache ----------------------------- */
/*
 * 导出视频时 canvas 需要绘制商品主图等远程图片。
 * 由于 canvas 导出管线同步逐帧绘制，图片必须提前以 crossOrigin='anonymous'
 * 加载并缓存，否则 canvas 会被跨域图片污染（tainted）导致导出失败。
 */

const loadedImageCache = new Map<string, HTMLImageElement>();
const inFlightPreloads = new Map<string, Promise<HTMLImageElement | null>>();

/**
 * 预载远程图片（CORS 模式）并缓存。
 * 失败或超时返回 null（调用方应降级到占位符，不阻塞导出）。
 */
export function preloadImage(
  url: string,
  timeoutMs = 8000,
): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined' || !url) return Promise.resolve(null);
  const cached = loadedImageCache.get(url);
  if (cached) return Promise.resolve(cached);
  const inFlight = inFlightPreloads.get(url);
  if (inFlight) return inFlight;

  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => {
      img.src = '';
      resolve(null);
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      if (img.naturalWidth > 0) {
        loadedImageCache.set(url, img);
        resolve(img);
      } else {
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  }).finally(() => {
    inFlightPreloads.delete(url);
  });

  inFlightPreloads.set(url, p);
  return p;
}

/** 获取已缓存的图片（未加载或加载失败返回 null） */
export function getCachedImage(url?: string): HTMLImageElement | null {
  if (!url || typeof window === 'undefined') return null;
  return loadedImageCache.get(url) ?? null;
}

/**
 * 在指定矩形内 contain 绘制图片（保持宽高比，居中）。
 * 返回实际绘制的矩形，便于外层裁剪/描边。
 */
export function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
  return { x: dx, y: dy, w: dw, h: dh };
}
