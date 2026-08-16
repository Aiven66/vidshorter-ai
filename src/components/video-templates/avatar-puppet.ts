/**
 * 自研真人数字人口播引擎 v3（照片驱动，纯浏览器端）。
 *
 * 核心算法 —— 基底 + 锥形下颌条带 + 唇形透镜（Base + tapered jaw strips + lip lens）：
 *  v2 的"唇线以下整片下落"会在嘴角两侧露出全宽背景横缝（脸部像被横向切断）。
 *  v3 分层根治：
 *   1) 基底：整张照片原样绘制 —— 任何未覆盖处永远是照片像素，背景绝无外露；
 *   2) 下颌条带：仅嘴部邻域的下半脸内容下移 jawDrop，随离嘴中心的水平距离
 *      余弦锥形衰减到 0（嘴角外侧不动）—— 皮肤随下颌自然下沉，无撕裂；
 *   3) 唇形透镜口腔：上缘 = 固定的上唇线，下缘 = 锥形下落的下唇曲线，
 *      暗腔/牙齿/舌头只画在透镜内 —— 口型对齐由构造保证，
 *      open = 0 时与原照片像素一致（零变形）。
 *
 * 其余层：头部微运动（旋转/平移/呼吸）、确定性眨眼（肤色眼皮+睫毛线）、
 * 视位宽度变化、边缘渐隐融合。所有参数均为确定性函数，预览与导出逐帧一致。
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

/** 眨眼曲线：确定性周期，~160ms 内闭合再睁开 */
function blinkAmount(t: number, seed: number): number {
  const period = 3.4 + seed * 1.6;
  const phase = (t + seed * 9) % period;
  if (phase > 0.16) return 0;
  const u = phase / 0.16;
  return u < 0.5 ? u * 2 : (1 - u) * 2;
}

/** 视位宽度因子：每 ~130ms 切换（模拟元音口型横向变化），闭合时回归中性 */
function visemeWidth(globalT: number, seed: number, open: number): number {
  const seg = Math.floor(globalT / 0.13);
  const r = prand(seg, seed);
  const target = 0.88 + r * 0.24;
  return 1 + (target - 1) * Math.min(1, open * 2.2);
}

/** 开合度缓动：闭合更干脆（快收慢放） */
function easeOpen(open: number): number {
  return Math.pow(Math.max(0, Math.min(1, open)), 0.85);
}

