'use client';

/**
 * 真人数字人带货视频框架（照片驱动 + TTS 音频驱动）
 *
 * 技术路线（调研结论）：
 * - SadTalker / MuseTalk / Hallo3 / EchoMimicV2 / LatentSync 等开源照片驱动数字人
 *   全部依赖 4–12GB 显存的 GPU 推理，无法在 Vercel Serverless 环境（本平台生产环境）
 *   运行，故不适用。
 * - 声音：接入 GitHub 开源 msedge-tts（微软 Edge 神经网络真人声线，140+ 语言、
 *   男/女声、免费无 Key），由 /api/tts 服务端合成 24kHz MP3。
 * - 形象：AI 生成的真人质感形象照 + 自研 Canvas 动画层：
 *     · 音频振幅包络驱动的下颌/口型开合（音频逐帧 RMS 归一化 + 平滑）
 *     · 确定性眨眼（相位由形象 id 哈希决定，预览与导出逐帧一致）
 *     · 头部微摆 / 呼吸缩放 / 轻微旋转
 *     · 主题化背景 + 商品卡片 + 字幕条 + 价格/CTA 场景
 * - 导出：WebCodecs VideoEncoder(H.264) + AudioEncoder(AAC) + mp4-muxer，
 *   生成带真人语音音轨的真正 MP4；不支持时降级 MediaRecorder（canvas + 音频流）。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, Download, Loader2 } from 'lucide-react';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import {
  type DrawContext,
  fillGradient,
  fillRoundRect,
  roundRect,
  setFont,
  wrapText,
  withAlpha,
  drawImageContain,
} from './canvas-utils';
import { type SceneTheme, resolveSceneTheme } from './scene-theme';
import { AVATAR_RIGS, sampleSkinTone } from './avatar-rigs';
import { drawAvatarPuppet } from './avatar-puppet';
import { drawShowcaseScene } from './product-showcase';

/* ------------------------------------------------------------------ */
/* 真人数字人形象（AI 生成的形象照，见 public/avatars/）                  */
/* ------------------------------------------------------------------ */

export type PhotoAvatarGender = 'female' | 'male';

/** 逐形象嘴部校准（离线检测生成视频的构图后烘焙，未设置时使用全局默认） */
export interface AvatarFaceCalibration {
  /** 垂直 cover 裁剪的起始比例（0..1，越小越偏画面顶部） */
  cropTop?: number;
  /** 嘴线在裁剪后可见区域中的纵向比例（0..1） */
  mouthY?: number;
}

export interface PhotoAvatarSpec {
  id: string;
  name: string;
  gender: PhotoAvatarGender;
  countryCode: string;
  countryName: string;
  flag: string;
  /** 选择器缩略图（真人形象照） */
  photo: string;
  /** 真人主播说话视频（口播主体，Seedance 以形象照为首帧生成） */
  video: string;
  /** 该形象国家对应的口音 locale（用于 TTS 选声线） */
  voiceLocale: string;
  /** 嘴部位置校准（生成视频构图偏差时覆盖默认值） */
  face?: AvatarFaceCalibration;
}

export const PHOTO_AVATARS: PhotoAvatarSpec[] = [
  { id: 'us-f', name: 'Emma', gender: 'female', countryCode: 'US', countryName: 'United States', flag: '🇺🇸', photo: '/avatars/us-f.jpg', video: '/avatar-videos/us-f.mp4', voiceLocale: 'en-US' },
  { id: 'us-m', name: 'Ryan', gender: 'male', countryCode: 'US', countryName: 'United States', flag: '🇺🇸', photo: '/avatars/us-m.jpg', video: '/avatar-videos/us-m.mp4', voiceLocale: 'en-US' },
  { id: 'gb-f', name: 'Charlotte', gender: 'female', countryCode: 'GB', countryName: 'United Kingdom', flag: '🇬🇧', photo: '/avatars/gb-f.jpg', video: '/avatar-videos/gb-f.mp4', voiceLocale: 'en-GB' },
  { id: 'gb-m', name: 'Oliver', gender: 'male', countryCode: 'GB', countryName: 'United Kingdom', flag: '🇬🇧', photo: '/avatars/gb-m.jpg', video: '/avatar-videos/gb-m.mp4', voiceLocale: 'en-GB' },
  { id: 'fr-f', name: 'Chloé', gender: 'female', countryCode: 'FR', countryName: 'France', flag: '🇫🇷', photo: '/avatars/fr-f.jpg', video: '/avatar-videos/fr-f.mp4', voiceLocale: 'fr-FR' },
  { id: 'fr-m', name: 'Louis', gender: 'male', countryCode: 'FR', countryName: 'France', flag: '🇫🇷', photo: '/avatars/fr-m.jpg', video: '/avatar-videos/fr-m.mp4', voiceLocale: 'fr-FR' },
  { id: 'jp-f', name: 'Sakura', gender: 'female', countryCode: 'JP', countryName: 'Japan', flag: '🇯🇵', photo: '/avatars/jp-f.jpg', video: '/avatar-videos/jp-f.mp4', voiceLocale: 'ja-JP' },
  { id: 'jp-m', name: 'Haruto', gender: 'male', countryCode: 'JP', countryName: 'Japan', flag: '🇯🇵', photo: '/avatars/jp-m.jpg', video: '/avatar-videos/jp-m.mp4', voiceLocale: 'ja-JP' },
  { id: 'kr-f', name: 'Jiwoo', gender: 'female', countryCode: 'KR', countryName: 'South Korea', flag: '🇰🇷', photo: '/avatars/kr-f.jpg', video: '/avatar-videos/kr-f.mp4', voiceLocale: 'ko-KR' },
  { id: 'kr-m', name: 'Minjun', gender: 'male', countryCode: 'KR', countryName: 'South Korea', flag: '🇰🇷', photo: '/avatars/kr-m.jpg', video: '/avatar-videos/kr-m.mp4', voiceLocale: 'ko-KR' },
  { id: 'cn-f', name: 'Xiaoyu', gender: 'female', countryCode: 'CN', countryName: 'China', flag: '🇨🇳', photo: '/avatars/cn-f.jpg', video: '/avatar-videos/cn-f.mp4', voiceLocale: 'zh-CN' },
  { id: 'cn-m', name: 'Chen', gender: 'male', countryCode: 'CN', countryName: 'China', flag: '🇨🇳', photo: '/avatars/cn-m.jpg', video: '/avatar-videos/cn-m.mp4', voiceLocale: 'zh-CN' },
];

