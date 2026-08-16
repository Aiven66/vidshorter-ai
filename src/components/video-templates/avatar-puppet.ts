/**
 * 自研真人数字人口播引擎（照片驱动，纯浏览器端）。
 *
 * 设计目标：在无 GPU 推理的 Serverless 环境下，以单张形象照 + TTS 音频
 * 产出"看起来在真实说话"的口播效果。所有动画参数均为 (globalT, mouthOpen,
 * seed) 的确定性函数 —— 预览与导出逐帧一致。
 *
 * 分层渲染：
 *  1. 布局：按骨架把人脸对齐到宿主区域（face-fit，而非 cover-fit）
 *  2. 头部运动：微旋转 + 平移 + 呼吸缩放（下巴锚点），音频能量前倾
 *  3. 下颌变形：嘴线以下切片纵向拉伸（张嘴下巴下移）
 *  4. 口腔内部：暗腔 + 上排牙 + 下排牙 + 舌头（随开合度渐显，宽度按
 *     伪随机视位序列变化）
 *  5. 眨眼：确定性周期，肤色眼皮覆盖 + 睫毛线（肤色运行时采样）
 *  6. 边缘融合：照片上下左右渐隐到主题背景
 */
import { type AvatarRig } from './avatar-rigs';

export interface PuppetParams {
  ctx: CanvasRenderingContext2D;
  img: HTMLImageElement;
  rig: AvatarRig;
  /** 宿主区域（画布坐标） */
  rect: { x: number; y: number; w: number; h: number };
  /** 0..1 口型开合度（音频包络） */
  mouthOpen: number;
  /** 全局时间轴（秒） */
  globalT: number;
  /** 场景内时间（秒，眨眼相位） */
  sceneT: number;
  /** 0..1 确定性种子 */
  seed: number;
  /** 主题背景色（边缘融合），如 #0f172a */
  bgDark: string;
  /** 运行时采样的肤色（眨眼眼皮）；null 时跳过眼皮 */
  skinTone: string | null;
}

/** 确定性伪随机（视位宽度序列） */
function prand(i: number, seed: number): number {
  const x = Math.sin(i * 127.1 + seed * 311.7 + 13.37) * 43758.5453;
  return x - Math.floor(x);
}

/** 眨眼曲线：确定性周期，150ms 内闭合再睁开 */
function blinkAmount(t: number, seed: number): number {
  const period = 3.4 + seed * 1.6;
  const phase = (t + seed * 9) % period;
  if (phase > 0.15) return 0;
  const u = phase / 0.15;
  return u < 0.5 ? u * 2 : (1 - u) * 2;
}

/** 视位宽度因子：每 ~130ms 切换一次（模拟元音口型横向变化） */
function visemeWidth(globalT: number, seed: number, open: number): number {
  const seg = Math.floor(globalT / 0.13);
  const r = prand(seg, seed);
  const target = 0.86 + r * 0.28;
  // 嘴闭合时回归中性宽度
  return 1 + (target - 1) * Math.min(1, open * 2.2);
}

