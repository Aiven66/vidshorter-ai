/**
 * 商品种草视频渲染引擎（无数字人，语音解说 + 商品展示）。
 *
 * 社交媒体种草视频形态（TikTok / Reels / 小红书风格）：
 * - Hook：全屏商品大图 Ken Burns 缓推 + 大字钩子弹入 + MUST HAVE 脉冲徽章
 * - 卖点：商品图运镜（逐场景变方向）+ 编号徽章 + 卖点大字弹入 + 进度点
 * - 价格：商品卡片摇摆 + 现价爆字 + 划线原价 + 折扣爆炸徽章 + 限时闪烁
 * - CTA：商品卡片 + 呼吸脉冲购买按钮 + 库存紧迫感 + 星级社交证明
 * - 全程：语音解说字幕条 + 实时语音波形（envelope 驱动）+ 漂浮粒子 + 光斑
 *
 * 所有动画为 sceneT/globalT/progress 的确定性函数 —— 预览与导出逐帧一致。
 */
import {
  type DrawContext,
  easeOutCubic,
  easeOutBack,
  clamp01,
  fillGradient,
  fillRoundRect,
  roundRect,
  setFont,
  wrapText,
  withAlpha,
} from './canvas-utils';
import { type SceneTheme } from './scene-theme';

export type ShowcaseSceneKind = 'greeting' | 'highlight' | 'price' | 'cta';