/* ------------------------------------------------------------------ */
/* TTS 声线选择（msedge-tts 神经网络真人声线）                           */
/* ------------------------------------------------------------------ */

const EDGE_VOICES: Record<string, { F: string; M: string }> = {
  'en-US': { F: 'en-US-JennyNeural', M: 'en-US-GuyNeural' },
  'en-GB': { F: 'en-GB-SoniaNeural', M: 'en-GB-RyanNeural' },
  'fr-FR': { F: 'fr-FR-DeniseNeural', M: 'fr-FR-HenriNeural' },
  'ja-JP': { F: 'ja-JP-NanamiNeural', M: 'ja-JP-KeitaNeural' },
  'ko-KR': { F: 'ko-KR-SunHiNeural', M: 'ko-KR-InJoonNeural' },
  'zh-CN': { F: 'zh-CN-XiaoxiaoNeural', M: 'zh-CN-YunjianNeural' },
  'zh-TW': { F: 'zh-TW-HsiaoChenNeural', M: 'zh-TW-YunJhongNeural' },
  'de-DE': { F: 'de-DE-KatjaNeural', M: 'de-DE-ConradNeural' },
  'es-ES': { F: 'es-ES-ElviraNeural', M: 'es-ES-AlvaroNeural' },
  'pt-BR': { F: 'pt-BR-FranciscaNeural', M: 'pt-BR-AntonioNeural' },
  'it-IT': { F: 'it-IT-ElsaNeural', M: 'it-IT-DiegoNeural' },
  'ru-RU': { F: 'ru-RU-SvetlanaNeural', M: 'ru-RU-DmitryNeural' },
  'hi-IN': { F: 'hi-IN-SwaraNeural', M: 'hi-IN-MadhurNeural' },
  'id-ID': { F: 'id-ID-GadisNeural', M: 'id-ID-ArdiNeural' },
  'th-TH': { F: 'th-TH-PremwadeeNeural', M: 'th-TH-NiwatNeural' },
  'vi-VN': { F: 'vi-VN-HoaiMyNeural', M: 'vi-VN-NamMinhNeural' },
};

/**
 * 选择 TTS 声线：
 * - 说话语言跟随用户 UI locale；
 * - 当形象国家的语言与用户语言一致时，使用形象国家的口音（美式/英式等）；
 * - 性别跟随形象性别。
 */
export function pickEdgeVoice(
  gender: PhotoAvatarGender,
  userLocale: string,
  avatarVoiceLocale?: string,
): string {
  const g = gender === 'male' ? 'M' : 'F';
  const base = (userLocale || 'en').split('-')[0].toLowerCase();

  if (avatarVoiceLocale) {
    const avBase = avatarVoiceLocale.split('-')[0].toLowerCase();
    if (avBase === base && EDGE_VOICES[avatarVoiceLocale]) {
      return EDGE_VOICES[avatarVoiceLocale][g];
    }
  }
  if (base === 'zh') {
    const variant = /^zh-(tw|hk|mo|hant)/i.test(userLocale || '') ? 'zh-TW' : 'zh-CN';
    return EDGE_VOICES[variant][g];
  }
  const exact = EDGE_VOICES[userLocale];
  if (exact) return exact[g];
  const langOnly = Object.entries(EDGE_VOICES).find(([k]) => k.split('-')[0] === base);
  if (langOnly) return langOnly[1][g];
  return EDGE_VOICES['en-US'][g];
}

/* ------------------------------------------------------------------ */
/* 音频振幅包络（驱动口型）                                              */
/* ------------------------------------------------------------------ */

/**
 * 计算音频逐帧振幅包络（RMS → 95 分位归一化 → 3 点平滑）。
 * 返回 0..1 数组，长度 = ceil(duration * fps)。
 */
export function computeEnvelope(buffer: AudioBuffer, fps: number): number[] {
  const data = buffer.getChannelData(0);
  const win = Math.max(1, Math.floor(buffer.sampleRate / fps));
  const frames = Math.ceil(data.length / win);
  const rms: number[] = [];
  for (let i = 0; i < frames; i++) {
    const start = i * win;
    const end = Math.min(start + win, data.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j] * data[j];
    rms.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0.0001;
  const norm = rms.map((v) => Math.min(1, (v / (p95 || 0.0001)) * 1.1));
  return norm.map((v, i) => {
    const prev = norm[i - 1] ?? v;
    const next = norm[i + 1] ?? v;
    return 0.25 * prev + 0.5 * v + 0.25 * next;
  });
}

/* ------------------------------------------------------------------ */
/* 场景绘制（照片数字人 + 商品 + 字幕）                                  */
/* ------------------------------------------------------------------ */

export type TalkingSceneKind = 'greeting' | 'highlight' | 'price' | 'cta';

export interface TalkingSceneDrawProps {
  avatar: PhotoAvatarSpec;
  theme: SceneTheme;
  kind: TalkingSceneKind;
  subtitle: string;
  /** 顶部小标签（如 "Selling Point 1"） */
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
  };
  /** 真人主播视频（预览/MediaRecorder 实时绘制）；导出 WebCodecs 时为 null（使用 avatarFrames） */
  videoEl: HTMLVideoElement | null;
  /** 导出预解码的循环帧（15fps ImageBitmap，WebCodecs 确定性导出用） */
  avatarFrames: ImageBitmap[] | null;
  /** avatarFrames 每帧时长（秒） */
  avatarFrameDur: number;
  /** 全局时间轴（秒），驱动循环帧选择 */
  globalT: number;
  photoImg: HTMLImageElement | null;
  productImg: HTMLImageElement | null;
  /** 运行时采样的肤色（照片模式眨眼眼皮） */
  skinTone: string | null;
  /** 0..1 口型开合度（由音频包络驱动） */
  mouthOpen: number;
  /** 场景内已经过秒数（驱动徽章/CTA 动画） */
  sceneT: number;
  /** 形象确定性相位种子 */
  avatarSeed: number;
}

/**
 * 视频构图参数（生成提示词保证统一构图）：
 * cropTop 为垂直 cover 裁剪的起始比例（保留头部到胸部）；
 * mouthY 为嘴线在裁剪后可见区域中的纵向比例（校准于生成视频）。
 */
const VIDEO_FACE = {
  cropTop: 0.04,
  mouthY: 0.42,
  mouthHalfW: 0.085,
};

function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

