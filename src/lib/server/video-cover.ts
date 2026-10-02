import os from 'os';
import path from 'path';
import { access } from 'fs/promises';

/**
 * P0 — #1 关键帧封面（Starter+ 付费权益）。
 *
 * 用 sharp 把「关键帧 + 标题叠字」合成一张可发布的封面图（对标 Recapo 封面）。
 * 输出 JPEG，流式返回避免 OOM。
 *
 * 布局（16:9 / 9:16 通用）：
 *   1. 底层 = 关键帧铺满 + 高斯模糊 + 压暗（营造沉浸背景）
 *   2. 中层 = 关键帧本体按原宽高比内嵌为画卡
 *   3. 顶层 = 底部渐变压暗 + 标题文字 + 品牌小标 + 时间码
 *
 * ⚠️ 字体说明：生产 ffmpeg-static 无 drawtext，故文字用 SVG + sharp 光栅化。
 * 标题若含 CJK，会尝试定位系统 CJK 字体（Mac 上 PingFang/Heiti 可直接命中；
 * Linux/Serverless 上先查常见路径，再尝试运行时下载 Noto Sans SC 到 /tmp）。
 * 找不到字体则优雅降级为「只显示品牌+时间码」，不抛错。
 */

export interface CoverInput {
  /** 关键帧 PNG/JPEG 原始字节（来自 ffmpeg 抽帧） */
  frame: Buffer;
  /** 标题文字（来自 clip.title，语言随 UI locale） */
  title: string;
  /** '16:9' 或 '9:16' */
  orientation?: '16:9' | '9:16';
  /** 高光起点秒数（显示为时间码） */
  startTime?: number;
  /** 品牌小标，默认 clipopai.com */
  brand?: string;
}

/** UTF-8 字节数（CJK 一字≈3 字节，用于按字节宽度换行） */
function utf8Len(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/** 中文字符即视为一个宽字符（ASCII 半宽），其它按 1 计。 */
function charWidth(ch: string): number {
  const c = ch.codePointAt(0)!;
  if (
    (c >= 0x2e80 && c <= 0x9fff) || // CJK 部首/统一汉字
    (c >= 0xf900 && c <= 0xfaff) || // CJK 兼容
    (c >= 0xff00 && c <= 0xffef) || // 全角
    (c >= 0xac00 && c <= 0xd7af) || // 韩文音节
    (c >= 0x3040 && c <= 0x30ff)    // 日文假名
  ) {
    return 2;
  }
  if (ch === ' ') return 1;
  // 其余按 1 处理（英文/数字），utf8Len 兜底由调用方校正
  return 1;
}

function stringWidth(s: string): number {
  let w = 0;
  for (const ch of Array.from(s)) w += charWidth(ch);
  return w;
}

/** CJK 标题按「单行最大宽度（逻辑单位）」自动换行，返回若干行。 */
function wrapTitle(title: string, maxWidth: number, maxLines: number): string[] {
  const normalized = title.replace(/\s+/g, ' ').trim();
  const chars = Array.from(normalized);
  const lines: string[] = [];
  let line = '';
  let lineW = 0;
  for (const ch of chars) {
    const cw = charWidth(ch);
    if (lineW + cw > maxWidth && line) {
      lines.push(line);
      line = '';
      lineW = 0;
      if (lines.length >= maxLines) break;
    }
    line += ch;
    lineW += cw;
  }
  if (line) lines.push(line);
  // 超行数截断加省略号
  const clipped = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    clipped[maxLines - 1] = (clipped[maxLines - 1] || '').replace(/\s+$/, '') + '…';
  }
  return clipped.length > 0 ? clipped : [' '];
}

const isAscii = (s: string) => /^[\x00-\x7F]*$/.test(s);

/** 候选字体路径（Mac / 常见 Linux / 运行时下载缓存）。粗体优先。 */
const FONT_CANDIDATES: string[] = [
  process.platform === 'darwin'
    ? '/System/Library/Fonts/STHeiti Medium.ttc'
    : '',
  process.platform === 'darwin'
    ? '/System/Library/Fonts/Supplemental/Songti.ttc'
    : '',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  path.join(os.tmpdir(), 'clipopai-noto-sans-sc-bold.ttf'),
  // 递归只尝试到这里的常见路径；找不到则降级（跳过标题文字）
].filter(Boolean);

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** 运行时下载 Noto Sans SC Bold 到 /tmp（memoized），供无系统 CJK 字体的环境降级取用。 */
let cjkFontMemo: string | null = null;
let cjkFontPromise: Promise<string | null> | null = null;

