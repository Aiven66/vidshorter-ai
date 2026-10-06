/**
 * AI 成片 —— 模版分镜帧渲染（SVG → sharp 光栅化）。
 *
 * 移植 Pixelle-Video 的「模版视觉」技术结构：每个模版有自己的配色、字体规格与版式，
 * 但 Pixelle 用 HTML+CSS 由无头浏览器截图；Vercel 无 headless 浏览器，因此这里把版式
 * 翻译成 **纯矢量 SVG**（只用渐变 + 基础图形，不依赖 librsvg 的滤镜/图案支持）。
 *
 * 两条硬约束：
 *  1) 帧里**不含任何文字**——文字统一由 libass 烧录（容器内无 CJK 字体时 librsvg 会渲染成豆腐块）。
 *  2) 帧按 `KEN_BURNS_SCALE` 放大渲染，再由 ffmpeg 用「动画裁剪」做推拉运镜（Ken Burns），
 *     这样静帧也有持续运动感，且运镜失败时可无损回落到静态缩放。
 */

import type { AiVideoTemplate, AiVideoTemplateVisual } from '../../ai-video-templates';

/** 帧放大倍率：放大渲染后再由 ffmpeg 动画裁剪，得到无损的推拉/平移运镜。 */
export const KEN_BURNS_SCALE = 1.35;

/** 帧渲染尺寸（放大后交给 ffmpeg 做运镜裁剪）。 */
export function frameSize(width: number, height: number): { w: number; h: number } {
  const even = (n: number) => Math.round(n / 2) * 2;
  return { w: even(width * KEN_BURNS_SCALE), h: even(height * KEN_BURNS_SCALE) };
}

/** 极简确定性伪随机（同一分镜每次渲染结果一致，便于回归比对）。 */
function hashRand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** 基础层：背景渐变 + 中心辉光 + 暗角 + 底部强调条（所有版式共用）。 */
function baseLayers(v: AiVideoTemplateVisual, w: number, h: number): string[] {
  return [
    '<defs>',
    '<linearGradient id="bg" x1="0" y1="0" x2="0.65" y2="1">',
    `<stop offset="0" stop-color="${v.from}"/>`,
    `<stop offset="1" stop-color="${v.to}"/>`,
    '</linearGradient>',
    `<radialGradient id="glow" cx="0.5" cy="0.34" r="0.78">`,
    `<stop offset="0" stop-color="${v.accent}" stop-opacity="0.30"/>`,
    `<stop offset="1" stop-color="${v.accent}" stop-opacity="0"/>`,
    '</radialGradient>',
    '<radialGradient id="vig" cx="0.5" cy="0.5" r="0.75">',
    '<stop offset="0.55" stop-color="#000000" stop-opacity="0"/>',
    '<stop offset="1" stop-color="#000000" stop-opacity="0.55"/>',
    '</radialGradient>',
    '</defs>',
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg)"/>`,
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#glow)"/>`,
  ];
}

/** 收尾层：暗角 + 底部强调条。 */
function tailLayers(v: AiVideoTemplateVisual, w: number, h: number): string[] {
  return [
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#vig)"/>`,
    `<rect x="0" y="${h - Math.round(h * 0.006)}" width="${w}" height="${Math.round(h * 0.006)}" fill="${v.accent}" opacity="0.9"/>`,
  ];
}