export function drawTalkingScene(dc: DrawContext, props: TalkingSceneDrawProps): void {
  const { ctx, width: w, height: h } = dc;
  const th = props.theme;
  const t = props.sceneT;
  const seed = props.avatarSeed;

  /* ---- 背景：主题渐变 + 柔光 + 装饰圆 ---- */
  fillGradient(ctx, w, h, [
    { offset: 0, color: withAlpha(th.primary, 0.30) },
    { offset: 0.45, color: th.bgDark },
    { offset: 1, color: withAlpha(th.primaryDark, 0.35) },
  ], 'vertical');

  const glow = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.3, w * 0.9);
  glow.addColorStop(0, withAlpha(th.primaryLight, 0.18));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = th.primaryLight;
  ctx.beginPath();
  ctx.arc(w * 0.92, h * 0.16, w * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.06, h * 0.62, w * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* ---- 顶部 LIVE 徽章 ---- */
  const badgeY = h * 0.045;
  const pulse = 1 + 0.06 * Math.sin(t * 4);
  ctx.save();
  ctx.translate(w / 2, badgeY);
  ctx.scale(pulse, pulse);
  const badgeW = w * 0.36;
  const badgeH = h * 0.038;
  fillRoundRect(ctx, -badgeW / 2, -badgeH / 2, badgeW, badgeH, badgeH / 2, 'rgba(220, 38, 38, 0.92)');
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-badgeW * 0.32, 0, badgeH * 0.14, 0, Math.PI * 2);
  ctx.fill();
  setFont(ctx, { size: h * 0.019, weight: 800 });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('LIVE', -badgeW * 0.2, 0);
  ctx.restore();

  /* ---- 顶部右侧形象名牌 ---- */
  const chipY = h * 0.105;
  const nameText = `${props.avatar.name} ${props.avatar.flag}`;
  setFont(ctx, { size: w * 0.032, weight: 700 });
  const nameW = ctx.measureText(nameText).width;
  const chipW = nameW + w * 0.1;
  fillRoundRect(ctx, w / 2 - chipW / 2, chipY, chipW, h * 0.042, h * 0.021, 'rgba(0,0,0,0.35)');
  ctx.strokeStyle = withAlpha(th.primary, 0.55);
  ctx.lineWidth = Math.max(1.5, w * 0.003);
  roundRect(ctx, w / 2 - chipW / 2, chipY, chipW, h * 0.042, h * 0.021);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(nameText, w / 2, chipY + h * 0.021);

  /* ---- 真人主播（视频帧 cover 裁剪 / 照片口播引擎） ---- */
  const photoRect = { x: 0, y: h * 0.145, w, h: h * 0.42 };
  const FACE = { ...VIDEO_FACE, ...props.avatar.face };
  const img = props.photoImg;

  // 帧源：导出用预解码 ImageBitmap（确定性）；预览用实时播放的 video 元素
  const frames = props.avatarFrames;
  let liveVideo: HTMLVideoElement | null = null;
  if (
    (!frames || frames.length === 0) &&
    props.videoEl &&
    props.videoEl.readyState >= 2 &&
    props.videoEl.videoWidth > 0
  ) {
    liveVideo = props.videoEl;
  }
  let bitmap: ImageBitmap | null = null;
  if (frames && frames.length > 0 && props.avatarFrameDur > 0) {
    const fi = Math.floor(props.globalT / props.avatarFrameDur) % frames.length;
    bitmap = frames[Math.max(0, fi)];
  }

  type FrameSource = { src: CanvasImageSource; vw: number; vh: number };
  let frameSrc: FrameSource | null = null;
  if (bitmap) {
    frameSrc = { src: bitmap, vw: bitmap.width, vh: bitmap.height };
  } else if (liveVideo) {
    frameSrc = { src: liveVideo, vw: liveVideo.videoWidth, vh: liveVideo.videoHeight };
  }

  if (frameSrc) {
    const { src, vw, vh } = frameSrc;
    // cover：视频比区域窄长 → 宽度撑满，垂直裁剪（偏上保留头胸）
    const drawH = photoRect.w * (vh / vw);
    const visibleRatio = Math.min(1, photoRect.h / drawH);
    const srcH = vh * visibleRatio;
    const srcY = Math.min(vh * FACE.cropTop * (1 - visibleRatio) + vh * FACE.cropTop, vh - srcH);

    // 1) 完整视频帧（嘴线以上部分）
    const mouthCanvasY = photoRect.y + photoRect.h * FACE.mouthY;
    ctx.drawImage(src, 0, srcY, vw, srcH * FACE.mouthY, photoRect.x, photoRect.y, photoRect.w, photoRect.h * FACE.mouthY);

    // 2) 嘴线以下：音频驱动纵向拉伸（张嘴时下巴下移）
    const open = props.mouthOpen;
    const lowerSrcH = srcH * (1 - FACE.mouthY);
    const lowerDestH = photoRect.h * (1 - FACE.mouthY) * (1 + open * 0.085);
    ctx.drawImage(
      src,
      0, srcY + srcH * FACE.mouthY, vw, lowerSrcH,
      photoRect.x, mouthCanvasY, photoRect.w, lowerDestH,
    );

    // 3) 口腔阴影：唇间暗色椭圆（随开合变化）
    if (open > 0.06) {
      const mx = photoRect.x + photoRect.w / 2;
      const grad = ctx.createRadialGradient(mx, mouthCanvasY + open * photoRect.h * 0.012, 0, mx, mouthCanvasY + open * photoRect.h * 0.012, photoRect.w * FACE.mouthHalfW);
      grad.addColorStop(0, `rgba(35, 12, 12, ${0.55 * Math.min(1, open * 1.6)})`);
      grad.addColorStop(1, 'rgba(35, 12, 12, 0)');
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(mx, mouthCanvasY + open * photoRect.h * 0.012, photoRect.w * FACE.mouthHalfW, photoRect.h * 0.016 * (0.35 + open * 1.1), 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = grad;
      ctx.fillRect(mx - photoRect.w * FACE.mouthHalfW, mouthCanvasY - photoRect.h * 0.04, photoRect.w * FACE.mouthHalfW * 2, photoRect.h * 0.09);
      ctx.restore();
    }
  } else if (img && img.naturalWidth > 0) {
    // 照片口播模式（自研面部驱动引擎：下颌变形 + 视位口型 + 眨眼 + 头部运动）
    const rig = AVATAR_RIGS[props.avatar.id];
    if (rig) {
      drawAvatarPuppet({
        ctx,
        img,
        rig,
        rect: photoRect,
        mouthOpen: props.mouthOpen,
        globalT: props.globalT,
        sceneT: props.sceneT,
        seed: props.avatarSeed,
        bgDark: th.bgDark,
        skinTone: props.skinTone,
      });
    } else {
      // 无骨架数据：cover 兜底
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const rectAspect = photoRect.w / photoRect.h;
      let drawW: number, drawH: number;
      if (imgAspect > rectAspect) {
        drawH = photoRect.h;
        drawW = drawH * imgAspect;
      } else {
        drawW = photoRect.w;
        drawH = drawW / imgAspect;
      }
      const srcTotal = drawH - photoRect.h;
      const srcY = Math.max(0, srcTotal * 0.28);
      const srcX = Math.max(0, (drawW - photoRect.w) / 2);
      ctx.drawImage(img, srcX, srcY, photoRect.w, photoRect.h, photoRect.x, photoRect.y, photoRect.w, photoRect.h);
    }
  } else {
    // 占位剪影
    ctx.save();
    ctx.fillStyle = withAlpha(th.primary, 0.25);
    ctx.beginPath();
    ctx.arc(w / 2, photoRect.y + photoRect.h * 0.38, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ---- 主播手持商品展示（greeting/highlight：商品浮现于胸口右侧，随语音律动） ---- */
  if ((props.kind === 'greeting' || props.kind === 'highlight') && props.productImg && props.productImg.naturalWidth > 0) {
    const pSize = w * 0.19;
    const pcx = w * 0.775;
    const pcy = h * 0.515;
    // 弹入动画（场景前 0.55s 缩放淡入）+ 语音能量律动（bob + 微旋转）
    const appear = Math.min(1, Math.max(0, t / 0.55));
    const ease = 1 - Math.pow(1 - appear, 3);
    const bob = Math.sin(t * 2.1 + seed * 5) * w * 0.006 + props.mouthOpen * w * 0.008;
    const tilt = -0.11 + Math.sin(t * 1.4 + seed * 9) * 0.035;
    const pw = pSize * (0.82 + 0.18 * ease);
    ctx.save();
    ctx.translate(pcx, pcy + (1 - ease) * w * 0.05 + bob);
    ctx.rotate(tilt);
    ctx.scale(ease, ease);
    ctx.globalAlpha = ease;
    // 阴影
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = w * 0.035;
    ctx.shadowOffsetY = w * 0.012;
    fillRoundRect(ctx, -pw / 2, -pw / 2, pw, pw, w * 0.03, 'rgba(255,255,255,0.97)');
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    // 商品图（contain）
    ctx.save();
    roundRect(ctx, -pw / 2 + w * 0.006, -pw / 2 + w * 0.006, pw - w * 0.012, pw - w * 0.012, w * 0.026);
    ctx.clip();
    drawImageContain(ctx, props.productImg, -pw / 2 + w * 0.008, -pw / 2 + w * 0.008, pw - w * 0.016, pw - w * 0.016);
    ctx.restore();
    ctx.restore();
  }

  /* ---- 场景标签 ---- */
  if (props.label) {
    const labelY = h * 0.575;
    setFont(ctx, { size: w * 0.034, weight: 800 });
    const lw = ctx.measureText(props.label).width + w * 0.075;
    fillRoundRect(ctx, w / 2 - lw / 2, labelY, lw, h * 0.042, h * 0.021, withAlpha(th.primary, 0.92));
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.label, w / 2, labelY + h * 0.021);
  }

  /* ---- 卖点标题（highlight 场景） ---- */
  if (props.kind === 'highlight' && props.highlight) {
    const ht = props.highlight.title.toUpperCase();
    setFont(ctx, { size: w * 0.05, weight: 800 });
    const lines = wrapText(ctx, ht, w * 0.82).slice(0, 2);
    let y = h * 0.63;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const line of lines) {
      ctx.fillStyle = '#fff';
      ctx.fillText(line, w / 2, y);
      y += w * 0.062;
    }
    if (props.highlight.detail) {
      setFont(ctx, { size: w * 0.028, weight: 500 });
      ctx.fillStyle = withAlpha('#ffffff', 0.72);
      const dLines = wrapText(ctx, props.highlight.detail, w * 0.72).slice(0, 2);
      for (const line of dLines) {
        ctx.fillText(line, w / 2, y + w * 0.012);
        y += w * 0.036;
      }
    }
  }

  /* ---- 价格面板（price 场景） ---- */
  if (props.kind === 'price' && props.price) {
    const panelY = h * 0.60;
    const panelH = h * 0.13;
    const panelW = w * 0.84;
    fillRoundRect(ctx, w / 2 - panelW / 2, panelY, panelW, panelH, w * 0.045, 'rgba(0,0,0,0.4)');
    ctx.strokeStyle = withAlpha(th.primary, 0.7);
    ctx.lineWidth = Math.max(2, w * 0.005);
    roundRect(ctx, w / 2 - panelW / 2, panelY, panelW, panelH, w * 0.045);
    ctx.stroke();

    setFont(ctx, { size: w * 0.085, weight: 900 });
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const priceY = props.price.original ? panelY + panelH * 0.44 : panelY + panelH * 0.5;
    ctx.fillText(props.price.display, w / 2, priceY);
    if (props.price.original) {
      setFont(ctx, { size: w * 0.032, weight: 600 });
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'right';
      const dispW = ctx.measureText(props.price.display).width;
      ctx.fillText(`${props.price.original} →`, w / 2 + dispW / 2 + w * 0.01, priceY);
      // OFF 徽章
      const orig = parseFloat((props.price.original || '').replace(/[^\d.]/g, ''));
      const cur = parseFloat((props.price.display || '').replace(/[^\d.]/g, ''));
      if (orig > cur && orig > 0) {
        const off = Math.round(((orig - cur) / orig) * 100);
        const offText = `-${off}%`;
        setFont(ctx, { size: w * 0.03, weight: 800 });
        const ow = ctx.measureText(offText).width + w * 0.03;
        fillRoundRect(ctx, w * 0.5 - panelW / 2 + w * 0.03, panelY - h * 0.022, ow, h * 0.044, h * 0.022, th.primary);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(offText, w * 0.5 - panelW / 2 + w * 0.03 + ow / 2, panelY);
      }
    }
  }

  /* ---- CTA 按钮（cta 场景） ---- */
  if (props.kind === 'cta') {
    const ctaPulse = 1 + 0.035 * Math.sin(t * 5);
    const ctaW = w * 0.66;
    const ctaH = h * 0.075;
    const ctaY = h * 0.635;
    ctx.save();
    ctx.translate(w / 2, ctaY + ctaH / 2);
    ctx.scale(ctaPulse, ctaPulse);
    const ctaGrad = ctx.createLinearGradient(-ctaW / 2, 0, ctaW / 2, 0);
    ctaGrad.addColorStop(0, th.primary);
    ctaGrad.addColorStop(1, th.primaryLight);
    ctx.shadowColor = withAlpha(th.primary, 0.65);
    ctx.shadowBlur = w * 0.05;
    fillRoundRect(ctx, -ctaW / 2, -ctaH / 2, ctaW, ctaH, ctaH / 2, ctaGrad);
    ctx.shadowBlur = 0;
    setFont(ctx, { size: w * 0.042, weight: 800 });
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🛒 ' + (props.price?.display ? `Buy Now ${props.price.display}` : 'Shop Now'), 0, 0);
    ctx.restore();
  }

  /* ---- 商品卡片（greeting/highlight 场景底部） ---- */
  if ((props.kind === 'greeting' || props.kind === 'highlight') && props.product) {
    const cardY = h * 0.70;
    const cardH = h * 0.088;
    const cardW = w * 0.88;
    const cardX = w / 2 - cardW / 2;
    fillRoundRect(ctx, cardX, cardY, cardW, cardH, w * 0.03, 'rgba(255,255,255,0.10)');
    ctx.strokeStyle = withAlpha('#ffffff', 0.18);
    ctx.lineWidth = Math.max(1, w * 0.002);
    roundRect(ctx, cardX, cardY, cardW, cardH, w * 0.03);
    ctx.stroke();

    const pad = cardH * 0.14;
    if (props.productImg && props.productImg.naturalWidth > 0) {
      ctx.save();
      roundRect(ctx, cardX + pad, cardY + pad, cardH - pad * 2, cardH - pad * 2, w * 0.02);
      ctx.clip();
      drawImageContain(ctx, props.productImg, cardX + pad, cardY + pad, cardH - pad * 2, cardH - pad * 2);
      ctx.restore();
    }
    const textX = cardX + pad + (cardH - pad * 2) + pad;
    const textW = cardX + cardW - pad - textX;
    setFont(ctx, { size: w * 0.026, weight: 700 });
    const nLines = wrapText(ctx, props.product.name, textW).slice(0, 1);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    if (nLines[0]) ctx.fillText(nLines[0], textX, cardY + pad);
    setFont(ctx, { size: w * 0.034, weight: 900 });
    ctx.fillStyle = th.primaryLight;
    const infoY = cardY + cardH - pad - w * 0.036;
    let infoX = textX;
    if (props.product.priceDisplay) {
      ctx.fillText(props.product.priceDisplay, textX, infoY);
      infoX = textX + ctx.measureText(props.product.priceDisplay).width + w * 0.025;
    }
    if (props.product.rating) {
      setFont(ctx, { size: w * 0.024, weight: 600 });
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`★ ${props.product.rating}${props.product.reviewCount ? ` (${props.product.reviewCount})` : ''}`, infoX, infoY + w * 0.006);
    }
  }

  /* ---- 字幕条 ---- */
  if (props.subtitle) {
    setFont(ctx, { size: w * 0.04, weight: 700 });
    const lines = wrapText(ctx, props.subtitle, w * 0.8).slice(0, 3);
    const lineH = w * 0.052;
    const subH = lines.length * lineH + w * 0.045;
    const subY = h * 0.925 - subH;
    fillRoundRect(ctx, w * 0.06, subY, w * 0.88, subH, w * 0.025, 'rgba(0,0,0,0.55)');
    ctx.strokeStyle = withAlpha(th.primary, 0.45);
    ctx.lineWidth = Math.max(1.5, w * 0.0035);
    roundRect(ctx, w * 0.06, subY, w * 0.88, subH, w * 0.025);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let y = subY + w * 0.0225;
    for (const line of lines) {
      ctx.fillText(line, w / 2, y);
      y += lineH;
    }
  }

  /* ---- 水印 ---- */
  setFont(ctx, { size: w * 0.022, weight: 600 });
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('clipop.ai', w - w * 0.045, h - h * 0.012);
}