export function drawAvatarPuppet(p: PuppetParams): void {
  const { ctx, img, rig, rect } = p;
  const w = rect.w;
  const h = rect.h;

  /* ---- 1. 布局：face-fit ---- */
  const faceWpx = rig.face.w * rig.imgW;
  const scale = (0.64 * w) / faceWpx; // 脸宽占区域 64%
  const drawW = rig.imgW * scale;
  const drawH = rig.imgH * scale;
  const faceCxImg = (rig.face.x + rig.face.w / 2) * rig.imgW;
  const offX = rect.x + w / 2 - faceCxImg * scale;
  const offY = rect.y + 0.05 * h - rig.face.y * rig.imgH * scale; // 脸顶贴区域顶部 5%

  const mapX = (fx: number) => offX + fx * rig.imgW * scale;
  const mapY = (fy: number) => offY + fy * rig.imgH * scale;

  /* ---- 2. 头部运动参数 ---- */
  const t = p.globalT;
  const seed = p.seed;
  const open = p.mouthOpen;
  const rot = Math.sin(t * 0.9 + seed * 7) * 0.007 + open * 0.006;
  const tx = Math.sin(t * 0.5 + seed * 11) * 0.007 * w;
  const ty = Math.sin(t * 1.6 + seed * 5) * 0.005 * h;
  const breath = 1 + Math.sin(t * 2.1 + seed * 3) * 0.005;

  const mouthX = mapX(rig.mouth.x);
  const mouthY = mapY(rig.mouth.y);
  const chinY = mapY(rig.chin);
  const pivotX = mouthX;
  const pivotY = chinY + 0.02 * h;

  const headTransform = () => {
    ctx.translate(pivotX + tx, pivotY + ty);
    ctx.rotate(rot);
    ctx.scale(1, breath);
    ctx.translate(-pivotX, -pivotY);
  };

  /* ---- 裁剪区域（照片可见范围，底部延伸留渐隐） ---- */
  const clipY = rect.y - 0.02 * h;
  const clipH = h + 0.16 * h;
  const mouthLine = mouthY;

  /* ---- 3. 头部 + 下颌变形 ---- */
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x - 0.02 * w, clipY, w + 0.04 * w, clipH);
  ctx.clip();
  headTransform();

  // 上半部分（嘴线以上，完整照片）
  ctx.drawImage(img, 0, 0, rig.imgW, Math.max(1, rig.mouth.y * rig.imgH), offX, offY, drawW, Math.max(1, mouthLine - offY));

  // 下半部分（嘴线以下，纵向拉伸模拟下颌张开）
  const lowerSrcY = rig.mouth.y * rig.imgH;
  const lowerSrcH = rig.imgH - lowerSrcY;
  const lowerDstH = (chinY + 0.4 * h - mouthLine) * (1 + open * 0.055);
  ctx.drawImage(img, 0, lowerSrcY, rig.imgW, lowerSrcH, offX, mouthLine, drawW, lowerDstH);

  /* ---- 4. 口腔内部（视位口型） ---- */
  const mw = rig.mouth.w * rig.imgW * scale;
  const mh = rig.mouth.h * rig.imgH * scale;
  const vw = visemeWidth(t, seed, open);
  const cavityW = mw * 0.94 * vw;
  const cavityH = mh * 0.5 + open * mh * 3.4;
  const cavityX = mouthX;
  const cavityY = mouthY + cavityH * 0.24 + mh * 0.1;

  if (open > 0.05 && cavityH > 1) {
    // 口腔暗腔
    const grad = ctx.createRadialGradient(cavityX, cavityY, 0, cavityX, cavityY, cavityW * 0.55);
    grad.addColorStop(0, 'rgba(46, 16, 20, 0.96)');
    grad.addColorStop(1, 'rgba(28, 10, 13, 0.92)');
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cavityX, cavityY, cavityW / 2, cavityH / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(cavityX - cavityW, cavityY - cavityH, cavityW * 2, cavityH * 2);

    // 上排牙（开合 > 0.16 渐显）
    if (open > 0.16) {
      const th = cavityH * 0.3 * Math.min(1, (open - 0.16) * 5);
      ctx.fillStyle = 'rgba(246, 241, 233, 0.96)';
      ctx.beginPath();
      ctx.ellipse(cavityX, cavityY - cavityH / 2 + th / 2, cavityW * 0.4, th / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 下排牙（开合 > 0.42）
    if (open > 0.42) {
      const th = cavityH * 0.2 * Math.min(1, (open - 0.42) * 4);
      ctx.fillStyle = 'rgba(240, 234, 224, 0.9)';
      ctx.beginPath();
      ctx.ellipse(cavityX, cavityY + cavityH / 2 - th / 2, cavityW * 0.34, th / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 舌头（开合 > 0.58）
    if (open > 0.58) {
      const sh = cavityH * 0.3 * Math.min(1, (open - 0.58) * 3);
      ctx.fillStyle = 'rgba(158, 74, 84, 0.85)';
      ctx.beginPath();
      ctx.ellipse(cavityX, cavityY + cavityH * 0.32, cavityW * 0.28, sh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 下唇阴影（增强下颌下移的立体感）
    const lipShadow = ctx.createLinearGradient(0, cavityY + cavityH / 2, 0, cavityY + cavityH / 2 + mh * 1.4);
    lipShadow.addColorStop(0, `rgba(60, 30, 30, ${0.22 * Math.min(1, open * 1.4)})`);
    lipShadow.addColorStop(1, 'rgba(60, 30, 30, 0)');
    ctx.fillStyle = lipShadow;
    ctx.fillRect(cavityX - cavityW * 0.6, cavityY + cavityH / 2, cavityW * 1.2, mh * 1.4);
  }

  /* ---- 5. 眨眼（肤色眼皮 + 睫毛线） ---- */
  const blink = blinkAmount(p.sceneT, seed);
  if (blink > 0.12 && p.skinTone) {
    for (const eye of [rig.leftEye, rig.rightEye]) {
      const ex = mapX(eye.x);
      const ey = mapY(eye.y);
      const ew = eye.w * rig.imgW * scale;
      const eh = eye.h * rig.imgH * scale;
      // 眼皮（肤色椭圆，从上往下盖）
      ctx.fillStyle = p.skinTone;
      ctx.beginPath();
      ctx.ellipse(ex, ey - eh * (1 - blink) * 0.4, ew * 0.62, eh * (0.7 + blink * 2.6), 0, 0, Math.PI * 2);
      ctx.fill();
      // 睫毛线
      ctx.strokeStyle = `rgba(48, 30, 26, ${0.4 * blink})`;
      ctx.lineWidth = Math.max(1, ew * 0.05);
      ctx.beginPath();
      ctx.ellipse(ex, ey - eh * (1 - blink) * 0.4, ew * 0.6, eh * (0.7 + blink * 2.6), 0, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
    }
  }

  ctx.restore(); // 头部变换 + 裁剪

  /* ---- 6. 边缘融合（照片渐隐到背景） ---- */
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x - 0.02 * w, clipY, w + 0.04 * w, clipH);
  ctx.clip();
  // 底部渐隐
  const fadeH = 0.34 * h;
  const fadeY = rect.y + h - fadeH * 0.25;
  const bg = ctx.createLinearGradient(0, fadeY, 0, fadeY + fadeH);
  bg.addColorStop(0, 'rgba(0,0,0,0)');
  bg.addColorStop(1, hexToRgba(p.bgDark, 0.9));
  ctx.fillStyle = bg;
  ctx.fillRect(rect.x - 0.02 * w, fadeY, w + 0.04 * w, fadeH);
  // 两侧渐隐（照片窄于区域时）
  if (drawW < w * 0.99) {
    const side = (w - drawW) / 2 + 0.01 * w;
    for (const sx of [rect.x, rect.x + w - side]) {
      const sg = ctx.createLinearGradient(sx, 0, sx + side, 0);
      const dir = sx === rect.x ? 1 : 0;
      sg.addColorStop(0, hexToRgba(p.bgDark, dir ? 0.85 : 0));
      sg.addColorStop(1, hexToRgba(p.bgDark, dir ? 0 : 0.85));
      ctx.fillStyle = sg;
      ctx.fillRect(sx, clipY, side, clipH);
    }
  }
  ctx.restore();
}

/** #rrggbb → rgba() */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(10, 12, 24, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