/** 版式 1 · spotlight：中心追光 + 同心环（个人成长）。 */
function layoutSpotlight(v: AiVideoTemplateVisual, w: number, h: number, seed: number): string[] {
  const cx = w * 0.5;
  const cy = h * 0.34;
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    out.push(
      `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(w * (0.26 + i * 0.13)).toFixed(0)}" fill="none" stroke="${v.accent}" stroke-width="${Math.max(2, w * 0.003).toFixed(1)}" opacity="${(0.22 - i * 0.06).toFixed(2)}"/>`,
    );
  }
  const r1 = w * 0.62;
  out.push(`<circle cx="${(w * 0.06).toFixed(0)}" cy="${(h * 0.9).toFixed(0)}" r="${r1.toFixed(0)}" fill="${v.accent}" opacity="0.10"/>`);
  out.push(`<circle cx="${(w * 0.97).toFixed(0)}" cy="${(h * 0.14).toFixed(0)}" r="${(w * 0.3).toFixed(0)}" fill="${v.accent}" opacity="0.14"/>`);
  out.push(
    `<path d="M ${(w * 0.12).toFixed(0)} ${(h * 0.62 + hashRand(seed) * h * 0.02).toFixed(0)} L ${(w * 0.88).toFixed(0)} ${(h * 0.6).toFixed(0)}" stroke="${v.accent}" stroke-width="${Math.max(2, w * 0.0025).toFixed(1)}" opacity="0.35"/>`,
  );
  return out;
}

/** 版式 2 · minimal：极简细线 + 边角括号（深度思考，默认模版）。 */
function layoutMinimal(v: AiVideoTemplateVisual, w: number, h: number): string[] {
  const lw = Math.max(2, w * 0.0022);
  const out: string[] = [];
  out.push(`<line x1="${(w * 0.1).toFixed(0)}" y1="0" x2="${(w * 0.1).toFixed(0)}" y2="${h}" stroke="${v.accent}" stroke-width="${lw.toFixed(1)}" opacity="0.18"/>`);
  out.push(`<line x1="${(w * 0.9).toFixed(0)}" y1="0" x2="${(w * 0.9).toFixed(0)}" y2="${h}" stroke="${v.accent}" stroke-width="${lw.toFixed(1)}" opacity="0.18"/>`);
  out.push(`<circle cx="${(w * 0.5).toFixed(0)}" cy="${(h * 0.42).toFixed(0)}" r="${(w * 0.42).toFixed(0)}" fill="none" stroke="${v.accent}" stroke-width="${lw.toFixed(1)}" opacity="0.16"/>`);
  // 边角括号（左上 / 右下）
  const arm = w * 0.1;
  const m = w * 0.07;
  out.push(`<path d="M ${m.toFixed(0)} ${(m + arm).toFixed(0)} L ${m.toFixed(0)} ${m.toFixed(0)} L ${(m + arm).toFixed(0)} ${m.toFixed(0)}" fill="none" stroke="${v.accent}" stroke-width="${(lw * 3).toFixed(1)}" opacity="0.75"/>`);
  out.push(`<path d="M ${(w - m).toFixed(0)} ${(h - m - arm).toFixed(0)} L ${(w - m).toFixed(0)} ${(h - m).toFixed(0)} L ${(w - m - arm).toFixed(0)} ${(h - m).toFixed(0)}" fill="none" stroke="${v.accent}" stroke-width="${(lw * 3).toFixed(1)}" opacity="0.75"/>`);
  return out;
}

/** 版式 3 · aurora：多层柔光色块（情感）。 */
function layoutAurora(v: AiVideoTemplateVisual, w: number, h: number, seed: number): string[] {
  const out: string[] = ['<defs>'];
  const blobs: Array<{ cx: number; cy: number; r: number; color: string; op: number }> = [
    { cx: 0.22, cy: 0.2, r: 0.52, color: v.accent, op: 0.3 },
    { cx: 0.85, cy: 0.32, r: 0.5, color: '#ff9ec4', op: 0.24 },
    { cx: 0.5, cy: 0.78, r: 0.62, color: v.accent, op: 0.2 },
    { cx: 0.12, cy: 0.72, r: 0.42, color: '#8f6bff', op: 0.2 },
  ];
  // 先把全部渐变放进 <defs>，闭合后再画柔光椭圆（绘制元素必须放在 defs 之外才会渲染）
  blobs.forEach((b, i) => {
    out.push(
      `<radialGradient id="bl${i}" cx="0.5" cy="0.5" r="0.5">`,
      `<stop offset="0" stop-color="${b.color}" stop-opacity="${b.op}"/>`,
      `<stop offset="1" stop-color="${b.color}" stop-opacity="0"/>`,
      '</radialGradient>',
    );
  });
  out.push('</defs>');
  blobs.forEach((b, i) => {
    const jitter = (hashRand(seed + i) - 0.5) * 0.06;
    out.push(
      `<ellipse cx="${((b.cx + jitter) * w).toFixed(0)}" cy="${((b.cy + jitter) * h).toFixed(0)}" rx="${(b.r * w).toFixed(0)}" ry="${(b.r * h * 0.9).toFixed(0)}" fill="url(#bl${i})"/>`,
    );
  });
  out.push(`<path d="M ${(-w * 0.1).toFixed(0)} ${(h * 0.72).toFixed(0)} L ${(w * 1.1).toFixed(0)} ${(h * 0.3).toFixed(0)}" stroke="#ffffff" stroke-width="${Math.max(2, w * 0.0018).toFixed(1)}" opacity="0.14"/>`);
  return out;
}