export function drawAvatarPuppet(p: PuppetParams): void {
  const { ctx, img, rig, rect } = p;
  const w = rect.w;
  const h = rect.h;

  /* ---- 1. 布局：face-fit（与 v1 一致，保证 QA 区域坐标不变） ---- */
  const faceWpx = rig.face.w * rig.imgW;
  const scale = (0.64 * w) / faceWpx; // 脸宽占区域 64%
  const drawW = rig.imgW * scale;
  const drawH = rig.imgH * scale;
  const faceCxImg = (rig.face.x + rig.face.w / 2) * rig.imgW;
  const offX = rect.x + w / 2 - faceCxImg * scale;
  const offY = rect.y + 0.05 * h - rig.face.y * rig.imgH * scale;

  const mapX = (fx: number) => offX + fx * rig.imgW * scale;
  const mapY = (fy: number) => offY + fy * rig.imgH * scale;

  /* ---- 2. 头部运动参数（微幅，不破坏口型对齐：旋转/平移作用在两片之上） ---- */
  const t = p.globalT;
  const seed = p.seed;
  const openRaw = Math.max(0, Math.min(1, p.mouthOpen));
  const open = easeOpen(openRaw);
  const rot = Math.sin(t * 0.9 + seed * 7) * 0.007 + open * 0.005;
  const tx = Math.sin(t * 0.5 + seed * 11) * 0.007 * w;
  const ty = Math.sin(t * 1.6 + seed * 5) * 0.005 * h;
  const breath = 1 + Math.sin(t * 2.1 + seed * 3) * 0.005;

  // 唇部关键位置（画布坐标）
  const mouthX = mapX(rig.mouth.x);
  const mouthY = mapY(rig.mouth.y); // 唇接触线
  const mhPx = Math.max(6, rig.mouth.h * rig.imgH * scale); // 唇区高度
  const mwPx = Math.max(10, rig.mouth.w * rig.imgW * scale); // 嘴宽
  const chinY = mapY(rig.chin);
  const pivotX = mouthX;
  const pivotY = chinY + 0.02 * h;

  const headTransform = () => {
    ctx.translate(pivotX + tx, pivotY + ty);
    ctx.rotate(rot);
    ctx.scale(1, breath);
    ctx.translate(-pivotX, -pivotY);
  };

  /* ---- 3. 下颌运动学 ---- */
  // 下落量：开口 1.0 时约 1.45 个唇区高度（真人张嘴的视觉幅度）
  const jawDrop = open * mhPx * 1.45;
  // 下巴跟随的轻微拉伸
  const chinStretch = 1 + open * 0.06;

  // 源图坐标
  const mouthLineSrc = rig.mouth.y * rig.imgH;
  const imgBottomDst = offY + drawH;

  /* ---- 裁剪区域 ---- */
  const clipY = rect.y - 0.02 * h;
  const clipH = h + 0.16 * h;

  /* ---- 锥形衰减：下颌下落量随离嘴中心的水平距离衰减 ---- */
  const fullZone = mwPx * 0.30; // 全幅下落区（口腔正中）
  const dropZone = mwPx * 0.72; // 下落截止区（嘴角外侧，皮肤不动）
  const taper = (cx: number): number => {
    const ax = Math.abs(cx - mouthX);
    if (ax <= fullZone) return 1;
    if (ax >= dropZone) return 0;
    const s = (ax - fullZone) / (dropZone - fullZone);
    return 0.5 * (1 + Math.cos(Math.PI * s));
  };

  /* ---- 4. 基底照片（完整无变形）+ 锥形下颌条带 ---- */
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x - 0.02 * w, clipY, w + 0.04 * w, clipH);
  ctx.clip();
  headTransform();

  // 4.1 基底：整张照片原样绘制 —— 未覆盖处永远是照片像素，背景绝无外露
  ctx.drawImage(img, offX, offY, drawW, drawH);

  // 4.2 下颌条带：嘴部邻域的下半脸内容下移，条带顶缘逐段线性拼接成平滑锥形曲线
  if (jawDrop > 0.5) {
    const N = 36;
    const sw = drawW / N;
    const lowerSrcH = Math.max(1, rig.imgH - mouthLineSrc);
    const lowerDstH = imgBottomDst - mouthY;
    for (let i = 0; i < N; i++) {
      const dx0 = offX + i * sw;
      const dx1 = dx0 + sw + 0.6; // 轻微重叠，消除条带间发丝缝
      const e0 = jawDrop * taper(dx0);
      const e1 = jawDrop * taper(dx1);
      if (e0 < 0.35 && e1 < 0.35) continue;
      const dc = (e0 + e1) / 2;
      const stc = 1 + (chinStretch - 1) * taper((dx0 + dx1) / 2);
      const sx = Math.max(0, (dx0 - offX) / scale);
      const sx1 = Math.min(rig.imgW, (dx1 - offX) / scale);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(dx0, mouthY + e0);
      ctx.lineTo(dx1, mouthY + e1);
      ctx.lineTo(dx1, imgBottomDst + 600);
      ctx.lineTo(dx0, imgBottomDst + 600);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(
        img,
        sx, mouthLineSrc, Math.max(1, sx1 - sx), lowerSrcH,
        dx0, mouthY + dc, dx1 - dx0, lowerDstH * stc,
      );
      ctx.restore();
    }
  }

  /* ---- 5. 口腔：唇形透镜（上缘=固定上唇线，下缘=锥形下落的下唇曲线） ---- */
  const gapH = jawDrop;
  if (open > 0.07 && gapH > 2.5) {
    const vw = visemeWidth(t, seed, open);
    const rx = mwPx * 0.5 * vw; // 半宽（透镜角点即嘴角）
    // 透镜横向轮廓（x 为画布绝对坐标，先平移到嘴中心再归一化）
    const lensR = (x: number) => Math.sqrt(Math.max(0, 1 - ((x - mouthX) / rx) ** 2));
    // 下唇曲线：下落量随锥形衰减 + 轻微咬合下唇缘
    const lipBot = (x: number) =>
      mouthY + 1 + (gapH * taper(x) + mhPx * 0.10) * lensR(x);

    const lensPath = () => {
      ctx.beginPath();
      ctx.moveTo(mouthX - rx, mouthY + 1);
      // 上缘：上唇线（固定，中央微微上拱）
      ctx.quadraticCurveTo(mouthX, mouthY + 1 - mhPx * 0.16, mouthX + rx, mouthY + 1);
      // 下缘：沿锥形下落的下唇曲线（右 → 左）
      const STEPS = 22;
      for (let i = STEPS; i >= 0; i--) {
        const x = mouthX - rx + (2 * rx * i) / STEPS;
        ctx.lineTo(x, lipBot(x));
      }
      ctx.closePath();
    };

    ctx.save();
    lensPath();
    ctx.clip();

    // 暗腔底色：上浅下深（上牙床反光）
    const cavity = ctx.createLinearGradient(0, mouthY - mhPx * 0.08, 0, lipBot(0) + 2);
    cavity.addColorStop(0, '#4a1d22');
    cavity.addColorStop(0.45, '#33121a');
    cavity.addColorStop(1, '#20090f');
    ctx.fillStyle = cavity;
    ctx.fillRect(mouthX - rx - 2, mouthY - mhPx * 0.1, rx * 2 + 4, lipBot(0) - mouthY + mhPx * 0.2);

    // 上排牙：挂在上唇下缘（固定），随开口增大而下伸
    const teethH = Math.min(gapH * 0.34, mhPx * 0.42);
    if (teethH > 1.5) {
      const tg = ctx.createLinearGradient(0, mouthY, 0, mouthY + teethH);
      tg.addColorStop(0, 'rgba(252, 248, 240, 0.98)');
      tg.addColorStop(1, 'rgba(228, 220, 208, 0.92)');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.ellipse(mouthX, mouthY + 1 + teethH * 0.5, rx * 0.72, teethH * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 下排牙：站在下落的下唇上缘（开合 > 0.4 渐显）
    if (open > 0.4) {
      const lt = Math.min(1, (open - 0.4) * 3.2);
      const lth = Math.min(gapH * 0.24, mhPx * 0.30) * lt;
      if (lth > 1) {
        ctx.fillStyle = 'rgba(238, 231, 219, 0.94)';
        ctx.beginPath();
        ctx.ellipse(mouthX, lipBot(0) - lth * 0.5, rx * 0.60, lth * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 舌头：口腔底部（开合 > 0.55 渐显）
    if (open > 0.55) {
      const st = Math.min(1, (open - 0.55) * 2.8);
      const sh = gapH * 0.30 * st;
      if (sh > 1) {
        ctx.fillStyle = `rgba(158, 66, 76, ${0.55 + 0.3 * st})`;
        ctx.beginPath();
        ctx.ellipse(mouthX, lipBot(0) - sh * 0.3, rx * 0.52, sh * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 内唇暗红边缘线（唇形轮廓，融合口腔与嘴唇）
    ctx.strokeStyle = `rgba(96, 30, 36, ${0.34 + 0.2 * open})`;
    ctx.lineWidth = Math.max(1, mhPx * 0.07);
    lensPath();
    ctx.stroke();

    // 下唇下缘阴影（下颌下落的立体感，沿下唇曲线）
    const shY0 = lipBot(0);
    const lipShade = ctx.createLinearGradient(0, shY0, 0, shY0 + mhPx * 0.5);
    lipShade.addColorStop(0, `rgba(40, 16, 18, ${0.20 * open})`);
    lipShade.addColorStop(1, 'rgba(40, 16, 18, 0)');
    ctx.fillStyle = lipShade;
    ctx.fillRect(mouthX - mwPx * 0.55, shY0, mwPx * 1.1, mhPx * 0.5);
  } else if (gapH > 0.5 && gapH <= 2.5) {
    // 极小间隙：仅画唇缝暗线，避免闪烁
    ctx.strokeStyle = 'rgba(70, 26, 30, 0.35)';
    ctx.lineWidth = Math.max(1, gapH);
    ctx.beginPath();
    ctx.moveTo(mouthX - mwPx * 0.44, mouthY + gapH / 2);
    ctx.quadraticCurveTo(mouthX, mouthY + gapH * 1.4, mouthX + mwPx * 0.44, mouthY + gapH / 2);
    ctx.stroke();
  }

  /* ---- 6. 眨眼（肤色眼皮从上往下盖 + 睫毛线） ---- */
  const blink = blinkAmount(p.sceneT, seed);
  if (blink > 0.1 && p.skinTone) {
    for (const eye of [rig.leftEye, rig.rightEye]) {
      const ex = mapX(eye.x);
      const ey = mapY(eye.y);
      const ew = eye.w * rig.imgW * scale;
      const eh = Math.max(4, eye.h * rig.imgH * scale);
      // 眼皮：顶端固定于眼窝上缘，高度随眨眼增大（覆盖眼球）
      const lidH = eh * (0.5 + blink * 1.35);
      const lidTop = ey - eh * 0.75;
      ctx.save();
      try { ctx.filter = 'blur(1.2px)'; } catch { /* 不支持则硬边 */ }
      ctx.fillStyle = p.skinTone;
      ctx.beginPath();
      ctx.ellipse(ex, lidTop + lidH * 0.25, ew * 0.60, lidH * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.filter = 'none';
      // 睫毛线（眼皮底缘弧线）
      const lashY = lidTop + lidH * 0.52;
      ctx.strokeStyle = `rgba(48, 28, 24, ${0.55 * blink})`;
      ctx.lineWidth = Math.max(1.2, ew * 0.045);
      ctx.beginPath();
      ctx.ellipse(ex, lashY, ew * 0.56, Math.max(1, eh * 0.30), 0, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore(); // 头部变换 + 裁剪

  /* ---- 7. 边缘融合（照片渐隐到背景） ---- */
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
