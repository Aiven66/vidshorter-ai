/**
 * 数字人带货短视频渲染引擎（Live Commerce Engine）
 *
 * 技术路线：
 * - 主体：Photo Puppet Engine v3 照片数字人（真人形象照 + 音频包络驱动口型/下颌/眨眼/头部微动），
 *   位于画面右侧作为出镜主播；
 * - 手势：自研矢量手势引擎（vector gesture engine）——以照片采样肤色绘制写实风格手部，
 *   支持「指点 point / 端持 present / 握持 hold」三种手势，配合缓动轨迹实现自然指向与持物动作；
 * - 场景：开场展示 → 逐个卖点（手指点讲解）→ 双手持商品放价（价格爆炸）→ CTA 下单引导；
 * - 与 TalkingVideoRenderer 复用同一条预览/导出管线（WebCodecs H.264+AAC → MP4）。
 */
import {
  type DrawContext,
  clamp01,
  easeOutCubic,
  fillGradient,
  fillRoundRect,
  roundRect,
  setFont,
  wrapText,
  withAlpha,
  drawImageContain,
} from './canvas-utils';
import { type SceneTheme } from './scene-theme';
import { AVATAR_RIGS } from './avatar-rigs';
import { drawAvatarPuppet } from './avatar-puppet';

export type LiveSceneKind = 'greeting' | 'highlight' | 'price' | 'cta';

export interface LiveSceneProps {
  theme: SceneTheme;
  kind: LiveSceneKind;
  subtitle: string;
  label?: string;
  highlight?: { title: string; detail?: string };
  price?: { display: string; original?: string };
  product?: {
    name: string;
    image?: string | null;
    priceDisplay?: string | null;
    originalPrice?: string | null;
    rating?: string | null;
    reviewCount?: string | null;
    brand?: string | null;
  };
  productImg: HTMLImageElement | null;
  photoImg: HTMLImageElement | null;
  skinTone: string | null;
  avatar: { id: string; name: string; flag: string; photo: string };
  mouthOpen: number;
  sceneT: number;
  sceneDur: number;
  globalT: number;
  avatarSeed: number;
  sceneIndex: number;
  sceneCount: number;
  highlightIndex: number;
  isZh: boolean;
}

/* ------------------------------------------------------------------ */
/* 矢量手势引擎                                                          */
/* ------------------------------------------------------------------ */

type HandGesture = 'point' | 'present' | 'hold';