/** 版式 4 · paper：纸纹 + 圆角画框（小说解说）。 */
function layoutPaper(v: AiVideoTemplateVisual, w: number, h: number): string[] {
  const out: string[] = [];
  const step = h * 0.035;
  for (let y = 0; y < h; y += step) {
    out.push(`<line x1="0" y1="${y.toFixed(0)}" x2="${w}" y2="${y.toFixed(0)}" stroke="#ffffff" stroke-width="1" opacity="0.035"/>`);
  }
  const inset = w * 0.045;
  out.push(
    `<rect x="${inset.toFixed(0)}" y="${(inset * 0.9).toFixed(0)}" width="${(w - inset * 2).toFixed(0)}" height="${(h - inset * 1.8).toFixed(0)}" rx="${(w * 0.035).toFixed(0)}" fill="none" stroke="${v.accent}" stroke-width="${Math.max(2, w * 0.0035).toFixed(1)}" opacity="0.55"/>`,
  );
  // 上下两道强调横线
  const lw = Math.max(3, w * 0.005);
  out.push(`<line x1="${(w * 0.3).toFixed(0)}" y1="${(h * 0.16).toFixed(0)}" x2="${(w * 0.7).toFixed(0)}" y2="${(h * 0.16).toFixed(0)}" stroke="${v.accent}" stroke-width="${lw.toFixed(1)}" opacity="0.8"/>`);
  out.push(`<line x1="${(w * 0.3).toFixed(0)}" y1="${(h * 0.84).toFixed(0)}" x2="${(w * 0.7).toFixed(0)}" y2="${(h * 0.84).toFixed(0)}" stroke="${v.accent}" stroke-width="${lw.toFixed(1)}" opacity="0.5"/>`);
  return out;
}

/** 版式 5 · grid：点阵 + 连接线（知识科普）。 */
function layoutGrid(v: AiVideoTemplateVisual, w: number, h: number, seed: number): string[] {
  const out: string[] = [];
  const cols = 9;
  const rows = 16;
  const dx = w / cols;
  const dy = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const op = 0.06 + hashRand(seed + r * 31 + c) * 0.14;
      out.push(`<circle cx="${((c + 0.5) * dx).toFixed(0)}" cy="${((r + 0.5) * dy).toFixed(0)}" r="${Math.max(2, w * 0.0035).toFixed(1)}" fill="${v.accent}" opacity="${op.toFixed(2)}"/>`);
    }
  }
  // 少量连接线，模拟网络结构
  for (let i = 0; i < 4; i++) {
    const x1 = (0.15 + hashRand(seed + i * 7) * 0.6) * w;
    const y1 = (0.2 + hashRand(seed + i * 13) * 0.5) * h;
    const x2 = (0.15 + hashRand(seed + i * 23) * 0.7) * w;
    const y2 = (0.4 + hashRand(seed + i * 17) * 0.45) * h;
    out.push(`<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="${v.accent}" stroke-width="${Math.max(2, w * 0.0025).toFixed(1)}" opacity="0.3"/>`);
  }
  return out;
}