/* ------------------------------------------------------------------ */
/* 场景数据模型                                                         */
/* ------------------------------------------------------------------ */

export interface TalkingSceneData {
  id: string;
  kind: TalkingSceneKind;
  subtitle: string;
  label?: string;
  highlight?: { title: string; detail?: string };
  price?: { display: string; original?: string };
  /** 已解码的 TTS 音频 */
  audioBuffer: AudioBuffer;
  /** 每帧口型振幅（fps 与渲染器一致） */
  envelope: number[];
  /** 场景时长（秒）= 音频时长 + 尾部缓冲 */
  duration: number;
}

export interface TalkingProductInfo {
  name: string;
  image?: string | null;
  priceDisplay?: string | null;
  originalPrice?: string | null;
  rating?: string | null;
  reviewCount?: string | null;
  brand?: string | null;
}

/* ------------------------------------------------------------------ */
/* 渲染器：预览（音频调度 + rAF）与导出（WebCodecs 音视频 / MediaRecorder 降级） */
/* ------------------------------------------------------------------ */

const PREVIEW_W = 540;
const PREVIEW_H = 960;
const EXPORT_W = 1080;
const EXPORT_H = 1920;
const FPS = 30;

type TrFn = (key: string, fallback?: string) => string;

/**
 * 预解码真人主播循环视频帧（WebCodecs 确定性导出用）。
 * 15fps 采样 + 缩放到 540 宽：5s 循环 ≈ 75 帧 ≈ 116MB 峰值（桌面浏览器可接受），
 * 导出结束由调用方 close() 释放。
 */