async function ensureCjkFont(): Promise<string | null> {
  if (!isAscii('中')) return null; // 有系统字体（Mac），无需下载
  if (cjkFontMemo) return cjkFontMemo;
  if (!cjkFontPromise) {
    cjkFontPromise = (async () => {
      const target = path.join(os.tmpdir(), 'clipopai-noto-sans-sc-bold.ttf');
      if (await fileExists(target)) {
        cjkFontMemo = target;
        return target;
      }
      // Noto Sans SC（思源黑体子集）Bold 子集 ttf，来自 Google Fonts 稳定 CDN
      const urls = [
        'https://fonts.gstatic.com/s/notosanssc/v37/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG9_FnYxNbPzS5HE.ttf',
      ];
      for (const u of urls) {
        try {
          const res = await fetch(u, { signal: AbortSignal.timeout(15_000) });
          if (!res.ok) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 50_000) continue;
          const { writeFile } = await import('fs/promises');
          await writeFile(target, buf);
          cjkFontMemo = target;
          return target;
        } catch {
          // 尝试下一个 URL
        }
      }
      return null;
    })();
  }
  return cjkFontPromise;
}

/** 选一个可用的字体路径：优先系统粗体；非 ASCII 标题才会触发 CJK 下载/下载路径。 */
async function resolveFontPath(needCjk: boolean): Promise<string | null> {
  if (!needCjk) {
    for (const p of FONT_CANDIDATES) {
      if (!p.includes('Noto')) continue; // 拉丁粗体
      if (await fileExists(p)) return p;
    }
    for (const p of FONT_CANDIDATES) {
      if (p.includes('Noto')) continue;
      if (await fileExists(p)) return p;
    }
    return null;
  }
  for (const p of FONT_CANDIDATES) {
    if (p.includes('Noto') || p.endsWith('.ttc')) {
      if (await fileExists(p)) return p;
    }
  }
  return ensureCjkFont();
}