/** 胶囊（圆头线段）：绘制手指/拇指的基本形 */
function capsule(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number, r: number,
  fill: string | CanvasGradient,
): void {
  ctx.beginPath();
  ctx.lineWidth = r * 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = fill as string;
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** 亮/暗肤色微调（保持色相，调节明度）。兼容 #hex 与 rgb(r,g,b) 两种输入。 */
function shade(color: string, k: number): string {
  let r: number, g: number, b: number;
  const rgbMatch = color.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgbMatch) {
    r = parseInt(rgbMatch[1], 10);
    g = parseInt(rgbMatch[2], 10);
    b = parseInt(rgbMatch[3], 10);
  } else {
    const m = color.replace('#', '');
    const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
    r = parseInt(n.slice(0, 2), 16);
    g = parseInt(n.slice(2, 4), 16);
    b = parseInt(n.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      r = 232; g = 180; b = 158; // 兜底肤色
    }
  }
  if (k >= 0) {
    r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k;
  } else {
    r *= 1 + k; g *= 1 + k; b *= 1 + k;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/**
 * 绘制写实风格矢量手。
 * 局部坐标系：腕部在原点 (0,0)，手指向 -y 方向伸展；单位约 1 = 手长 190。
 * mirror = true 时水平翻转（左手）。
 */
export function drawVectorHand(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number; y: number; rot: number; scale: number;
    skin: string; sleeve: string;
    gesture: HandGesture;
    mirror?: boolean;
    press?: number; // 0..1 按压幅度（point 手势的点击强调）
  },
): void {
  const { x, y, rot, scale, skin, sleeve, gesture } = opts;
  const mirror = opts.mirror ? -1 : 1;
  const press = opts.press ?? 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale * mirror, scale);
  // 阴影
  ctx.shadowColor = 'rgba(0,0,0,0.38)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;

  const light = shade(skin, 0.18);
  const dark = shade(skin, -0.22);

  /* ---- 袖口（腕部，主题深色） ---- */
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  fillRoundRect(ctx, -40, 6, 80, 46, 14, sleeve);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  fillRoundRect(ctx, -40, 6, 80, 12, 6, withAlpha('#ffffff', 0.14));

  /* ---- 手掌 ---- */
  const grad = ctx.createLinearGradient(0, -95, 0, 10);
  grad.addColorStop(0, light);
  grad.addColorStop(0.6, skin);
  grad.addColorStop(1, dark);
  ctx.beginPath();
  ctx.ellipse(0, -46, 44, 54, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  /* ---- 手指 ---- */
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 5;

  const fingerBaseX = [-30, -8, 14, 36]; // 食指/中指/无名指/小指
  if (gesture === 'point') {
    // 食指伸直（微倾 + 按压位移），其余三指卷起
    const ext = 96 + press * 14;
    capsule(ctx, fingerBaseX[0], -84, fingerBaseX[0] - 10, -84 - ext, 13, grad);
    capsule(ctx, fingerBaseX[0] - 10, -84 - ext, fingerBaseX[0] - 13, -92 - ext, 10.5, light);
    for (let i = 1; i < 4; i++) {
      const fx = fingerBaseX[i];
      capsule(ctx, fx, -82, fx + 4, -56, 12.5, grad);          // 近节
      capsule(ctx, fx + 4, -56, fx - 8, -44, 10.5, dark);      // 卷回
    }
    // 拇指贴掌侧
    capsule(ctx, -38, -62, -62, -84, 14, grad);
  } else if (gesture === 'present') {
    // 四指自然张开微曲（托举展示）
    const lens = [78, 86, 80, 60];
    const spread = [-16, -5, 6, 17];
    for (let i = 0; i < 4; i++) {
      const fx = fingerBaseX[i];
      capsule(ctx, fx, -80, fx + spread[i], -80 - lens[i] * 0.6, 12.5, grad);
      capsule(ctx, fx + spread[i], -80 - lens[i] * 0.6, fx + spread[i] * 0.4, -80 - lens[i], 10, light);
    }
    capsule(ctx, -36, -58, -66, -76, 14, grad);
  } else {
    // hold：四指半握（抓握物体前缘）
    for (let i = 0; i < 4; i++) {
      const fx = fingerBaseX[i];
      capsule(ctx, fx, -80, fx + 6, -52, 12.5, grad);
      capsule(ctx, fx + 6, -52, fx - 6, -34, 10.5, dark);
    }
    capsule(ctx, -38, -56, -66, -70, 14, grad);
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  /* ---- 指甲（伸出的手指） ---- */
  ctx.fillStyle = shade(skin, 0.32);
  if (gesture === 'point') {
    ctx.beginPath();
    ctx.ellipse(fingerBaseX[0] - 12, -88 - 92 - press * 14, 6.5, 9, -0.08, 0, Math.PI * 2);
    ctx.fill();
  } else if (gesture === 'present') {
    const lens = [78, 86, 80, 60];
    const spread = [-16, -5, 6, 17];
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(
        fingerBaseX[i] + spread[i] * 0.4, -76 - lens[i], 5.5, 8,
        spread[i] * 0.01, 0, Math.PI * 2,
      );
      ctx.fill();
    }
  }

  /* ---- 掌纹细节 ---- */
  ctx.strokeStyle = withAlpha(shade(skin, -0.3), 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-6, -52, 22, -0.5, 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(4, -44, 26, -0.4, 0.7);
  ctx.stroke();

  ctx.restore();
}

/** 从场景时间推导 0..1 的入场进度（前 0.5s 弹入） */
function appearEase(sceneT: number): number {
  return easeOutCubic(clamp01(sceneT / 0.5));
}

/** 点按节奏：在 [0.7,1.15] 与 [2.2,2.65] 秒两次点按（其余时间悬停微动） */
function tapPress(sceneT: number): number {
  const bump = (c: number) => {
    const d = Math.abs(sceneT - c);
    return d < 0.28 ? Math.cos((d / 0.28) * (Math.PI / 2)) : 0;
  };
  return Math.min(1, bump(0.9) + bump(2.4));
}

/* ------------------------------------------------------------------ */
/* 主绘制入口                                                           */
/* ------------------------------------------------------------------ */

export function drawLiveScene(dc: DrawContext, props: LiveSceneProps): void {
  const { ctx, width: w, height: h } = dc;
  const th = props.theme;
  const t = props.sceneT;
  const seed = props.avatarSeed;
  const isZh = props.isZh;

  /* ---- 背景 ---- */
  fillGradient(ctx, w, h, [
    { offset: 0, color: withAlpha(th.primary, 0.28) },
    { offset: 0.45, color: th.bgDark },
    { offset: 1, color: withAlpha(th.primaryDark, 0.4) },
  ], 'vertical');
  const glow = ctx.createRadialGradient(w * 0.72, h * 0.26, 0, w * 0.72, h * 0.26, w * 0.95);
  glow.addColorStop(0, withAlpha(th.primaryLight, 0.2));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = th.primaryLight;
  ctx.beginPath();
  ctx.arc(w * 0.1, h * 0.2, w * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.9, h * 0.72, w * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* ---- 顶部 LIVE 徽章 ---- */
  const badgeY = h * 0.042;
  const pulse = 1 + 0.06 * Math.sin(t * 4);
  ctx.save();
  ctx.translate(w / 2, badgeY);
  ctx.scale(pulse, pulse);
  const badgeW = w * 0.34;
  const badgeH = h * 0.036;
  fillRoundRect(ctx, -badgeW / 2, -badgeH / 2, badgeW, badgeH, badgeH / 2, 'rgba(220, 38, 38, 0.92)');
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-badgeW * 0.33, 0, badgeH * 0.14, 0, Math.PI * 2);
  ctx.fill();
  setFont(ctx, { size: h * 0.019, weight: 800 });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('LIVE', -badgeW * 0.22, 0);
  ctx.restore();

  /* ---- 主播姓名牌（左上，含头像 + 在线绿点） ---- */
  drawHostNameChip(ctx, w, h, props, t);

  /* ---- 场景进度点 ---- */
  const dotR = w * 0.007;
  const dotGap = w * 0.028;
  const dotsW = (props.sceneCount - 1) * dotGap;
  for (let i = 0; i < props.sceneCount; i++) {
    const dx = w / 2 - dotsW / 2 + i * dotGap;
    const dy = h * 0.088;
    ctx.beginPath();
    ctx.arc(dx, dy, i === props.sceneIndex ? dotR * 1.6 : dotR, 0, Math.PI * 2);
    ctx.fillStyle = i === props.sceneIndex ? th.primaryLight : 'rgba(255,255,255,0.28)';
    ctx.fill();
  }

  /* ---- 数字人主播（照片口播引擎，右侧） ---- */
  const photoRect = { x: w * 0.30, y: h * 0.05, w: w * 0.78, h: h * 0.68 };
  const rig = AVATAR_RIGS[props.avatar.id];
  if (props.photoImg && props.photoImg.naturalWidth > 0 && rig) {
    // 地面阴影（脚踏实感）
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(w * 0.72, h * 0.70, w * 0.24, h * 0.02, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawAvatarPuppet({
      ctx,
      img: props.photoImg,
      rig,
      rect: photoRect,
      mouthOpen: props.mouthOpen,
      globalT: props.globalT,
      sceneT: props.sceneT,
      seed,
      bgDark: th.bgDark,
      skinTone: props.skinTone,
    });
  } else {
    // 兜底：占位剪影
    ctx.save();
    ctx.fillStyle = withAlpha(th.primary, 0.25);
    ctx.beginPath();
    ctx.arc(w * 0.7, h * 0.28, w * 0.19, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const skin = props.skinTone || '#e8b49e';

  /* ---- 分场景：左侧信息卡 + 商品 + 手势 ---- */
  if (props.kind === 'greeting') drawGreeting(ctx, w, h, props, skin);
  else if (props.kind === 'highlight') drawHighlight(ctx, w, h, props, skin);
  else if (props.kind === 'price') drawPrice(ctx, w, h, props, skin);
  else drawCta(ctx, w, h, props, skin);

  /* ---- 字幕条 ---- */
  if (props.subtitle) {
    setFont(ctx, { size: w * 0.038, weight: 700 });
    const lines = wrapText(ctx, props.subtitle, w * 0.82).slice(0, 3);
    const lineH = w * 0.05;
    const subH = lines.length * lineH + w * 0.042;
    const subY = h * 0.945 - subH;
    fillRoundRect(ctx, w * 0.05, subY, w * 0.9, subH, w * 0.024, 'rgba(0,0,0,0.58)');
    ctx.strokeStyle = withAlpha(th.primary, 0.45);
    ctx.lineWidth = Math.max(1.5, w * 0.0032);
    roundRect(ctx, w * 0.05, subY, w * 0.9, subH, w * 0.024);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let y = subY + w * 0.021;
    for (const line of lines) {
      ctx.fillText(line, w / 2, y);
      y += lineH;
    }
  }

  /* ---- 水印 ---- */
  setFont(ctx, { size: w * 0.021, weight: 600 });
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('clipop.ai', w - w * 0.04, h - h * 0.01);
}

/* ------------------------------------------------------------------ */
/* 主播姓名牌                                                           */
/* ------------------------------------------------------------------ */

function drawHostNameChip(ctx: CanvasRenderingContext2D, w: number, h: number, props: LiveSceneProps, t: number): void {
  const chipY = h * 0.115;
  const nameText = `${props.avatar.name} ${props.avatar.flag}`;
  setFont(ctx, { size: w * 0.03, weight: 700 });
  const nameW = ctx.measureText(nameText).width;
  const chipW = nameW + w * 0.135;
  const chipH = h * 0.044;
  const chipX = w * 0.045;
  fillRoundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2, 'rgba(0,0,0,0.4)');
  ctx.strokeStyle = withAlpha(props.theme.primary, 0.55);
  ctx.lineWidth = Math.max(1.5, w * 0.003);
  roundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
  ctx.stroke();

  // 圆形头像
  const img = props.photoImg;
  const avR = chipH * 0.38;
  const avCx = chipX + chipH * 0.52;
  const avCy = chipY + chipH / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avCx, avCy, avR, 0, Math.PI * 2);
  ctx.clip();
  if (img && img.naturalWidth > 0) {
    const s = Math.max(avR * 2 / img.naturalWidth, avR * 2 / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    ctx.drawImage(img, avCx - dw / 2, avCy - dh * 0.42, dw, dh);
  } else {
    ctx.fillStyle = withAlpha(props.theme.primary, 0.6);
    ctx.fillRect(avCx - avR, avCy - avR, avR * 2, avR * 2);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(avCx, avCy, avR, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(props.theme.primaryLight, 0.8);
  ctx.lineWidth = Math.max(1.5, w * 0.004);
  ctx.stroke();

  // 姓名
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(nameText, avCx + avR + w * 0.016, avCy);

  // 在线绿点（随语音律动）
  const dotR = chipH * 0.11;
  const dotCx = chipX + chipW - w * 0.03;
  const breathe = 1 + props.mouthOpen * 0.35 + 0.08 * Math.sin(t * 3);
  const dotGlow = ctx.createRadialGradient(dotCx, avCy, 0, dotCx, avCy, dotR * 3 * breathe);
  dotGlow.addColorStop(0, 'rgba(34,197,94,0.55)');
  dotGlow.addColorStop(1, 'rgba(34,197,94,0)');
  ctx.fillStyle = dotGlow;
  ctx.beginPath();
  ctx.arc(dotCx, avCy, dotR * 3 * breathe, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(dotCx, avCy, dotR, 0, Math.PI * 2);
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/* 商品卡片通用绘制                                                      */
/* ------------------------------------------------------------------ */

function drawProductCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number, y: number, size: number, w: number,
  opts: { tilt?: number; alpha?: number } = {},
): void {
  const tilt = opts.tilt ?? 0;
  const alpha = opts.alpha ?? 1;
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(tilt);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = w * 0.04;
  ctx.shadowOffsetY = w * 0.014;
  fillRoundRect(ctx, -size / 2, -size / 2, size, size, w * 0.028, 'rgba(255,255,255,0.97)');
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (img && img.naturalWidth > 0) {
    ctx.save();
    roundRect(ctx, -size / 2 + w * 0.006, -size / 2 + w * 0.006, size - w * 0.012, size - w * 0.012, w * 0.024);
    ctx.clip();
    drawImageContain(ctx, img, -size / 2 + w * 0.01, -size / 2 + w * 0.01, size - w * 0.02, size - w * 0.02);
    ctx.restore();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 场景 1：开场展示（手指向商品）                                          */
/* ------------------------------------------------------------------ */

function drawGreeting(ctx: CanvasRenderingContext2D, w: number, h: number, p: LiveSceneProps, skin: string): void {
  const ease = appearEase(p.sceneT);
  const bob = Math.sin(p.sceneT * 2 + p.avatarSeed * 5) * w * 0.005;

  // 商品大卡（左侧滑入 + 轻微倾斜）
  const size = w * 0.42;
  const cx = w * 0.055 - (1 - ease) * w * 0.5;
  const cy = h * 0.15 + bob;
  drawProductCard(ctx, p.productImg, cx, cy, size, w, { tilt: -0.045, alpha: Math.min(1, ease + 0.2) });

  // 品牌小标
  if (p.product?.brand) {
    setFont(ctx, { size: w * 0.024, weight: 700 });
    const tw = ctx.measureText(p.product.brand.toUpperCase()).width + w * 0.036;
    fillRoundRect(ctx, cx + w * 0.01, cy + size + h * 0.012, tw, h * 0.032, h * 0.016, withAlpha(p.theme.primary, 0.9));
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.product.brand.toUpperCase(), cx + w * 0.028, cy + size + h * 0.012 + h * 0.016);
  }

  // MUST HAVE 徽章（脉冲）
  const pillText = p.isZh ? '必买好物' : 'MUST HAVE';
  setFont(ctx, { size: w * 0.03, weight: 800 });
  const pw = ctx.measureText(pillText).width + w * 0.06;
  const ph = h * 0.04;
  const py = cy + size + h * 0.058;
  const ppulse = 1 + 0.05 * Math.sin(p.sceneT * 5);
  ctx.save();
  ctx.translate(cx + w * 0.21, py + ph / 2);
  ctx.rotate(-0.05);
  ctx.scale(ppulse, ppulse);
  ctx.shadowColor = withAlpha(p.theme.primary, 0.7);
  ctx.shadowBlur = w * 0.04;
  fillRoundRect(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2, p.theme.primary);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, 0, 0);
  ctx.restore();

  // 主播手指向商品（从右侧伸入，点按节奏）
  const press = tapPress(p.sceneT);
  const handX = w * 0.46 + (1 - ease) * w * 0.3 + press * w * 0.02;
  const handY = h * 0.40 + Math.sin(p.sceneT * 1.8) * w * 0.008 + press * w * 0.012;
  drawVectorHand(ctx, {
    x: handX, y: handY,
    rot: Math.PI / 2 + 0.32, // 指尖朝左（指向商品卡）
    scale: w * 0.00092,
    skin, sleeve: p.theme.primaryDark,
    gesture: 'point', press,
  });
}

/* ------------------------------------------------------------------ */
/* 场景 2：卖点讲解（手指点编号徽章）                                       */
/* ------------------------------------------------------------------ */

function drawHighlight(ctx: CanvasRenderingContext2D, w: number, h: number, p: LiveSceneProps, skin: string): void {
  const ease = appearEase(p.sceneT);
  const cardX = w * 0.04 + (1 - ease) * w * 0.4;
  const cardY = h * 0.135;
  const cardW = w * 0.46;
  const cardH = h * 0.335;

  // 卖点卡片
  ctx.save();
  ctx.globalAlpha = Math.min(1, ease + 0.15);
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = w * 0.035;
  fillRoundRect(ctx, cardX, cardY, cardW, cardH, w * 0.032, 'rgba(0,0,0,0.42)');
  ctx.shadowBlur = 0;
  ctx.strokeStyle = withAlpha(p.theme.primary, 0.6);
  ctx.lineWidth = Math.max(2, w * 0.005);
  roundRect(ctx, cardX, cardY, cardW, cardH, w * 0.032);
  ctx.stroke();
  ctx.restore();

  // 卡内顶部：商品小图
  const thumbS = w * 0.16;
  drawProductCard(ctx, p.productImg, cardX + cardW / 2 - thumbS / 2, cardY + h * 0.022, thumbS, w, { alpha: ease });

  // 卖点标题（大字）
  if (p.highlight) {
    const title = p.highlight.title.toUpperCase();
    setFont(ctx, { size: w * 0.045, weight: 800 });
    const lines = wrapText(ctx, title, cardW - w * 0.05).slice(0, 2);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let ty = cardY + h * 0.155;
    for (const line of lines) {
      ctx.globalAlpha = ease;
      ctx.fillText(line, cardX + cardW / 2, ty);
      ty += w * 0.056;
    }
    if (p.highlight.detail) {
      setFont(ctx, { size: w * 0.026, weight: 500 });
      ctx.fillStyle = withAlpha('#ffffff', 0.75);
      const dLines = wrapText(ctx, p.highlight.detail, cardW - w * 0.06).slice(0, 2);
      for (const line of dLines) {
        ctx.fillText(line, cardX + cardW / 2, ty + w * 0.008);
        ty += w * 0.033;
      }
    }
    ctx.globalAlpha = 1;
  }

  // 编号圆徽章（压住卡片左上角）
  const badgeNum = String(Math.max(1, p.highlightIndex));
  const br = w * 0.052;
  const bcx = cardX + w * 0.02;
  const bcy = cardY + h * 0.01;
  const bPulse = 1 + 0.08 * Math.sin(p.sceneT * 4);
  ctx.save();
  ctx.translate(bcx, bcy);
  ctx.scale(bPulse, bPulse);
  ctx.shadowColor = withAlpha(p.theme.primary, 0.8);
  ctx.shadowBlur = w * 0.03;
  ctx.beginPath();
  ctx.arc(0, 0, br, 0, Math.PI * 2);
  ctx.fillStyle = p.theme.primary;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(2, w * 0.006);
  ctx.stroke();
  setFont(ctx, { size: br * 1.05, weight: 900 });
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeNum, 0, br * 0.06);
  ctx.restore();

  // 主播手指点徽章
  const press = tapPress(p.sceneT);
  const handX = w * 0.44 + (1 - ease) * w * 0.28 + press * w * 0.02;
  const handY = h * 0.185 + Math.sin(p.sceneT * 1.9 + 1) * w * 0.007 + press * w * 0.012;
  drawVectorHand(ctx, {
    x: handX, y: handY,
    rot: Math.PI / 2 + 0.42,
    scale: w * 0.00088,
    skin, sleeve: p.theme.primaryDark,
    gesture: 'point', press,
  });
}

/* ------------------------------------------------------------------ */
/* 场景 3：价格爆炸（双手持商品）                                          */
/* ------------------------------------------------------------------ */

function drawPrice(ctx: CanvasRenderingContext2D, w: number, h: number, p: LiveSceneProps, skin: string): void {
  const ease = appearEase(p.sceneT);
  const sway = Math.sin(p.sceneT * 1.6 + p.avatarSeed * 3) * 0.02;

  // 爆炸放射光线（价格区背后，缓慢旋转）
  ctx.save();
  ctx.translate(w * 0.26, h * 0.60);
  ctx.rotate(p.sceneT * 0.25);
  ctx.globalAlpha = 0.16 * ease;
  for (let i = 0; i < 14; i++) {
    ctx.rotate((Math.PI * 2) / 14);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-w * 0.035, -h * 0.30);
    ctx.lineTo(w * 0.035, -h * 0.30);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? p.theme.primaryLight : p.theme.primary;
    ctx.fill();
  }
  ctx.restore();

  // 商品（居中偏左，双手端持）
  const size = w * 0.40;
  const px = w * 0.06;
  const py = h * 0.165 + Math.sin(p.sceneT * 2.2) * w * 0.006;
  drawProductCard(ctx, p.productImg, px, py, size, w, { tilt: -0.05 + sway, alpha: Math.min(1, ease + 0.2) });

  // 双手：一手托底左角、一手扶右角（hold 手势，指尖搭在商品前缘）
  const gripEase = clamp01((p.sceneT - 0.25) / 0.4);
  if (gripEase > 0) {
    const gOff = (1 - easeOutCubic(gripEase)) * w * 0.22;
    // 左手（镜像）
    drawVectorHand(ctx, {
      x: px + w * 0.045 - gOff, y: py + size * 0.94,
      rot: Math.PI * 0.94, scale: w * 0.00080,
      skin, sleeve: p.theme.primaryDark, gesture: 'hold', mirror: true,
    });
    // 右手
    drawVectorHand(ctx, {
      x: px + size * 0.96 + gOff, y: py + size * 0.98,
      rot: Math.PI * 1.02, scale: w * 0.00080,
      skin, sleeve: p.theme.primaryDark, gesture: 'hold',
    });
  }

  // 价格面板
  if (p.price) {
    const panelY = h * 0.55;
    const panelH = h * 0.115;
    const panelW = w * 0.52;
    const panelX = w * 0.045;
    const pop = 1 + 0.045 * Math.sin(Math.max(0, p.sceneT - 0.45) * 6) * (p.sceneT > 0.45 ? 1 : 0);
    ctx.save();
    ctx.translate(panelX + panelW / 2, panelY + panelH / 2);
    ctx.scale(pop, pop);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = w * 0.045;
    fillRoundRect(ctx, -panelW / 2, -panelH / 2, panelW, panelH, w * 0.03, 'rgba(0,0,0,0.5)');
    ctx.shadowBlur = 0;
    ctx.strokeStyle = withAlpha(p.theme.primary, 0.75);
    ctx.lineWidth = Math.max(2, w * 0.005);
    roundRect(ctx, -panelW / 2, -panelH / 2, panelW, panelH, w * 0.03);
    ctx.stroke();

    setFont(ctx, { size: w * 0.078, weight: 900 });
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.price.display, 0, p.price.original ? -panelH * 0.10 : 0);

    if (p.price.original) {
      // 原价划线
      setFont(ctx, { size: w * 0.028, weight: 600 });
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const oText = `${p.isZh ? '原价' : 'Was'} ${p.price.original}`;
      ctx.fillText(oText, 0, panelH * 0.28);
      const oW = ctx.measureText(oText).width;
      ctx.strokeStyle = 'rgba(248,113,113,0.9)';
      ctx.lineWidth = Math.max(2, w * 0.004);
      ctx.beginPath();
      ctx.moveTo(-oW / 2 - w * 0.008, panelH * 0.28);
      ctx.lineTo(oW / 2 + w * 0.008, panelH * 0.28);
      ctx.stroke();

      // 折扣爆炸徽章
      const orig = parseFloat((p.price.original || '').replace(/[^\d.]/g, ''));
      const cur = parseFloat((p.price.display || '').replace(/[^\d.]/g, ''));
      if (orig > cur && orig > 0) {
        const off = Math.round(((orig - cur) / orig) * 100);
        const offText = `-${off}%`;
        setFont(ctx, { size: w * 0.034, weight: 900 });
        const ow = ctx.measureText(offText).width + w * 0.034;
        ctx.save();
        ctx.translate(panelW / 2 - ow * 0.1, -panelH / 2 - h * 0.012);
        ctx.rotate(0.12);
        const offPulse = 1 + 0.07 * Math.sin(p.sceneT * 5);
        ctx.scale(offPulse, offPulse);
        ctx.shadowColor = 'rgba(220,38,38,0.7)';
        ctx.shadowBlur = w * 0.03;
        fillRoundRect(ctx, -ow / 2, -h * 0.024, ow, h * 0.048, h * 0.012, '#dc2626');
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(offText, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();

    // 限时特惠小标
    const flashText = p.isZh ? '⚡ 限时特惠' : '⚡ LIMITED OFFER';
    setFont(ctx, { size: w * 0.028, weight: 800 });
    const fw = ctx.measureText(flashText).width + w * 0.05;
    fillRoundRect(ctx, panelX + panelW / 2 - fw / 2, panelY + panelH + h * 0.014, fw, h * 0.036, h * 0.018, withAlpha(p.theme.primary, 0.92));
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(flashText, panelX + panelW / 2, panelY + panelH + h * 0.014 + h * 0.018);
  }
}

/* ------------------------------------------------------------------ */
/* 场景 4：CTA 下单（手指向购买按钮）                                      */
/* ------------------------------------------------------------------ */

function drawCta(ctx: CanvasRenderingContext2D, w: number, h: number, p: LiveSceneProps, skin: string): void {
  const ease = appearEase(p.sceneT);

  // 商品小卡（左上）
  const size = w * 0.28;
  drawProductCard(ctx, p.productImg, w * 0.05, h * 0.14, size, w, { tilt: -0.03, alpha: Math.min(1, ease + 0.2) });

  // 星级 + 评分
  if (p.product?.rating) {
    const starY = h * 0.14 + size + h * 0.02;
    setFont(ctx, { size: w * 0.034, weight: 700 });
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const stars = '★★★★★';
    ctx.fillText(stars, w * 0.055, starY);
    const sw = ctx.measureText(stars).width;
    setFont(ctx, { size: w * 0.026, weight: 600 });
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(
      `${p.product.rating}${p.product.reviewCount ? ` (${p.product.reviewCount})` : ''}`,
      w * 0.055 + sw + w * 0.02,
      starY,
    );
  }

  // 购买按钮（脉冲 + 光晕）
  const ctaY = h * 0.475;
  const ctaW = w * 0.55;
  const ctaH = h * 0.075;
  const ctaX = w * 0.045;
  const ctaPulse = 1 + 0.04 * Math.sin(p.sceneT * 5);
  ctx.save();
  ctx.translate(ctaX + ctaW / 2, ctaY + ctaH / 2);
  ctx.scale(ctaPulse, ctaPulse);
  const ctaGrad = ctx.createLinearGradient(-ctaW / 2, 0, ctaW / 2, 0);
  ctaGrad.addColorStop(0, p.theme.primary);
  ctaGrad.addColorStop(1, p.theme.primaryLight);
  ctx.shadowColor = withAlpha(p.theme.primary, 0.7);
  ctx.shadowBlur = w * 0.06;
  fillRoundRect(ctx, -ctaW / 2, -ctaH / 2, ctaW, ctaH, ctaH / 2, ctaGrad);
  ctx.shadowBlur = 0;
  setFont(ctx, { size: w * 0.04, weight: 800 });
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.isZh ? '🛒 立即抢购' : '🛒 Buy Now', 0, 0);
  ctx.restore();

  // 库存紧迫感
  const stockText = p.isZh ? '🔥 库存紧张 · 手慢无' : '🔥 Only a few left';
  setFont(ctx, { size: w * 0.028, weight: 700 });
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(stockText, ctaX + ctaW / 2, ctaY + ctaH + h * 0.018);

  // 价格回顾
  if (p.price?.display) {
    setFont(ctx, { size: w * 0.034, weight: 800 });
    ctx.fillStyle = '#fff';
    ctx.fillText(p.price.display, ctaX + ctaW / 2, ctaY + ctaH + h * 0.052);
  }

  // 主播手指向下指向按钮
  const press = tapPress(p.sceneT);
  const handX = ctaX + ctaW * 0.82 + (1 - ease) * w * 0.2;
  const handY = h * 0.40 + press * w * 0.014;
  drawVectorHand(ctx, {
    x: handX, y: handY,
    rot: Math.PI * 0.98, // 指尖朝下
    scale: w * 0.0009,
    skin, sleeve: p.theme.primaryDark,
    gesture: 'point', press,
  });
}