export interface ShowcaseSceneProps {
  theme: SceneTheme;
  kind: ShowcaseSceneKind;
  subtitle: string;
  label?: string;
  highlight?: { title: string; detail?: string };
  price?: { display: string; original?: string };
  product: {
    name: string;
    image?: string | null;
    priceDisplay?: string | null;
    originalPrice?: string | null;
    rating?: string | null;
    reviewCount?: string | null;
    brand?: string | null;
  };
  productImg: HTMLImageElement | null;
  /** 0..1 语音包络（波形可视化） */
  mouthOpen: number;
  /** 场景内时间（秒） */
  sceneT: number;
  /** 场景总时长（秒） */
  sceneDur: number;
  /** 全局时间轴（秒） */
  globalT: number;
  /** 场景序号/总数（进度条） */
  sceneIndex: number;
  sceneCount: number;
  /** 卖点序号（1 基） */
  highlightIndex: number;
  /** UI 语言（徽章文案） */
  isZh: boolean;
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

/** cover 绘制 + Ken Burns 运镜（scale 缓变 + 偏移摆动） */
function drawCoverKenBurns(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
  fromScale: number, toScale: number,
  fromOX: number, toOX: number,
  fromOY: number, toOY: number,
  p: number,
): void {
  const e = easeOutCubic(p);
  const scale = fromScale + (toScale - fromScale) * e;
  const ox = fromOX + (toOX - fromOX) * e;
  const oy = fromOY + (toOY - fromOY) * e;
  const cover = Math.max(w / img.naturalWidth, h / img.naturalHeight) * scale;
  const dw = img.naturalWidth * cover;
  const dh = img.naturalHeight * cover;
  const dx = x + (w - dw) / 2 + ox * (dw - w) * 0.5;
  const dy = y + (h - dh) / 2 + oy * (dh - h) * 0.5;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** 确定性伪随机 */
function prand(i: number): number {
  const x = Math.sin(i * 127.1 + 13.37) * 43758.5453;
  return x - Math.floor(x);
}

/** 从价格字符串提取数字（支持 $29.99 / ¥1,299 / 199,00） */
function parsePriceNum(s?: string | null): number | null {
  if (!s) return null;
  const m = String(s).replace(/,/g, '.').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const v = parseFloat(m[0]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** 文字弹入（scale + 透明度） */
function popIn(ctx: CanvasRenderingContext2D, t: number): number {
  return easeOutBack(clamp01(t / 0.45));
}

/* ------------------------------------------------------------------ */
/* 通用层                                                              */
/* ------------------------------------------------------------------ */

function drawBackdrop(dc: DrawContext, th: SceneTheme, t: number): void {
  const { ctx, width: w, height: h } = dc;
  fillGradient(ctx, w, h, [
    { offset: 0, color: th.primaryDark },
    { offset: 0.55, color: th.bgDark },
    { offset: 1, color: '#05070f' },
  ], 'vertical');

  // 两个漂移光斑
  for (let i = 0; i < 2; i++) {
    const cx = w * (0.3 + 0.4 * i) + Math.sin(t * 0.23 + i * 2.1) * w * 0.08;
    const cy = h * (0.25 + 0.35 * i) + Math.cos(t * 0.19 + i * 1.7) * h * 0.05;
    const r = w * (0.42 + 0.08 * i);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, withAlpha(th.primaryLight, 0.13));
    g.addColorStop(1, withAlpha(th.primaryLight, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
}

function drawParticles(dc: DrawContext, th: SceneTheme, t: number): void {
  const { ctx, width: w, height: h } = dc;
  for (let i = 0; i < 9; i++) {
    const r = prand(i);
    const px = ((r * 1.3 + t * (0.006 + r * 0.012)) % 1.1 - 0.05) * w;
    const py = ((prand(i + 40) + Math.sin(t * 0.5 + i) * 0.02) % 1) * h;
    const size = w * (0.003 + prand(i + 80) * 0.006);
    ctx.fillStyle = withAlpha('#ffffff', 0.1 + 0.14 * Math.abs(Math.sin(t * 0.8 + i * 2)));
    ctx.beginPath();
    ctx.arc(px, h - py, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTopProgress(dc: DrawContext, th: SceneTheme, props: ShowcaseSceneProps): void {
  const { ctx, width: w } = dc;
  const segW = (w - w * 0.08) / Math.max(1, props.sceneCount - 0);
  const barY = dc.height * 0.028;
  for (let i = 0; i < props.sceneCount; i++) {
    const x = w * 0.04 + i * segW;
    fillRoundRect(ctx, x, barY, segW - w * 0.012, dc.height * 0.006, dc.height * 0.003, 'rgba(255,255,255,0.22)');
    if (i < props.sceneIndex) {
      fillRoundRect(ctx, x, barY, segW - w * 0.012, dc.height * 0.006, dc.height * 0.003, withAlpha(th.primaryLight, 0.95));
    } else if (i === props.sceneIndex) {
      const p = clamp01(props.sceneT / Math.max(0.1, props.sceneDur));
      fillRoundRect(ctx, x, barY, (segW - w * 0.012) * p, dc.height * 0.006, dc.height * 0.003, '#ffffff');
    }
  }
}

/** 字幕条 + 实时语音波形（envelope 驱动，替代"正在口播"的视觉信号） */
function drawSubtitleAndWave(dc: DrawContext, th: SceneTheme, props: ShowcaseSceneProps): void {
  const { ctx, width: w, height: h } = dc;
  if (!props.subtitle) return;

  setFont(ctx, { size: w * 0.040, weight: 700 });
  // 最多 2 行：3 行时字幕条顶部(y≈0.787)会盖住场景底部元素（徽章/星级/价格回顾）
  const lines = wrapText(ctx, props.subtitle, w * 0.78).slice(0, 2);
  const lineH = w * 0.052;
  const subH = lines.length * lineH + w * 0.052;
  const subY = h * 0.904 - subH;
  const subX = w * 0.06;
  const subW = w * 0.88;

  // 语音波形（字幕条上缘中央，5 根竖条随 envelope 跳动）
  const waveN = 5;
  const barW = w * 0.011;
  const gap = w * 0.008;
  const waveW = waveN * barW + (waveN - 1) * gap;
  const waveX = w / 2 - waveW / 2;
  const waveY = subY - w * 0.045;
  for (let i = 0; i < waveN; i++) {
    const phase = Math.sin(props.globalT * 11 + i * 1.9) * 0.5 + 0.5;
    const bh = w * (0.008 + 0.020 * (0.35 * phase + 0.65 * props.mouthOpen));
    fillRoundRect(
      ctx,
      waveX + i * (barW + gap),
      waveY - bh / 2 + w * 0.012,
      barW, bh, barW / 2,
      withAlpha(th.primaryLight, 0.95),
    );
  }

  // 字幕条
  fillRoundRect(ctx, subX, subY, subW, subH, w * 0.025, 'rgba(0,0,0,0.55)');
  ctx.strokeStyle = withAlpha(th.primary, 0.45);
  ctx.lineWidth = Math.max(1.5, w * 0.0035);
  roundRect(ctx, subX, subY, subW, subH, w * 0.025);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let y = subY + w * 0.026;
  for (const line of lines) {
    ctx.fillText(line, w / 2, y);
    y += lineH;
  }
}

function drawWatermark(dc: DrawContext): void {
  const { ctx, width: w, height: h } = dc;
  setFont(ctx, { size: w * 0.022, weight: 600 });
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('clipop.ai', w - w * 0.045, h - h * 0.012);
}

/** 星级评分 + 评论数 */
function drawStars(dc: DrawContext, props: ShowcaseSceneProps, cx: number, cy: number, scale = 1): void {
  if (!props.product.rating) return;
  const { ctx, width: w } = dc;
  const txt = `★ ${props.product.rating}${props.product.reviewCount ? `  ·  ${props.product.reviewCount} ${props.isZh ? '评论' : 'reviews'}` : ''}`;
  setFont(ctx, { size: w * 0.036 * scale, weight: 700 });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(txt).width;
  fillRoundRect(ctx, cx - tw / 2 - w * 0.03, cy - w * 0.03 * scale, tw + w * 0.06, w * 0.06 * scale, w * 0.03, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(txt, cx, cy);
}

/* ------------------------------------------------------------------ */
/* 场景渲染                                                            */
/* ------------------------------------------------------------------ */

export function drawShowcaseScene(dc: DrawContext, props: ShowcaseSceneProps): void {
  const { ctx, width: w, height: h } = dc;
  const th = props.theme;
  const t = props.sceneT;
  const p = clamp01(props.sceneT / Math.max(0.1, props.sceneDur));
  const img = props.productImg;

  drawBackdrop(dc, th, props.globalT);
  drawParticles(dc, th, props.globalT);
  drawTopProgress(dc, th, props);

  switch (props.kind) {
    case 'greeting':
      drawHook(dc, props, img, t, p);
      break;
    case 'highlight':
      drawHighlight(dc, props, img, t, p);
      break;
    case 'price':
      drawPrice(dc, props, img, t, p);
      break;
    case 'cta':
      drawCta(dc, props, img, t, p);
      break;
  }

  drawSubtitleAndWave(dc, th, props);
  drawWatermark(dc);
}

/* ---- Hook：全屏商品大图 + 大字钩子 ---- */
function drawHook(
  dc: DrawContext,
  props: ShowcaseSceneProps,
  img: HTMLImageElement | null,
  t: number,
  p: number,
): void {
  const { ctx, width: w, height: h } = dc;
  const th = props.theme;

  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    drawCoverKenBurns(ctx, img, 0, 0, w, h, 1.08, 1.2, -0.35, 0.3, -0.2, 0.25, p);
    ctx.restore();
  } else {
    fillRoundRect(ctx, w * 0.3, h * 0.2, w * 0.4, h * 0.4, w * 0.06, withAlpha(th.primaryDark, 0.5));
  }

  // 底部遮罩（文字可读）
  const shade = ctx.createLinearGradient(0, h * 0.42, 0, h);
  shade.addColorStop(0, 'rgba(3,5,12,0)');
  shade.addColorStop(0.65, 'rgba(3,5,12,0.72)');
  shade.addColorStop(1, 'rgba(3,5,12,0.94)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, h * 0.42, w, h * 0.58);
  // 顶部轻遮罩（进度条可读）
  const topShade = ctx.createLinearGradient(0, 0, 0, h * 0.09);
  topShade.addColorStop(0, 'rgba(3,5,12,0.55)');
  topShade.addColorStop(1, 'rgba(3,5,12,0)');
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, w, h * 0.09);

  // 品牌 pill
  const brand = props.product.brand || props.label;
  if (brand) {
    const inB = popIn(ctx, t - 0.15);
    ctx.save();
    ctx.globalAlpha = clamp01(inB);
    setFont(ctx, { size: w * 0.036, weight: 800 });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const bw = ctx.measureText(brand.toUpperCase()).width + w * 0.09;
    const by = h * 0.115;
    ctx.translate(w / 2, by);
    ctx.scale(Math.max(0.01, inB), Math.max(0.01, inB));
    fillRoundRect(ctx, -bw / 2, -w * 0.033, bw, w * 0.066, w * 0.033, withAlpha(th.primary, 0.92));
    ctx.fillStyle = '#fff';
    ctx.fillText(brand.toUpperCase(), 0, w * 0.001);
    ctx.restore();
  }

  // 商品名大字（两行内，弹入）
  const nameIn = popIn(ctx, t - 0.35);
  ctx.save();
  ctx.globalAlpha = clamp01(nameIn);
  ctx.translate(w / 2, h * 0.60);
  ctx.scale(Math.max(0.01, nameIn), Math.max(0.01, nameIn));
  setFont(ctx, { size: w * 0.085, weight: 900 });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const lines = wrapText(ctx, props.product.name, w * 0.86).slice(0, 2);
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = w * 0.03;
  ctx.fillStyle = '#ffffff';
  let ny = -w * 0.11;
  for (const line of lines) {
    ctx.fillText(line, 0, ny);
    ny += w * 0.1;
  }
  ctx.restore();

  // MUST HAVE 脉冲徽章（上移避开字幕条：2 行字幕顶部到 y≈0.816）
  const pulse = 1 + Math.sin(t * 4.2) * 0.045;
  const badge = props.isZh ? '✨ 必买好物 ✨' : '✨ MUST HAVE ✨';
  ctx.save();
  ctx.translate(w / 2, h * 0.705);
  ctx.scale(pulse, pulse);
  setFont(ctx, { size: w * 0.048, weight: 900 });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(badge).width;
  fillRoundRect(ctx, -tw / 2 - w * 0.05, -w * 0.048, tw + w * 0.1, w * 0.096, w * 0.048, 'rgba(255,255,255,0.96)');
  ctx.fillStyle = th.primaryDark;
  ctx.fillText(badge, 0, w * 0.002);
  ctx.restore();

  drawStars(dc, props, w / 2, h * 0.775, 1);
}

/* ---- 卖点：商品图运镜 + 编号徽章 + 卖点大字 ---- */
function drawHighlight(
  dc: DrawContext,
  props: ShowcaseSceneProps,
  img: HTMLImageElement | null,
  t: number,
  p: number,
): void {
  const { ctx, width: w, height: h } = dc;
  const th = props.theme;
  const idx = props.highlightIndex;

  // 商品图卡片（上 50%），逐场景变运镜方向（伪多镜头）
  const cardX = w * 0.07;
  const cardY = h * 0.075;
  const cardW = w * 0.86;
  const cardH = h * 0.44;
  const R = w * 0.045;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = w * 0.06;
  ctx.shadowOffsetY = w * 0.015;
  fillRoundRect(ctx, cardX, cardY, cardW, cardH, R, 'rgba(255,255,255,0.06)');
  ctx.restore();

  ctx.save();
  roundRect(ctx, cardX + w * 0.008, cardY + w * 0.008, cardW - w * 0.016, cardH - w * 0.016, R * 0.9);
  ctx.clip();
  if (img) {
    const dirs: Array<[number, number, number, number, number, number]> = [
      [1.12, 1.02, -0.4, 0.3, -0.25, 0.2],   // 推近
      [1.02, 1.14, 0.35, -0.3, 0.2, -0.15],  // 拉远反向
      [1.08, 1.08, -0.45, 0.45, 0, 0],       // 左右横移
      [1.1, 1.04, 0.4, -0.4, 0.25, -0.2],    // 缓推回中
    ];
    const d = dirs[(idx - 1) % dirs.length];
    drawCoverKenBurns(ctx, img, cardX, cardY, cardW, cardH, d[0], d[1], d[2], d[3], d[4], d[5], p);
  } else {
    fillRoundRect(ctx, cardX, cardY, cardW, cardH, R, withAlpha(th.primaryDark, 0.4));
  }
  // 卡片底部渐变（编号区可读）
  const g = ctx.createLinearGradient(0, cardY + cardH - h * 0.1, 0, cardY + cardH);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(cardX, cardY + cardH - h * 0.1, cardW, h * 0.1);
  ctx.restore();

  // 编号大徽章（卡片左上角）
  const numIn = popIn(ctx, t - 0.1);
  ctx.save();
  ctx.translate(cardX + w * 0.09, cardY + w * 0.09);
  ctx.scale(Math.max(0.01, numIn), Math.max(0.01, numIn));
  ctx.beginPath();
  ctx.arc(0, 0, w * 0.085, 0, Math.PI * 2);
  ctx.fillStyle = th.primary;
  ctx.fill();
  ctx.lineWidth = w * 0.012;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  setFont(ctx, { size: w * 0.082, weight: 900 });
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(idx), 0, w * 0.004);
  ctx.restore();

  // 卖点标题大字（弹入）
  const titleIn = popIn(ctx, t - 0.3);
  ctx.save();
  ctx.globalAlpha = clamp01(titleIn);
  ctx.translate(w / 2, h * 0.565);
  ctx.scale(Math.max(0.01, titleIn), Math.max(0.01, titleIn));
  setFont(ctx, { size: w * 0.072, weight: 900 });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = w * 0.025;
  ctx.fillStyle = '#ffffff';
  const tl = wrapText(ctx, props.highlight?.title || props.label || '', w * 0.84).slice(0, 2);
  let ty = -w * 0.08;
  for (const line of tl) {
    ctx.fillText(line, 0, ty);
    ty += w * 0.085;
  }
  ctx.restore();

  // 卖点详情（淡入）
  const detIn = easeOutCubic(clamp01((t - 0.55) / 0.5));
  if (props.highlight?.detail && detIn > 0.01) {
    ctx.save();
    ctx.globalAlpha = detIn;
    setFont(ctx, { size: w * 0.038, weight: 600 });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    const dl = wrapText(ctx, props.highlight.detail, w * 0.8).slice(0, 3);
    let dy = h * 0.695;
    for (const line of dl) {
      ctx.fillText(line, w / 2, dy);
      dy += w * 0.05;
    }
    ctx.restore();
  }

  // 卖点进度点（左下，替代社交媒体 dots）
  const dotN = 3;
  const dotY = h * 0.845;
  const dotGap = w * 0.06;
  for (let i = 0; i < dotN; i++) {
    const cx = w / 2 + (i - (dotN - 1) / 2) * dotGap;
    ctx.beginPath();
    ctx.arc(cx, dotY, w * (i === idx - 1 ? 0.014 : 0.008), 0, Math.PI * 2);
    ctx.fillStyle = i === idx - 1 ? '#fff' : 'rgba(255,255,255,0.3)';
    ctx.fill();
  }

  // 社交浮标：❤️ 点赞（右上角）
  const heartY = cardY + cardH - w * 0.09 + Math.sin(t * 2.6) * w * 0.006;
  setFont(ctx, { size: w * 0.05, weight: 700 });
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const ht = `❤ ${props.isZh ? '爆款' : 'Trending'}`;
  const hw = ctx.measureText(ht).width;
  fillRoundRect(ctx, cardX + cardW - w * 0.02 - hw - w * 0.06, heartY - w * 0.032, hw + w * 0.06, w * 0.064, w * 0.032, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = '#fff';
  ctx.fillText(ht, cardX + cardW - w * 0.05, heartY);
}

/* ---- 价格：商品卡片 + 现价爆字 + 折扣徽章 ---- */
function drawPrice(
  dc: DrawContext,
  props: ShowcaseSceneProps,
  img: HTMLImageElement | null,
  t: number,
  p: number,
): void {
  const { ctx, width: w, height: h } = dc;
  const th = props.theme;

  // 商品卡片（居中偏上，轻微摇摆）
  const cardW = w * 0.5;
  const cardH = w * 0.5;
  const cx = w / 2;
  const cy = h * 0.325;
  const sway = Math.sin(t * 1.8) * 0.022;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(sway);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = w * 0.08;
  ctx.shadowOffsetY = w * 0.02;
  fillRoundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, w * 0.05, 'rgba(255,255,255,0.97)');
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (img) {
    ctx.save();
    roundRect(ctx, -cardW / 2 + w * 0.014, -cardH / 2 + w * 0.014, cardW - w * 0.028, cardH - w * 0.028, w * 0.042);
    ctx.clip();
    const s = 1 + 0.04 * Math.sin(t * 1.2);
    const cover = Math.max((cardW - w * 0.028) / img.naturalWidth, (cardH - w * 0.028) / img.naturalHeight) * s;
    const dw = img.naturalWidth * cover;
    const dh = img.naturalHeight * cover;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  ctx.restore();

  // 限时闪烁条
  const flash = 0.72 + Math.sin(t * 5.5) * 0.28;
  const ltd = props.isZh ? '⏰ 限时特惠' : '⏰ LIMITED TIME OFFER';
  setFont(ctx, { size: w * 0.038, weight: 800 });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lw = ctx.measureText(ltd).width + w * 0.1;
  ctx.globalAlpha = flash;
  fillRoundRect(ctx, cx - lw / 2, h * 0.535, lw, w * 0.075, w * 0.037, 'rgba(220,38,38,0.92)');
  ctx.fillStyle = '#fff';
  ctx.fillText(ltd, cx, h * 0.535 + w * 0.039);
  ctx.globalAlpha = 1;

  // 现价超大字（弹跳入场）
  const priceIn = popIn(ctx, t - 0.35);
  const price = props.price?.display || props.product.priceDisplay || '';
  ctx.save();
  ctx.globalAlpha = clamp01(priceIn);
  ctx.translate(cx, h * 0.665);
  const sc = Math.max(0.01, priceIn);
  ctx.scale(sc, sc);
  setFont(ctx, { size: w * 0.155, weight: 900 });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = withAlpha(th.primaryLight, 0.65);
  ctx.shadowBlur = w * 0.06;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(price, 0, 0);
  ctx.restore();

  // 原价划线（红线划过动画）
  if (props.price?.original) {
    const strike = easeOutCubic(clamp01((t - 0.9) / 0.45));
    setFont(ctx, { size: w * 0.052, weight: 700 });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const oTxt = props.isZh ? `原价 ${props.price.original}` : `was ${props.price.original}`;
    ctx.fillText(oTxt, cx, h * 0.730);
    if (strike > 0.02) {
      const tw2 = ctx.measureText(oTxt).width;
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = w * 0.010;
      ctx.beginPath();
      ctx.moveTo(cx - tw2 / 2, h * 0.730);
      ctx.lineTo(cx - tw2 / 2 + tw2 * strike, h * 0.730);
      ctx.stroke();
    }

    // 折扣爆炸徽章（旋转 + 脉冲）
    const cur = parsePriceNum(props.price.display);
    const orig = parsePriceNum(props.price.original);
    if (cur && orig && orig > cur) {
      const pct = Math.round((1 - cur / orig) * 100);
      if (pct > 0 && pct < 100) {
        const pop = popIn(ctx, t - 1.1);
        const pulse2 = 1 + Math.sin(t * 4.8) * 0.06;
        ctx.save();
        ctx.translate(w * 0.8, h * 0.665);
        ctx.rotate(-0.18);
        ctx.scale(Math.max(0.01, pop) * pulse2, Math.max(0.01, pop) * pulse2);
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const r = i % 2 === 0 ? w * 0.105 : w * 0.078;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = w * 0.010;
        ctx.stroke();
        setFont(ctx, { size: w * 0.058, weight: 900 });
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`-${pct}%`, 0, 0);
        ctx.restore();
      }
    }
  }

  drawStars(dc, props, cx, h * 0.775, 0.95);
}

/* ---- CTA：购买按钮脉冲 + 紧迫感 ---- */
function drawCta(
  dc: DrawContext,
  props: ShowcaseSceneProps,
  img: HTMLImageElement | null,
  t: number,
  p: number,
): void {
  const { ctx, width: w, height: h } = dc;
  const th = props.theme;

  // 商品卡片（上移缩小）
  const cardW = w * 0.42;
  const cardH = w * 0.42;
  const cx = w / 2;
  const cy = h * 0.30;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = w * 0.07;
  ctx.shadowOffsetY = w * 0.018;
  fillRoundRect(ctx, cx - cardW / 2, cy - cardH / 2, cardW, cardH, w * 0.045, 'rgba(255,255,255,0.97)');
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (img) {
    ctx.save();
    roundRect(ctx, cx - cardW / 2 + w * 0.012, cy - cardH / 2 + w * 0.012, cardW - w * 0.024, cardH - w * 0.024, w * 0.038);
    ctx.clip();
    const bobY = Math.sin(t * 2.2) * w * 0.008;
    const cover = Math.max((cardW - w * 0.024) / img.naturalWidth, (cardH - w * 0.024) / img.naturalHeight);
    const dw = img.naturalWidth * cover;
    const dh = img.naturalHeight * cover;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2 + bobY, dw, dh);
    ctx.restore();
  }
  ctx.restore();

  // 呼吸光圈（按钮前置氛围）
  const glow = 0.5 + 0.5 * Math.sin(t * 3.2);
  const g2 = ctx.createRadialGradient(cx, h * 0.485, 0, cx, h * 0.485, w * 0.42);
  g2.addColorStop(0, withAlpha(th.primaryLight, 0.16 * glow));
  g2.addColorStop(1, withAlpha(th.primaryLight, 0));
  ctx.fillStyle = g2;
  ctx.fillRect(0, h * 0.2, w, h * 0.55);

  // CTA 大按钮（呼吸脉冲）
  const btnPulse = 1 + Math.sin(t * 4.0) * 0.035;
  const btnIn = popIn(ctx, t - 0.25);
  const btnW = w * 0.78;
  const btnH = w * 0.17;
  const btnY = h * 0.485;
  ctx.save();
  ctx.translate(cx, btnY + btnH / 2);
  ctx.scale(Math.max(0.01, btnIn) * btnPulse, Math.max(0.01, btnIn) * btnPulse);
  ctx.shadowColor = withAlpha(th.primaryLight, 0.75);
  ctx.shadowBlur = w * 0.09;
  fillRoundRect(ctx, -btnW / 2, -btnH / 2, btnW, btnH, btnH / 2, th.primary);
  ctx.shadowBlur = 0;
  // 按钮高光
  const hg = ctx.createLinearGradient(0, -btnH / 2, 0, btnH / 2);
  hg.addColorStop(0, 'rgba(255,255,255,0.28)');
  hg.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  fillRoundRect(ctx, -btnW / 2, -btnH / 2, btnW, btnH, btnH / 2, hg);
  setFont(ctx, { size: w * 0.056, weight: 900 });
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(props.isZh ? '🛒 点击链接 立即抢购' : '🛒 TAP LINK & SHOP NOW', 0, w * 0.004);
  ctx.restore();

  // 箭头下弹（按钮 → 链接区指引）
  const bounce = Math.abs(Math.sin(t * 3.4)) * w * 0.02;
  setFont(ctx, { size: w * 0.07, weight: 900 });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = withAlpha(th.primaryLight, 0.9);
  ctx.fillText('↓', cx, btnY + btnH + w * 0.035 + bounce);

  // 库存紧迫感
  const urg = 0.75 + Math.sin(t * 6) * 0.25;
  const stock = props.isZh ? '🔥 库存紧张 · 手慢无' : '🔥 Selling fast — limited stock!';
  setFont(ctx, { size: w * 0.037, weight: 700 });
  ctx.globalAlpha = urg;
  ctx.fillStyle = '#fca5a5';
  ctx.fillText(stock, cx, h * 0.635);
  ctx.globalAlpha = 1;

  drawStars(dc, props, cx, h * 0.690, 0.95);

  // 价格回顾
  if (props.product.priceDisplay) {
    const pin = easeOutCubic(clamp01((t - 0.6) / 0.5));
    ctx.globalAlpha = pin;
    setFont(ctx, { size: w * 0.075, weight: 900 });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = w * 0.03;
    ctx.fillStyle = '#fff';
    ctx.fillText(props.product.priceDisplay, cx, h * 0.755);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}