/** 构造标题 SVG（透明，white 文字 + 底部渐变 scrim）。 */
function buildTitleSvg(opts: {
  width: number;
  height: number;
  lines: string[];
  subtitle: string;
  needCjk: boolean;
  font: string | null;
}): Buffer {
  const { width, height, lines, subtitle, needCjk, font } = opts;
  const pad = Math.round(width * 0.06);
  const sidePad = Math.round(width * 0.06);
  const cx = Math.round(width / 2);
  const lineH = needCjk
    ? Math.round(width * 0.115)
    : Math.round(width * 0.085);
  const titleSize = needCjk
    ? Math.round(width * 0.062)
    : Math.round(width * 0.05);
  const subSize = Math.round(width * 0.022);
  const textTop = Math.round(height - pad - lines.length * lineH);
  const fontFamily = font
    ? `'${font.split('/').pop()?.replace(/\.(ttf|otf|ttc)$/, '') || 'sans-serif'}'`
    // ⚠️ 内层必须用单引号：此值会被拼进 font-family="..."（双引号包裹的 XML 属性），
    //    若含双引号会截断属性导致 librsvg XML 解析报 "tag mismatch: svg and text"。
    : "Arial, Helvetica, 'PingFang SC', 'Noto Sans CJK SC', sans-serif";

  let textEls = '';
  lines.forEach((line, i) => {
    const y = textTop + i * lineH + titleSize;
    textEls +=
      `<text x="${cx}" y="${y}" text-anchor="middle" fill="rgba(255,255,255,0.98)"` +
      ` font-family="${fontFamily}" font-size="${titleSize}" font-weight="${needCjk ? 600 : 700}"` +
      ` stroke="rgba(0,0,0,0.55)" stroke-width="${Math.max(2, Math.round(titleSize * 0.09))}"` +
      ` paint-order="stroke" stroke-linejoin="round">${escapeXml(line)}</text>`;
  });

  // 底部渐变压暗（让文字更清晰）
  const scrimH = Math.round(height * 0.42);
  const scrimTop = height - scrimH;
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.74"/>` +
      `</linearGradient></defs>` +
      `<rect x="0" y="${scrimTop}" width="${width}" height="${scrimH}" fill="url(#scrim)"/>` +
      `${textEls}` +
      `<text x="${cx}" y="${textTop - Math.round(lineH * 0.28)}" text-anchor="middle"` +
      ` fill="rgba(255,255,255,0.82)" font-family="Arial, sans-serif" font-size="${subSize}" font-weight="600"` +
      ` letter-spacing="2">${escapeXml(subtitle)}</text>` +
      `</svg>`,
  );
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function formatTimecode(seconds?: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '';
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * 合成封面（sharp 管多层位图合成，文字用 SVG 光栅化）。
 * 返回 JPEG 字节。任何文字/字体失败都优雅降级（不影响返回封面）。
 */
export async function composeCover(input: CoverInput): Promise<Buffer> {
  const orientation = input.orientation === '9:16' ? '9:16' : '16:9';
  const W = orientation === '9:16' ? 1080 : 1280;
  const H = orientation === '9:16' ? 1920 : 720;
  const brand = (input.brand || 'clipopai.com').trim();
  const tc = formatTimecode(input.startTime);
  const subtitle = [brand, tc].filter(Boolean).join('   ');
  const needCjk = !isAscii(input.title);

  // 决定单行最大宽度（逻辑单位）：16:9 可用更宽
  const maxLineWidth = orientation === '9:16' ? Math.round(W / 42) : Math.round(W / 30);
  const lines = wrapTitle(input.title, maxLineWidth, 3);
  const font = await resolveFontPath(needCjk);

  const sharp = (await import('sharp')).default;

  // 底层背景：关键帧铺满 + 模糊 + 压暗
  const bg = await sharp(input.frame)
    .resize({ width: W, height: H, fit: 'cover' })
    .modulate({ brightness: 0.5 })
    .blur(18)
    .jpeg({ quality: 68 })
    .toBuffer();

  // 中层画卡：关键帧按原宽高比内嵌（保证不被挤压变形）
  const frameMeta = await sharp(input.frame).metadata();
  const aspect = frameMeta.width && frameMeta.height ? frameMeta.width / frameMeta.height : 16 / 9;
  const cardMaxW = Math.round(W * 0.9);
  const cardMaxH = orientation === '9:16' ? Math.round(H * 0.44) : Math.round(H * 0.72);
  let cardW = cardMaxW;
  let cardH = Math.round(cardW / aspect);
  if (cardH > cardMaxH) {
    cardH = cardMaxH;
    cardW = Math.round(cardH * aspect);
  }
  const card = await sharp(input.frame)
    .resize({ width: cardW, height: cardH, fit: 'fill' })
    .flatten({ background: '#0a0a0a' })
    .jpeg({ quality: 90 })
    .toBuffer();

  // 文字图层 SVG —— 生成失败（如标题含非常规 XML 字符、librsvg 拒收）时优雅降级为「无文字封面」
  let titleSvg: Buffer | null = null;
  try {
    titleSvg = buildTitleSvg({ width: W, height: H, lines, subtitle, needCjk, font });
    // 提前触发一次 SVG 栅格化，失败即降级（composite 阶段再失败则丢弃该层）
    await sharp(titleSvg).png().toBuffer();
  } catch (svgErr) {
    console.warn('[video-cover] title SVG dropped (degraded cover):', svgErr instanceof Error ? svgErr.message.slice(0, 200) : svgErr);
    titleSvg = null;
  }

  const cardX = Math.round((W - cardW) / 2);
  const cardY =
    orientation === '9:16'
      ? Math.round(H * 0.1) // 竖屏画卡放上部
      : Math.round((H - cardH) / 2) - Math.round(H * 0.04); // 横屏居中略上

  const compositeLayers: sharp.OverlayOptions[] = [
    { input: bg, left: 0, top: 0 },
    { input: card, left: cardX, top: cardY },
  ];
  if (titleSvg) compositeLayers.push({ input: titleSvg, left: 0, top: 0 });

  const out = await sharp({
    create: { width: W, height: H, channels: 3, background: '#101010' },
  })
    .composite(compositeLayers)
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  return out;
}