/** 版式 6 · cinema：宽银幕黑边 + 镜头光斑（副业赚钱/电影感）。 */
function layoutCinema(v: AiVideoTemplateVisual, w: number, h: number): string[] {
  const out: string[] = ['<defs>'];
  out.push(
    '<linearGradient id="streak" x1="0" y1="0" x2="1" y2="0">',
    `<stop offset="0" stop-color="${v.accent}" stop-opacity="0"/>`,
    `<stop offset="0.5" stop-color="${v.accent}" stop-opacity="0.42"/>`,
    `<stop offset="1" stop-color="${v.accent}" stop-opacity="0"/>`,
    '</linearGradient>',
    '<linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#000000" stop-opacity="0.85"/>',
    '<stop offset="1" stop-color="#000000" stop-opacity="0.35"/>',
    '</linearGradient>',
    '</defs>',
  );
  const bar = h * 0.1;
  out.push(`<rect x="0" y="0" width="${w}" height="${bar.toFixed(0)}" fill="url(#bar)"/>`);
  out.push(`<rect x="0" y="${(h - bar).toFixed(0)}" width="${w}" height="${bar.toFixed(0)}" fill="#000000" opacity="0.6"/>`);
  out.push(`<rect x="0" y="${(h * 0.42).toFixed(0)}" width="${w}" height="${(h * 0.035).toFixed(0)}" fill="url(#streak)"/>`);
  out.push(`<rect x="0" y="${(h * 0.3).toFixed(0)}" width="${w}" height="${(h * 0.0025).toFixed(0)}" fill="#ffffff" opacity="0.18"/>`);
  // 取景框角标
  const m = w * 0.06;
  const arm = w * 0.07;
  const lw = Math.max(2, w * 0.0028);
  out.push(`<path d="M ${m.toFixed(0)} ${(m + arm).toFixed(0)} L ${m.toFixed(0)} ${m.toFixed(0)} L ${(m + arm).toFixed(0)} ${m.toFixed(0)}" fill="none" stroke="#ffffff" stroke-width="${lw.toFixed(1)}" opacity="0.5"/>`);
  out.push(`<path d="M ${(w - m).toFixed(0)} ${(h - m - arm).toFixed(0)} L ${(w - m).toFixed(0)} ${(h - m).toFixed(0)} L ${(w - m - arm).toFixed(0)} ${(h - m).toFixed(0)}" fill="none" stroke="#ffffff" stroke-width="${lw.toFixed(1)}" opacity="0.5"/>`);
  return out;
}

/** 版式 7 · scroll：竹简竖条 + 印章（历史解说）。 */
function layoutScroll(v: AiVideoTemplateVisual, w: number, h: number, seed: number): string[] {
  const out: string[] = [];
  const bands = 7;
  const bw = w / bands;
  for (let i = 0; i < bands; i++) {
    const op = 0.03 + hashRand(seed + i * 11) * 0.05;
    out.push(`<rect x="${(i * bw).toFixed(0)}" y="0" width="${(bw * 0.86).toFixed(0)}" height="${h}" fill="#ffffff" opacity="${op.toFixed(3)}"/>`);
    out.push(`<line x1="${(i * bw).toFixed(0)}" y1="0" x2="${(i * bw).toFixed(0)}" y2="${h}" stroke="${v.accent}" stroke-width="1.2" opacity="0.16"/>`);
  }
  // 顶部 / 底部渐隐
  out.push(`<rect x="0" y="0" width="${w}" height="${(h * 0.28).toFixed(0)}" fill="${v.accent}" opacity="0.07"/>`);
  // 印章
  const sz = w * 0.17;
  const sx = w * 0.72;
  const sy = h * 0.76;
  out.push(`<rect x="${sx.toFixed(0)}" y="${sy.toFixed(0)}" width="${sz.toFixed(0)}" height="${sz.toFixed(0)}" rx="${(sz * 0.12).toFixed(0)}" fill="#b3261e" opacity="0.72"/>`);
  out.push(`<rect x="${(sx + sz * 0.12).toFixed(0)}" y="${(sy + sz * 0.12).toFixed(0)}" width="${(sz * 0.76).toFixed(0)}" height="${(sz * 0.76).toFixed(0)}" fill="none" stroke="#ffffff" stroke-width="${Math.max(2, w * 0.003).toFixed(1)}" opacity="0.6"/>`);
  return out;
}