async function extractAvatarLoopFrames(
  videoUrl: string,
  sampleFps = 15,
  resizeWidth = 540,
): Promise<{ frames: ImageBitmap[]; frameDur: number }> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = videoUrl;
  video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(video);

  const frames: ImageBitmap[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('avatar video load timeout')), 20000);
      video.addEventListener('loadeddata', () => { clearTimeout(to); resolve(); }, { once: true });
      video.addEventListener('error', () => { clearTimeout(to); reject(new Error('avatar video load failed')); }, { once: true });
      video.load();
    });
    if (video.videoWidth <= 0) throw new Error('avatar video has no video track');

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
    const count = Math.max(1, Math.floor(duration * sampleFps));
    const frameDur = 1 / sampleFps;
    const resizeHeight = Math.round((resizeWidth * video.videoHeight) / Math.max(1, video.videoWidth));

    for (let i = 0; i < count; i++) {
      const t = Math.min(Math.max(0, duration - 0.02), i * frameDur);
      await new Promise<void>((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('avatar video seek timeout')), 10000);
        video.addEventListener('seeked', () => { clearTimeout(to); resolve(); }, { once: true });
        video.currentTime = t;
      });
      const bmp = await createImageBitmap(video, { resizeWidth, resizeHeight, resizeQuality: 'medium' });
      frames.push(bmp);
    }
    return { frames, frameDur };
  } finally {
    video.pause();
    video.remove();
  }
}