/**
 * 生成一个分镜的模版画面（**纯图形，无文字**）。
 * @param canvasW/H 实际光栅化尺寸（= 输出分辨率 × KEN_BURNS_SCALE）
 */
export function buildSceneFrameSvg(
  template: AiVideoTemplate,
  canvasW: number,
  canvasH: number,
  index: number,
  total: number,
): string {
  const v = template.visual;
  const seed = index * 97 + 13;
  const layers: string[] = [...baseLayers(v, canvasW, canvasH)];

  switch (v.layout) {
    case 'spotlight':
      layers.push(...layoutSpotlight(v, canvasW, canvasH, seed));
      break;
    case 'minimal':
      layers.push(...layoutMinimal(v, canvasW, canvasH));
      break;
    case 'aurora':
      layers.push(...layoutAurora(v, canvasW, canvasH, seed));
      break;
    case 'paper':
      layers.push(...layoutPaper(v, canvasW, canvasH));
      break;
    case 'grid':
      layers.push(...layoutGrid(v, canvasW, canvasH, seed));
      break;
    case 'cinema':
      layers.push(...layoutCinema(v, canvasW, canvasH));
      break;
    case 'scroll':
      layers.push(...layoutScroll(v, canvasW, canvasH, seed));
      break;
    default:
      break;
  }

  // 分镜进度点（右下角小圆点，帮助观众感知节奏）
  const dotR = Math.max(3, canvasW * 0.006);
  const gap = dotR * 3.2;
  const startX = canvasW - canvasW * 0.07 - (total - 1) * gap;
  for (let i = 0; i < total; i++) {
    layers.push(
      `<circle cx="${(startX + i * gap).toFixed(0)}" cy="${(canvasH - canvasW * 0.05).toFixed(0)}" r="${dotR.toFixed(1)}" fill="${v.accent}" opacity="${i === index ? 0.95 : 0.3}"/>`,
    );
  }

  layers.push(...tailLayers(v, canvasW, canvasH));

  return [
    `<svg width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">`,
    ...layers,
    '</svg>',
  ].join('');
}

/**
 * Ken Burns 运镜 vf：在放大帧上做动画裁剪，偶数分镜横向推移、奇数分镜纵向推移。
 * 表达式用 `0.5-0.35*cos(PI*t/D)` 做缓入缓出，避免机械匀速。
 * 裁剪表达式内的逗号靠单引号包裹（execFile 不走 shell，引号原样传给 ffmpeg）。
 */
export function buildKenBurnsVf(
  width: number,
  height: number,
  index: number,
  durSec: number,
  fps = 30,
): string {
  const d = Math.max(1, durSec).toFixed(3);
  // ≥4.5s 的分镜用「两拍」运镜：前半段横扫 0.12→0.88，中点瞬间跳回 0.12 再扫到 0.88。
  // 同一张静帧在两个取景之间硬切，让长镜头读起来像两个镜头，零素材成本地提升剪辑节奏。
  let sweep: string;
  if (durSec >= 4.5) {
    const half = (durSec / 2).toFixed(3);
    sweep = `if(lt(t,${half}),0.12+0.76*(t/${half}),0.12+0.76*((t-${half})/${half}))`;
  } else {
    // 短分镜：单次缓入缓出横扫，避免抖得太快
    sweep = `0.5-0.35*cos(PI*t/${d})`;
  }
  const xExpr = index % 2 === 0 ? sweep : '0.5';
  const yExpr = index % 2 === 0 ? '0.5' : sweep;
  return [
    `crop=${width}:${height}:x='(in_w-out_w)*(${xExpr})':y='(in_h-out_h)*(${yExpr})'`,
    `scale=${width}:${height}`,
    'setsar=1',
    `fps=${fps}`,
    'format=yuv420p',
  ].join(',');
}