export function TalkingVideoRenderer({
  scenes,
  avatar,
  themeId,
  product,
  tr,
  onExported,
  mode = 'avatar',
  isZh = false,
}: {
  scenes: TalkingSceneData[];
  avatar: PhotoAvatarSpec;
  themeId: string;
  product: TalkingProductInfo;
  tr: TrFn;
  onExported?: (blob: Blob, videoUrl: string) => void;
  /** avatar = 主播口播（默认）；showcase = 商品种草（无数字人） */
  mode?: 'avatar' | 'showcase';
  isZh?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const rafRef = useRef<number>(0);
  const playingRef = useRef(false);
  const photoRef = useRef<HTMLImageElement | null>(null);
  const productImgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skinToneRef = useRef<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFormat, setVideoFormat] = useState<string>('');

  const theme = useMemo(() => resolveSceneTheme(themeId), [themeId]);
  const avatarSeed = useMemo(() => hashSeed(avatar.id), [avatar.id]);
  const totalDuration = useMemo(
    () => scenes.reduce((s, sc) => s + sc.duration, 0),
    [scenes],
  );
  const sceneStarts = useMemo(() => {
    const arr: number[] = [];
    let acc = 0;
    for (const sc of scenes) {
      arr.push(acc);
      acc += sc.duration;
    }
    return arr;
  }, [scenes]);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  }, []);

  /** 统一场景绘制入口：按 mode 分流（主播口播 / 商品种草） */
  const renderScene = useCallback(
    (
      dc: DrawContext,
      scene: TalkingSceneData,
      idx: number,
      sceneT: number,
      globalT: number,
      extras?: { avatarFrames?: ImageBitmap[] | null; avatarFrameDur?: number; videoEl?: HTMLVideoElement | null; skinTone?: string | null; photoImg?: HTMLImageElement | null },
    ) => {
      const frameIdx = Math.min(scene.envelope.length - 1, Math.floor(sceneT * FPS));
      const mouthOpen = scene.envelope[Math.max(0, frameIdx)] ?? 0;

      if (mode === 'showcase') {
        const hlBefore = scenes.slice(0, idx).filter((s) => s.kind === 'highlight').length;
        drawShowcaseScene(dc, {
          theme,
          kind: scene.kind,
          subtitle: scene.subtitle,
          label: scene.label,
          highlight: scene.highlight,
          price: scene.price,
          product,
          productImg: productImgRef.current,
          mouthOpen,
          sceneT,
          sceneDur: scene.duration,
          globalT,
          sceneIndex: idx,
          sceneCount: scenes.length,
          highlightIndex: hlBefore + (scene.kind === 'highlight' ? 1 : 0),
          isZh,
        });
        return;
      }

      drawTalkingScene(dc, {
        avatar,
        theme,
        kind: scene.kind,
        subtitle: scene.subtitle,
        label: scene.label,
        highlight: scene.highlight,
        price: scene.price,
        product,
        videoEl: extras?.videoEl !== undefined ? extras.videoEl : videoRef.current,
        avatarFrames: extras?.avatarFrames ?? null,
        avatarFrameDur: extras?.avatarFrameDur ?? 0,
        globalT,
        photoImg: extras?.photoImg !== undefined ? extras.photoImg : photoRef.current,
        productImg: productImgRef.current,
        skinTone: extras?.skinTone !== undefined ? extras.skinTone : skinToneRef.current,
        mouthOpen,
        sceneT,
        avatarSeed,
      });
    },
    [scenes, mode, avatar, theme, product, avatarSeed, isZh],
  );

  const drawFrame = useCallback(
    (elapsed: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let idx = 0;
      for (let i = 0; i < scenes.length; i++) {
        if (elapsed >= sceneStarts[i]) idx = i;
      }
      const scene = scenes[idx];
      const sceneT = Math.max(0, Math.min(scene.duration, elapsed - sceneStarts[idx]));

      renderScene(
        { ctx, progress: sceneT / scene.duration, width: canvas.width, height: canvas.height },
        scene, idx, sceneT, elapsed,
      );
    },
    [scenes, sceneStarts, renderScene],
  );

  // 加载形象照 + 商品图 + 真人主播循环视频，然后绘制首帧（showcase 模式仅加载商品图）
  useEffect(() => {
    let cancelled = false;
    if (mode !== 'avatar') {
      if (product.image) {
        const pimg0 = new Image();
        pimg0.crossOrigin = 'anonymous';
        pimg0.onload = () => {
          if (!cancelled) {
            productImgRef.current = pimg0;
            drawFrame(0);
          }
        };
        pimg0.src = product.image;
      }
      drawFrame(0);
      return () => {
        cancelled = true;
      };
    }
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        photoRef.current = img;
        const rig = AVATAR_RIGS[avatar.id];
        skinToneRef.current = rig ? sampleSkinTone(img, rig) : null;
        drawFrame(0);
      }
    };
    img.src = avatar.photo;

    if (product.image) {
      const pimg = new Image();
      pimg.crossOrigin = 'anonymous';
      pimg.onload = () => {
        if (!cancelled) productImgRef.current = pimg;
      };
      pimg.src = product.image;
    }

    // 真人主播视频：挂在 body 上（1px 透明；iOS 需在 DOM 内才输出像素），静音循环自动播放
    const prev = videoRef.current;
    if (prev) {
      prev.pause();
      prev.remove();
      videoRef.current = null;
    }
    const vid = document.createElement('video');
    vid.muted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    vid.src = avatar.video;
    vid.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    vid.addEventListener('loadeddata', () => {
      if (cancelled) return;
      videoRef.current = vid;
      void vid.play().catch(() => undefined);
      drawFrame(0);
    });
    vid.addEventListener('error', () => {
      // 视频缺失/加载失败 → 降级照片模式
      if (!cancelled) drawFrame(0);
    });
    document.body.appendChild(vid);
    vid.load();

    drawFrame(0);
    return () => {
      cancelled = true;
      vid.pause();
      vid.remove();
      if (videoRef.current === vid) videoRef.current = null;
    };
  }, [avatar.id, avatar.photo, avatar.video, product.image, drawFrame, mode]);

  const stopPlayback = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    for (const src of sourcesRef.current) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    sourcesRef.current = [];
  }, []);

  const handlePlay = useCallback(() => {
    if (playingRef.current) {
      stopPlayback();
      drawFrame(0);
      return;
    }
    const ctx = getAudioCtx();
    void ctx.resume();
    const t0 = ctx.currentTime + 0.12;
    sourcesRef.current = scenes.map((scene, i) => {
      const src = ctx.createBufferSource();
      src.buffer = scene.audioBuffer;
      src.connect(ctx.destination);
      src.start(t0 + sceneStarts[i]);
      return src;
    });
    playingRef.current = true;
    setPlaying(true);

    const loop = () => {
      if (!playingRef.current) return;
      const elapsed = ctx.currentTime - t0;
      if (elapsed >= totalDuration) {
        stopPlayback();
        drawFrame(0);
        return;
      }
      drawFrame(Math.max(0, elapsed));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [scenes, sceneStarts, totalDuration, getAudioCtx, stopPlayback, drawFrame]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => undefined);
    };
  }, []);

  /* ---------------- 导出：WebCodecs (H.264 + AAC) ---------------- */

  const exportViaMediaRecorder = useCallback(async (): Promise<{ blob: Blob; label: string }> => {
    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_W;
    canvas.height = EXPORT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');

    const audioCtx = getAudioCtx();
    await audioCtx.resume();
    const dest = audioCtx.createMediaStreamDestination();
    const t0 = audioCtx.currentTime + 0.25;
    sourcesRef.current = scenes.map((scene, i) => {
      const src = audioCtx.createBufferSource();
      src.buffer = scene.audioBuffer;
      src.connect(dest);
      src.start(t0 + sceneStarts[i]);
      return src;
    });

    const stream = canvas.captureStream(FPS);
    for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);

    const candidates = [
      'video/mp4;codecs=avc1.42001f,mp4a.40.2',
      'video/webm;codecs=vp9,opus',
      'video/webm',
    ];
    const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start(250);

    const drawTo = (elapsed: number) => {
      let idx = 0;
      for (let i = 0; i < scenes.length; i++) {
        if (elapsed >= sceneStarts[i]) idx = i;
      }
      const scene = scenes[idx];
      const sceneT = Math.max(0, Math.min(scene.duration, elapsed - sceneStarts[idx]));
      renderScene(
        { ctx, progress: sceneT / scene.duration, width: EXPORT_W, height: EXPORT_H },
        scene, idx, sceneT, elapsed,
      );
    };

    const startWall = performance.now() + 250;
    await new Promise<void>((resolve) => {
      const step = () => {
        const elapsed = (performance.now() - startWall) / 1000;
        if (elapsed >= totalDuration) {
          drawTo(totalDuration - 0.001);
          resolve();
          return;
        }
        drawTo(Math.max(0, elapsed));
        setExportPct(Math.min(95, (elapsed / totalDuration) * 95));
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    recorder.stop();
    await done;
    for (const src of sourcesRef.current) {
      try { src.stop(); } catch { /* noop */ }
    }
    sourcesRef.current = [];
    const blob = new Blob(chunks, { type: mimeType.split(';')[0] || 'video/webm' });
    const label = mimeType.startsWith('video/mp4') ? 'MP4 (H.264+AAC)' : 'WebM (VP9/Opus)';
    return { blob, label };
  }, [scenes, sceneStarts, totalDuration, theme, product, avatar, avatarSeed, getAudioCtx, renderScene]);

  const exportViaWebCodecs = useCallback(async (): Promise<{ blob: Blob; label: string }> => {
    const w = window as unknown as {
      VideoEncoder?: typeof VideoEncoder;
      VideoFrame?: typeof VideoFrame;
      AudioEncoder?: typeof AudioEncoder;
      AudioData?: typeof AudioData;
    };
    if (!w.VideoEncoder || !w.VideoFrame || !w.AudioEncoder || !w.AudioData) {
      throw new Error('WebCodecs unavailable');
    }

    // 预载图片（导出画布同步绘制）
    const photoImg = await new Promise<HTMLImageElement | null>((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = avatar.photo;
    });
    photoRef.current = photoImg;
    if (product.image) {
      const pimg = await new Promise<HTMLImageElement | null>((resolve) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = product.image;
      });
      productImgRef.current = pimg;
    }

    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_W;
    canvas.height = EXPORT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');

    // AAC 配置须与解码后的采样率一致（decodeAudioData 会重采样到 AudioContext 采样率）
    const sampleRate = scenes[0]?.audioBuffer.sampleRate ?? 24000;

    const audioSupported = await w.AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2', sampleRate, numberOfChannels: 1, bitrate: 96_000,
    }).catch(() => null);
    if (!audioSupported?.supported) throw new Error('AAC unsupported');

    const videoCodecs = ['avc1.420028', 'avc1.4D0028', 'avc1.42001f', 'avc1.42E01E'];
    let videoCodec = '';
    for (const codec of videoCodecs) {
      const sup = await w.VideoEncoder.isConfigSupported({
        codec, width: EXPORT_W, height: EXPORT_H, bitrate: 5_000_000, framerate: FPS,
      }).catch(() => null);
      if (sup?.supported) {
        videoCodec = codec;
        break;
      }
    }
    if (!videoCodec) throw new Error('H.264 unsupported');

    let encodeFailed = false;
    const onEncoderError = (e: unknown) => {
      encodeFailed = true;
      console.error('[TalkingVideoRenderer] encoder error:', e);
    };

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: EXPORT_W, height: EXPORT_H, frameRate: FPS },
      audio: { codec: 'aac', sampleRate, numberOfChannels: 1 },
      fastStart: 'in-memory',
    });

    const videoEncoder = new w.VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: onEncoderError,
    });
    videoEncoder.configure({
      codec: videoCodec, width: EXPORT_W, height: EXPORT_H, bitrate: 5_000_000, framerate: FPS,
    });

    const audioEncoder = new w.AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: onEncoderError,
    });
    audioEncoder.configure({
      codec: 'mp4a.40.2', sampleRate, numberOfChannels: 1, bitrate: 96_000,
    });

    // 预解码真人主播循环帧（确定性导出；失败则回退照片模式；showcase 模式跳过）
    let avatarFrames: ImageBitmap[] | null = null;
    let avatarFrameDur = 0;
    if (mode === 'avatar') {
      try {
        const extracted = await extractAvatarLoopFrames(avatar.video);
        avatarFrames = extracted.frames;
        avatarFrameDur = extracted.frameDur;
      } catch (e) {
        console.warn('[TalkingVideoRenderer] avatar loop extraction failed, fallback to photo:', e);
      }
    }

    const drawTo = (scene: TalkingSceneData, idx: number, sceneT: number, globalT: number) => {
      renderScene(
        { ctx, progress: sceneT / scene.duration, width: EXPORT_W, height: EXPORT_H },
        scene, idx, sceneT, globalT,
        { avatarFrames, avatarFrameDur, videoEl: null },
      );
    };

    // 编码音频：按场景顺序写入 AAC（时间戳对齐全局视频帧时间轴）
    const enqueueAudio = async (scene: TalkingSceneData, sceneStartSec: number) => {
      const samples = scene.audioBuffer.getChannelData(0);
      const sr = scene.audioBuffer.sampleRate;
      const CHUNK = 1024;
      for (let offset = 0; offset < samples.length; offset += CHUNK) {
        const frames = Math.min(CHUNK, samples.length - offset);
        const data = samples.slice(offset, offset + frames);
        const audioData = new w.AudioData!({
          format: 'f32',
          sampleRate: sr,
          numberOfFrames: frames,
          numberOfChannels: 1,
          timestamp: Math.round((sceneStartSec + offset / sr) * 1e6),
          data,
        });
        audioEncoder.encode(audioData);
        audioData.close();
        if (audioEncoder.encodeQueueSize > 16) {
          await new Promise((r) => setTimeout(r, 4));
        }
      }
    };

    let globalFrame = 0;
    const totalFrames = scenes.reduce((s, sc) => s + Math.ceil(sc.duration * FPS), 0);

    try {
      for (let si = 0; si < scenes.length; si++) {
        const scene = scenes[si];
        const frames = Math.ceil(scene.duration * FPS);
        const sceneStartSec = globalFrame / FPS;
        void enqueueAudio(scene, sceneStartSec);

        for (let f = 0; f < frames; f++) {
          const sceneT = f / FPS;
          drawTo(scene, si, sceneT, globalFrame / FPS);
          const frame = new w.VideoFrame!(canvas, {
            timestamp: Math.round(globalFrame * (1e6 / FPS)),
            duration: Math.round(1e6 / FPS),
          });
          videoEncoder.encode(frame, { keyFrame: globalFrame % 60 === 0 });
          frame.close();
          globalFrame++;
          if (videoEncoder.encodeQueueSize > 8) {
            await new Promise((r) => setTimeout(r, 4));
          }
          if ((globalFrame & 15) === 0) setExportPct(Math.min(96, (globalFrame / totalFrames) * 96));
          if (encodeFailed) throw new Error('video encoder failed');
        }
      }

      setExportPct(97);
      await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);
      videoEncoder.close();
      audioEncoder.close();
      muxer.finalize();
    } finally {
      if (avatarFrames) {
        for (const bmp of avatarFrames) bmp.close();
        avatarFrames = null;
      }
    }

    const buffer = (muxer.target as ArrayBufferTarget).buffer;
    if (!buffer || buffer.byteLength === 0) throw new Error('muxer produced empty buffer');
    return { blob: new Blob([buffer], { type: 'video/mp4' }), label: 'MP4 (H.264 + AAC 真人语音)' };
  }, [scenes, theme, product, avatar, avatarSeed, renderScene]);

  const handleExport = useCallback(async () => {
    if (exporting || scenes.length === 0) return;
    stopPlayback();
    setExporting(true);
    setExportPct(0);
    setVideoUrl(null);
    try {
      let result: { blob: Blob; label: string };
      try {
        result = await exportViaWebCodecs();
      } catch (webcodecsErr) {
        console.warn('[TalkingVideoRenderer] WebCodecs path failed, falling back to MediaRecorder:', webcodecsErr);
        result = await exportViaMediaRecorder();
      }
      const url = URL.createObjectURL(result.blob);
      setVideoUrl(url);
      setVideoFormat(result.label);
      setExportPct(100);
      onExported?.(result.blob, url);
    } catch (err) {
      console.error('[TalkingVideoRenderer] export failed:', err);
      alert(tr('digitalHuman.exportFailed', 'Export failed. Please try again.'));
    } finally {
      setExporting(false);
    }
  }, [exporting, scenes.length, stopPlayback, exportViaWebCodecs, exportViaMediaRecorder, onExported, tr]);

  const currentSceneLabel = tr('digitalHuman.sceneLabel', 'Scene');
  const playText = playing ? tr('digitalHuman.stop', 'Stop') : tr('digitalHuman.play', 'Play');
  const exportText = tr('digitalHuman.exportVoiceVideo', 'Export MP4 (with voice)');

  return (
    <div className="space-y-4">
      {/* 预览画布 */}
      <div className="relative mx-auto w-full max-w-[320px]">
        <canvas
          ref={canvasRef}
          width={PREVIEW_W}
          height={PREVIEW_H}
          className="w-full rounded-xl border border-border bg-black shadow-lg"
        />
        {!playing && (
          <button
            type="button"
            onClick={handlePlay}
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/25 transition hover:bg-black/40"
            aria-label={playText}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-xl">
              <Play className="h-7 w-7 translate-x-0.5 text-gray-900" />
            </span>
          </button>
        )}
        <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
          {currentSceneLabel} · {totalDuration.toFixed(1)}s
        </div>
      </div>

      {/* 控制区 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={handlePlay}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          {playing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playText}
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || scenes.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {exportText}
        </button>
      </div>

      {/* 导出进度 */}
      {exporting && (
        <div className="mx-auto max-w-sm space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${exportPct}%` }} />
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            {tr('digitalHuman.exportingVoice', 'Encoding video with voice…')} {Math.round(exportPct)}%
          </p>
        </div>
      )}

      {/* 导出结果 */}
      {videoUrl && !exporting && (
        <div className="space-y-2">
          <p className="text-center text-xs text-muted-foreground">{videoFormat}</p>
          <video src={videoUrl} controls autoPlay playsInline className="mx-auto max-w-[320px] rounded-xl border border-border shadow-lg" />
          <div className="flex justify-center">
            <a
              href={videoUrl}
              download="clipop-digital-human.mp4"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
              {tr('articleToVideo.download', 'Download')}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