/** 静态兜底 vf（运镜失败或非模版路径时使用）。 */
export function buildStaticVf(width: number, height: number, fps = 30): string {
  return `scale=${width}:${height},setsar=1,fps=${fps},format=yuv420p`;
}

// ── Pixelle-Video 式「插画画卡」版式 ─────────────────────────────────────────
// 开源框架 demo 的画面 = AI 生成的插画 + 浅色纸底 + 顶部大标题 + 底部字幕 + 品牌页脚。
// 这里只画**背景与图卡衬底**，插画本体由 render.ts 用 sharp 合成在卡位内（带圆角+投影）。

/** 画卡几何：正方形图卡，水平居中、垂直略偏下（给顶部标题留白）。 */
export function artCardRect(frameW: number, frameH: number): { x: number; y: number; size: number } {
  const size = Math.round(frameW * 0.84);
  const x = Math.round((frameW - size) / 2);
  const y = Math.round(frameH * 0.52 - size / 2);
  return { x, y, size };
}

/**
 * 画卡版式的背景层（浅色纸底 + 同心圆纹 + 图卡投影 + 页脚细线）。
 * 插画合成在 `artCardRect` 的方框内，因此这里只铺设衬底。
 */
export function buildIllustrationBgSvg(
  template: AiVideoTemplate,
  frameW: number,
  frameH: number,
): string {
  const v = template.visual;
  const card = artCardRect(frameW, frameH);
  const cx = card.x + card.size / 2;
  const cy = card.y + card.size / 2;
  const layers: string[] = [];

  layers.push(
    '<defs>',
    '<radialGradient id="paperGlow" cx="0.5" cy="0.42" r="0.75">',
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/>`,
    `<stop offset="1" stop-color="${v.paper}" stop-opacity="0"/>`,
    '</radialGradient>',
    `<linearGradient id="shadow" x1="0" y1="0" x2="0" y2="1">`,
    '<stop offset="0" stop-color="#0a0a0a" stop-opacity="0.10"/>',
    '<stop offset="1" stop-color="#0a0a0a" stop-opacity="0.02"/>',
    '</linearGradient>',
    '</defs>',
  );
  // 纸底
  layers.push(`<rect x="0" y="0" width="${frameW}" height="${frameH}" fill="${v.paper}"/>`);
  layers.push(`<rect x="0" y="0" width="${frameW}" height="${frameH}" fill="url(#paperGlow)"/>`);
  // 同心圆纹（呼应 Pixelle WebUI 预览的浅色底纹）
  for (let i = 1; i <= 7; i++) {
    layers.push(
      `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(card.size * (0.55 + i * 0.13)).toFixed(0)}" fill="none" stroke="${v.ink}" stroke-width="${Math.max(1, frameW * 0.0012).toFixed(1)}" opacity="0.045"/>`,
    );
  }
  // 图卡投影（偏移的圆角矩形，柔和下沉）
  const pad = Math.round(card.size * 0.012);
  layers.push(
    `<rect x="${card.x - pad}" y="${card.y - pad + Math.round(card.size * 0.02)}" width="${card.size + pad * 2}" height="${card.size + pad * 2}" rx="${Math.round(card.size * 0.05)}" fill="url(#shadow)"/>`,
  );
  // 图卡衬底（白色，插画合成其上；圆角处露白更干净）
  layers.push(
    `<rect x="${card.x}" y="${card.y}" width="${card.size}" height="${card.size}" rx="${Math.round(card.size * 0.045)}" fill="#ffffff"/>`,
    `<rect x="${card.x}" y="${card.y}" width="${card.size}" height="${card.size}" rx="${Math.round(card.size * 0.045)}" fill="none" stroke="${v.ink}" stroke-width="${Math.max(1, frameW * 0.0012).toFixed(1)}" opacity="0.08"/>`,
  );
  // 图卡下方强调短线 + 页脚细线
  layers.push(
    `<rect x="${(frameW / 2 - frameW * 0.05).toFixed(0)}" y="${(card.y + card.size + frameH * 0.045).toFixed(0)}" width="${(frameW * 0.1).toFixed(0)}" height="${Math.round(frameH * 0.004)}" fill="${v.ink}" opacity="0.18"/>`,
    `<rect x="${(frameW * 0.08).toFixed(0)}" y="${(frameH * 0.945).toFixed(0)}" width="${(frameW * 0.84).toFixed(0)}" height="1" fill="${v.ink}" opacity="0.10"/>`,
  );

  return [
    `<svg width="${frameW}" height="${frameH}" viewBox="0 0 ${frameW} ${frameH}" xmlns="http://www.w3.org/2000/svg">`,
    ...layers,
    '</svg>',
  ].join('');
}

/**
 * 画卡版式的运镜：**居中缓速推近**（zoompan），保证居中插画在任何时刻都完整可见
 * （横向平移会把大图卡裁出画面，因此这里不用 Ken Burns 平移）。失败时回落静态缩放。
 */
export function buildArtCardVf(width: number, height: number, durSec: number, fps = 30): string {
  const total = Math.max(1, Math.round(durSec * fps));
  // 在整段时长内从 1.00 缓速推到 1.08（线性，避免长片过早推满后静止）
  const rate = (0.08 / total).toFixed(6);
  const zoom = `min(1+${rate}*on,1.08)`;
  return [
    `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`,
    'setsar=1',
    'format=yuv420p',
  ].join(',');
}

// ── Pixelle-Video 式「实拍全幅」版式（image_full.html）──────────────────────
// 开源框架 demo 的画面 = AI 生成的实拍图**全幅铺满** + 顶部大标题 + 底部字幕，
// 文字靠黑色 text-shadow 描边保证可读。这里用 sharp 把实拍图 cover 到整帧，
// 再叠加本覆盖层（暗角 + 上下渐变压暗），让 libass 烧录的白色描边文字始终可读。

/**
 * 实拍全幅覆盖层：整体暗角 + 顶部/底部线性压暗（标题与字幕区）。
 * 对应 Pixelle image_full 模版中 text-shadow 的多方向黑描边效果。
 */
export function buildPhotoOverlaySvg(frameW: number, frameH: number): string {
  const layers: string[] = [
    '<defs>',
    '<radialGradient id="vig" cx="0.5" cy="0.5" r="0.75">',
    '<stop offset="0.55" stop-color="#000000" stop-opacity="0"/>',
    '<stop offset="1" stop-color="#000000" stop-opacity="0.42"/>',
    '</radialGradient>',
    '<linearGradient id="top" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#000000" stop-opacity="0.45"/>',
    '<stop offset="1" stop-color="#000000" stop-opacity="0"/>',
    '</linearGradient>',
    '<linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#000000" stop-opacity="0"/>',
    '<stop offset="0.55" stop-color="#000000" stop-opacity="0.18"/>',
    '<stop offset="1" stop-color="#000000" stop-opacity="0.62"/>',
    '</linearGradient>',
    '</defs>',
    `<rect x="0" y="0" width="${frameW}" height="${frameH}" fill="url(#vig)"/>`,
    `<rect x="0" y="0" width="${frameW}" height="${Math.round(frameH * 0.24)}" fill="url(#top)"/>`,
    `<rect x="0" y="${Math.round(frameH * 0.62)}" width="${frameW}" height="${Math.round(frameH * 0.38)}" fill="url(#bottom)"/>`,
  ];
  return [
    `<svg width="${frameW}" height="${frameH}" viewBox="0 0 ${frameW} ${frameH}" xmlns="http://www.w3.org/2000/svg">`,
    ...layers,
    '</svg>',
  ].join('');
}