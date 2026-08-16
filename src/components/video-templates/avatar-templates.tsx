'use client';

/**
 * 数字人带货场景系统
 *
 * 纯 Canvas 2D 绘制的矢量数字人（HyperFrames 确定性渲染哲学）：
 * 每一帧由场景 progress (0..1) 推导，预览与导出共用同一 draw 函数，画面 100% 一致。
 *
 * 形象维度：性别（female/male）× 国家（US/UK/FR/JP/KR/CN）→ 12 个预设。
 * 动画：眨眼（确定性相位）、说话口型（正弦开合）、头部轻摆、手势（wave/point/present/ok）。
 */

import React, { useEffect, useRef } from 'react';
import {
  type DrawContext,
  easeOutCubic,
  stagger,
  fillGradient,
  fillRoundRect,
  roundRect,
  setFont,
  wrapText,
  withAlpha,
  getCachedImage,
  drawImageContain,
} from './canvas-utils';
import { type SceneTheme, resolveSceneTheme } from './scene-theme';

/* ------------------------------------------------------------------ */
/* 数字人形象定义                                                       */
/* ------------------------------------------------------------------ */

export type AvatarGender = 'female' | 'male';
export type AvatarHairStyle = 'long' | 'short' | 'bun' | 'bob';

export interface AvatarSpec {
  id: string;
  name: string;
  gender: AvatarGender;
  countryCode: string;
  countryName: string;
  flag: string;
  /** 肤色 */
  skin: string;
  /** 肤色阴影（颈部/侧脸） */
  skinShadow: string;
  /** 发色 */
  hair: string;
  hairStyle: AvatarHairStyle;
  /** 服装主色 */
  outfit: string;
  /** 服装点缀色 */
  outfitAccent: string;
}

export const AVATAR_PRESETS: AvatarSpec[] = [
  // 美国
  { id: 'us-f', name: 'Emma', gender: 'female', countryCode: 'US', countryName: 'United States', flag: '🇺🇸', skin: '#f6d5be', skinShadow: '#e8bf9f', hair: '#d9a55b', hairStyle: 'long', outfit: '#ec4899', outfitAccent: '#fbcfe8' },
  { id: 'us-m', name: 'Ryan', gender: 'male', countryCode: 'US', countryName: 'United States', flag: '🇺🇸', skin: '#f2c9a4', skinShadow: '#e0b088', hair: '#6b4a2f', hairStyle: 'short', outfit: '#2563eb', outfitAccent: '#bfdbfe' },
  // 英国
  { id: 'uk-f', name: 'Charlotte', gender: 'female', countryCode: 'UK', countryName: 'United Kingdom', flag: '🇬🇧', skin: '#f8dcc8', skinShadow: '#eec4a8', hair: '#a85b3a', hairStyle: 'bob', outfit: '#7c3aed', outfitAccent: '#ddd6fe' },
  { id: 'uk-m', name: 'Oliver', gender: 'male', countryCode: 'UK', countryName: 'United Kingdom', flag: '🇬🇧', skin: '#f4cfab', skinShadow: '#e2b68c', hair: '#3b3b3b', hairStyle: 'short', outfit: '#0f766e', outfitAccent: '#ccfbf1' },
  // 法国
  { id: 'fr-f', name: 'Chloé', gender: 'female', countryCode: 'FR', countryName: 'France', flag: '🇫🇷', skin: '#f7d9c3', skinShadow: '#e9c0a3', hair: '#8a5a3b', hairStyle: 'bun', outfit: '#e11d48', outfitAccent: '#fecdd3' },
  { id: 'fr-m', name: 'Louis', gender: 'male', countryCode: 'FR', countryName: 'France', flag: '🇫🇷', skin: '#e8bf98', skinShadow: '#d3a276', hair: '#2f2a26', hairStyle: 'short', outfit: '#1e40af', outfitAccent: '#dbeafe' },
  // 日本
  { id: 'jp-f', name: 'Yuki', gender: 'female', countryCode: 'JP', countryName: 'Japan', flag: '🇯🇵', skin: '#f9e0cd', skinShadow: '#efc9ae', hair: '#2e2a2f', hairStyle: 'long', outfit: '#f472b6', outfitAccent: '#fce7f3' },
  { id: 'jp-m', name: 'Haruto', gender: 'male', countryCode: 'JP', countryName: 'Japan', flag: '🇯🇵', skin: '#f6d6b8', skinShadow: '#e7bd97', hair: '#26221f', hairStyle: 'short', outfit: '#475569', outfitAccent: '#e2e8f0' },
  // 韩国
  { id: 'kr-f', name: 'Jiwoo', gender: 'female', countryCode: 'KR', countryName: 'South Korea', flag: '🇰🇷', skin: '#f9e1cb', skinShadow: '#f0c9ab', hair: '#7d5a44', hairStyle: 'long', outfit: '#8b5cf6', outfitAccent: '#ede9fe' },
  { id: 'kr-m', name: 'Minjun', gender: 'male', countryCode: 'KR', countryName: 'South Korea', flag: '🇰🇷', skin: '#f5d3ae', skinShadow: '#e5b98b', hair: '#33302c', hairStyle: 'short', outfit: '#0369a1', outfitAccent: '#e0f2fe' },
  // 中国
  { id: 'cn-f', name: 'Xiaoling', gender: 'female', countryCode: 'CN', countryName: 'China', flag: '🇨🇳', skin: '#f8dcc4', skinShadow: '#ecc3a2', hair: '#31292b', hairStyle: 'bob', outfit: '#dc2626', outfitAccent: '#fee2e2' },
  { id: 'cn-m', name: 'Wei', gender: 'male', countryCode: 'CN', countryName: 'China', flag: '🇨🇳', skin: '#f0c8a0', skinShadow: '#ddab7c', hair: '#2b2523', hairStyle: 'short', outfit: '#b45309', outfitAccent: '#fef3c7' },
];

/* ------------------------------------------------------------------ */
/* 场景 props                                                          */
/* ------------------------------------------------------------------ */

export type AvatarGesture = 'wave' | 'point' | 'present' | 'ok';

export interface DigitalHumanSceneProps {
  avatar: AvatarSpec;
  /** 底部字幕（数字人台词） */
  subtitle: string;
  /** 顶部胶囊标签（如卖点标题） */
  badge?: string;
  productName: string;
  price?: string;
  originalPrice?: string;
  productImage?: string;
  gesture?: AvatarGesture;
  theme?: SceneTheme;
}

/* ------------------------------------------------------------------ */
/* 确定性动画信号（全部由 progress 推导）                                 */
/* ------------------------------------------------------------------ */

/** 场景内眨眼 3 次：相位落在 0.03 宽度内视为闭眼 */
function blinkAmount(progress: number): number {
  const phase = (progress * 3) % 1;
  return phase < 0.035 ? 1 : 0;
}

/** 说话口型开合（0..1），场景内 8 个开合循环 */
function mouthOpen(progress: number): number {
  return Math.max(0, Math.sin(progress * Math.PI * 8));
}

/** 头部轻摆幅度（像素，随 height 缩放由调用方处理） */
function headBob(progress: number): number {
  return Math.sin(progress * Math.PI * 2) * 0.5 + Math.sin(progress * Math.PI * 6) * 0.5;
}

/* ------------------------------------------------------------------ */
/* 数字人绘制                                                           */
/* ------------------------------------------------------------------ */

function drawAvatarFigure(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  avatar: AvatarSpec,
  progress: number,
  gesture: AvatarGesture,
  entrance: number,
) {
  const bob = headBob(progress) * width * 0.006;
  const blink = blinkAmount(progress);
  const mouth = mouthOpen(progress);

  // 半身像锚点：头部中心
  const headR = width * 0.145;
  const cx = width * 0.5;
  const headCY = height * 0.30 + bob;
  const shoulderY = headCY + headR * 1.35;

  ctx.save();
  // 整体入场（上浮淡入由调用方 entrance 控制）
  ctx.globalAlpha = entrance;

  /* ---------- 身体（半身西装/连衣裙） ---------- */
  const bodyW = headR * 2.6;
  const bodyTop = shoulderY;
  const bodyBottom = height * 0.72;

  // 躯干（梯形圆角近似）
  ctx.fillStyle = avatar.outfit;
  ctx.beginPath();
  ctx.moveTo(cx - bodyW * 0.28, bodyTop);
  ctx.quadraticCurveTo(cx - bodyW * 0.55, bodyTop + (bodyBottom - bodyTop) * 0.35, cx - bodyW * 0.52, bodyBottom);
  ctx.lineTo(cx + bodyW * 0.52, bodyBottom);
  ctx.quadraticCurveTo(cx + bodyW * 0.55, bodyTop + (bodyBottom - bodyTop) * 0.35, cx + bodyW * 0.28, bodyTop);
  ctx.closePath();
  ctx.fill();

  // 领口 / 点缀
  ctx.fillStyle = avatar.outfitAccent;
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.42, bodyTop + 2);
  ctx.lineTo(cx, bodyTop + headR * 0.85);
  ctx.lineTo(cx + headR * 0.42, bodyTop + 2);
  ctx.closePath();
  ctx.fill();
  if (avatar.gender === 'male') {
    // 领带
    ctx.fillStyle = avatar.outfitAccent;
    ctx.beginPath();
    ctx.moveTo(cx, bodyTop + headR * 0.2);
    ctx.lineTo(cx - headR * 0.1, bodyTop + headR * 0.95);
    ctx.lineTo(cx + headR * 0.1, bodyTop + headR * 0.95);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------- 手臂（依手势） ---------- */
  const armW = headR * 0.34;
  const drawArm = (
    side: -1 | 1,
    angleDeg: number,
    fromY: number,
    length: number,
  ) => {
    const sx = cx + side * bodyW * 0.34;
    const sy = fromY;
    const rad = (angleDeg * Math.PI) / 180;
    const ex = sx + Math.sin(rad) * side * -1 * length;
    const ey = sy + Math.cos(rad) * length;
    ctx.strokeStyle = avatar.outfit;
    ctx.lineWidth = armW;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // 手（肤色圆）
    ctx.fillStyle = avatar.skin;
    ctx.beginPath();
    ctx.arc(ex, ey, armW * 0.62, 0, Math.PI * 2);
    ctx.fill();
  };

  const gestureT = easeOutCubic(stagger(progress, 0.1, 0.35));
  if (gesture === 'wave') {
    // 左臂自然下垂，右臂举起挥动
    drawArm(-1, 12, shoulderY + headR * 0.3, headR * 2.1);
    const waveAngle = 135 + Math.sin(progress * Math.PI * 6) * 14 * gestureT;
    drawArm(1, waveAngle, shoulderY + headR * 0.3, headR * 2.0);
  } else if (gesture === 'point') {
    // 右臂指向商品（右上）
    drawArm(-1, 12, shoulderY + headR * 0.3, headR * 2.1);
    drawArm(1, 50 + 20 * gestureT, shoulderY + headR * 0.25, headR * 2.15);
  } else if (gesture === 'present') {
    // 双手掌向上摊开
    drawArm(-1, 58 + 14 * gestureT, shoulderY + headR * 0.3, headR * 2.0);
    drawArm(1, 58 + 14 * gestureT, shoulderY + headR * 0.3, headR * 2.0);
  } else {
    // ok: 右手竖大拇指（贴近胸口），左臂下垂
    drawArm(-1, 12, shoulderY + headR * 0.3, headR * 2.1);
    drawArm(1, 24, shoulderY + headR * 0.3, headR * 1.35);
  }

  /* ---------- 颈部 ---------- */
  ctx.fillStyle = avatar.skinShadow;
  ctx.beginPath();
  ctx.roundRect(cx - headR * 0.3, headCY + headR * 0.6, headR * 0.6, headR * 0.85, headR * 0.18);
  ctx.fill();

  /* ---------- 头部 ---------- */
  // 后层头发（长发/丸子头在头型之下绘制）
  const drawHairBack = () => {
    ctx.fillStyle = avatar.hair;
    if (avatar.hairStyle === 'long') {
      ctx.beginPath();
      ctx.ellipse(cx, headCY + headR * 0.1, headR * 1.18, headR * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // 两侧垂发
      ctx.beginPath();
      ctx.roundRect(cx - headR * 1.24, headCY, headR * 0.42, headR * 2.6, headR * 0.2);
      ctx.roundRect(cx + headR * 0.82, headCY, headR * 0.42, headR * 2.6, headR * 0.2);
      ctx.fill();
    } else if (avatar.hairStyle === 'bob') {
      ctx.beginPath();
      ctx.ellipse(cx, headCY + headR * 0.12, headR * 1.14, headR * 1.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(cx - headR * 1.22, headCY - headR * 0.1, headR * 0.4, headR * 1.7, headR * 0.2);
      ctx.roundRect(cx + headR * 0.82, headCY - headR * 0.1, headR * 0.4, headR * 1.7, headR * 0.2);
      ctx.fill();
    } else if (avatar.hairStyle === 'bun') {
      // 丸子头
      ctx.beginPath();
      ctx.arc(cx, headCY - headR * 1.12, headR * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, headCY + headR * 0.08, headR * 1.1, headR * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // short（男）：仅头顶层，无后发
      ctx.beginPath();
      ctx.ellipse(cx, headCY, headR * 1.04, headR * 1.04, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  drawHairBack();

  // 脸
  ctx.fillStyle = avatar.skin;
  ctx.beginPath();
  ctx.ellipse(cx, headCY + headR * 0.06, headR * 0.94, headR * 1.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // 耳朵
  ctx.beginPath();
  ctx.arc(cx - headR * 0.94, headCY + headR * 0.1, headR * 0.18, 0, Math.PI * 2);
  ctx.arc(cx + headR * 0.94, headCY + headR * 0.1, headR * 0.18, 0, Math.PI * 2);
  ctx.fill();

  // 前层头发（刘海）
  ctx.fillStyle = avatar.hair;
  ctx.beginPath();
  if (avatar.hairStyle === 'short') {
    // 男式短发：覆盖上半头
    ctx.ellipse(cx, headCY - headR * 0.22, headR * 1.0, headR * 0.82, 0, Math.PI, 0);
  } else {
    // 女式刘海：中间留缝
    ctx.ellipse(cx, headCY - headR * 0.18, headR * 1.02, headR * 0.86, 0, Math.PI, 0);
  }
  ctx.fill();

  /* ---------- 五官 ---------- */
  const eyeY = headCY + headR * 0.12;
  const eyeDX = headR * 0.38;
  const eyeR = headR * 0.105;

  for (const side of [-1, 1] as const) {
    if (blink > 0.5) {
      // 闭眼：弧线
      ctx.strokeStyle = '#4a3728';
      ctx.lineWidth = headR * 0.05;
      ctx.beginPath();
      ctx.arc(cx + side * eyeDX, eyeY, eyeR, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    } else {
      // 睁眼：白底 + 瞳孔
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx + side * eyeDX, eyeY, eyeR, eyeR * 1.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3b2f2a';
      ctx.beginPath();
      ctx.arc(cx + side * eyeDX, eyeY + eyeR * 0.08, eyeR * 0.52, 0, Math.PI * 2);
      ctx.fill();
      // 高光
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx + side * eyeDX - eyeR * 0.18, eyeY - eyeR * 0.18, eyeR * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 眉毛（说话时轻微上抬）
  const browLift = mouth * headR * 0.03;
  ctx.strokeStyle = avatar.hair;
  ctx.lineWidth = headR * 0.07;
  ctx.lineCap = 'round';
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + side * eyeDX - eyeR * 0.9, eyeY - headR * 0.26 - browLift);
    ctx.quadraticCurveTo(
      cx + side * eyeDX,
      eyeY - headR * 0.36 - browLift,
      cx + side * eyeDX + eyeR * 0.9,
      eyeY - headR * 0.24 - browLift,
    );
    ctx.stroke();
  }

  // 鼻子（简笔）
  ctx.strokeStyle = avatar.skinShadow;
  ctx.lineWidth = headR * 0.05;
  ctx.beginPath();
  ctx.moveTo(cx, eyeY + headR * 0.12);
  ctx.quadraticCurveTo(cx + headR * 0.06, eyeY + headR * 0.34, cx - headR * 0.02, eyeY + headR * 0.38);
  ctx.stroke();

  // 嘴（说话开合）
  const mouthCY = eyeY + headR * 0.56;
  const openH = headR * (0.06 + mouth * 0.16);
  ctx.fillStyle = '#b4543f';
  ctx.beginPath();
  ctx.ellipse(cx, mouthCY, headR * 0.26, openH, 0, 0, Math.PI * 2);
  ctx.fill();
  // 微笑弧
  ctx.strokeStyle = '#9c4433';
  ctx.lineWidth = headR * 0.045;
  ctx.beginPath();
  ctx.arc(cx, mouthCY - openH * 0.4, headR * 0.34, Math.PI * 0.18, Math.PI * 0.82);
  ctx.stroke();

  // 腮红（女性更明显）
  if (avatar.gender === 'female') {
    ctx.fillStyle = withAlpha('#f472b6', 0.25);
    ctx.beginPath();
    ctx.ellipse(cx - headR * 0.62, mouthCY - headR * 0.1, headR * 0.16, headR * 0.1, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + headR * 0.62, mouthCY - headR * 0.1, headR * 0.16, headR * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 完整场景绘制                                                         */
/* ------------------------------------------------------------------ */

export function drawDigitalHumanScene(
  dc: DrawContext,
  props: DigitalHumanSceneProps,
) {
  const { ctx, progress, width, height } = dc;
  const th = resolveSceneTheme(props.theme);
  const gesture = props.gesture ?? 'point';
  const entrance = easeOutCubic(stagger(progress, 0, 0.25));

  /* ---------- 背景：主题渐变 + 柔光圆 ---------- */
  fillGradient(ctx, width, height, [
    { offset: 0, color: withAlpha(th.primaryLight, 0.28) },
    { offset: 0.45, color: th.bgCard },
    { offset: 1, color: th.bgDark },
  ], 'diagonal');

  // 背景装饰圆（呼吸感）
  const orbP = 0.5 + 0.5 * Math.sin(progress * Math.PI * 2);
  ctx.globalAlpha = 0.10 + orbP * 0.06;
  ctx.fillStyle = th.primary;
  ctx.beginPath();
  ctx.arc(width * 0.15, height * 0.16, width * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.88, height * 0.42, width * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  /* ---------- 顶部徽章 ---------- */
  const badgeT = easeOutCubic(stagger(progress, 0.05, 0.25));
  if (props.badge) {
    ctx.globalAlpha = badgeT;
    setFont(ctx, { size: width * 0.042, weight: 700 });
    const text = props.badge.toUpperCase();
    const tw = ctx.measureText(text).width;
    const padX = width * 0.045;
    const bw = tw + padX * 2;
    const bh = width * 0.085;
    const bx = (width - bw) / 2;
    const by = height * 0.055;
    // LIVE 小红点
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(bx - width * 0.028, by + bh / 2, width * 0.012, 0, Math.PI * 2);
    ctx.fill();
    fillRoundRect(ctx, bx, by, bw, bh, bh / 2, withAlpha('#000000', 0.45));
    ctx.strokeStyle = withAlpha(th.primaryLight, 0.8);
    ctx.lineWidth = Math.max(2, width * 0.004);
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw / 2, by + bh / 2);
    ctx.globalAlpha = 1;
  }

  /* ---------- 数字人 ---------- */
  drawAvatarFigure(ctx, width, height, props.avatar, progress, gesture, entrance);

  /* ---------- 名牌（名字 + 国旗徽章） ---------- */
  const nameT = easeOutCubic(stagger(progress, 0.15, 0.3));
  ctx.globalAlpha = nameT;
  const cardW = width * 0.34;
  const cardH = width * 0.1;
  const cardX = (width - cardW) / 2;
  const cardY = height * 0.545;
  fillRoundRect(ctx, cardX, cardY, cardW, cardH, cardH / 2, withAlpha('#000000', 0.4));
  ctx.strokeStyle = withAlpha(th.primaryLight, 0.6);
  ctx.lineWidth = Math.max(2, width * 0.003);
  roundRect(ctx, cardX, cardY, cardW, cardH, cardH / 2);
  ctx.stroke();
  // 国旗
  setFont(ctx, { size: cardH * 0.5 });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(props.avatar.flag, cardX + cardW * 0.2, cardY + cardH / 2);
  // 名字
  setFont(ctx, { size: cardH * 0.42, weight: 700 });
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(props.avatar.name, cardX + cardW * 0.36, cardY + cardH / 2);
  // 身份小标签
  setFont(ctx, { size: cardH * 0.26, weight: 500 });
  ctx.fillStyle = withAlpha('#ffffff', 0.7);
  ctx.fillText(
    `${props.avatar.countryCode} · HOST`,
    cardX + cardW * 0.36,
    cardY + cardH * 0.76,
  );
  ctx.globalAlpha = 1;

  /* ---------- 商品卡片（右下） ---------- */
  const prodT = easeOutCubic(stagger(progress, 0.2, 0.35));
  const img = getCachedImage(props.productImage);
  const pcW = width * 0.30;
  const pcH = width * 0.36;
  const pcX = width * 0.645;
  const pcY = height * 0.33;

  ctx.save();
  ctx.globalAlpha = prodT;
  // 白色卡片
  fillRoundRect(ctx, pcX, pcY, pcW, pcH, width * 0.03, '#ffffff');
  ctx.save();
  roundRect(ctx, pcX, pcY, pcW, pcH, width * 0.03);
  ctx.clip();
  if (img) {
    drawImageContain(ctx, img, pcX, pcY, pcW, pcH * 0.82);
  } else {
    const g = ctx.createLinearGradient(pcX, pcY, pcX + pcW, pcY + pcH);
    g.addColorStop(0, withAlpha(th.primary, 0.35));
    g.addColorStop(1, withAlpha(th.primary, 0.1));
    ctx.fillStyle = g;
    ctx.fillRect(pcX, pcY, pcW, pcH * 0.82);
    setFont(ctx, { size: pcW * 0.4 });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🛍️', pcX + pcW / 2, pcY + pcH * 0.41);
  }
  ctx.restore();
  // 商品名（卡片底部一行，超长省略）
  setFont(ctx, { size: pcW * 0.09, weight: 600 });
  ctx.fillStyle = '#1f2937';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let nameLine = props.productName;
  while (ctx.measureText(nameLine).width > pcW * 0.9 && nameLine.length > 4) {
    nameLine = nameLine.slice(0, -2);
  }
  if (nameLine !== props.productName) nameLine = nameLine + '…';
  ctx.fillText(nameLine || 'Product', pcX + pcW / 2, pcY + pcH * 0.9);

  // 价格徽章（卡片左上角悬浮）
  if (props.price) {
    const badgeH = width * 0.07;
    setFont(ctx, { size: badgeH * 0.5, weight: 800 });
    const pText = props.price;
    const pW = ctx.measureText(pText).width + badgeH * 0.8;
    const pX = pcX - width * 0.012;
    const pY = pcY + pcH - badgeH * 0.5;
    fillRoundRect(ctx, pX, pY, pW, badgeH, badgeH / 2, th.primary);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pText, pX + pW / 2, pY + badgeH / 2);
    // 划线价
    if (props.originalPrice) {
      setFont(ctx, { size: badgeH * 0.38, weight: 400 });
      const opW = ctx.measureText(props.originalPrice).width;
      const opX = pX + pW + width * 0.015;
      const opY = pY + badgeH / 2;
      fillRoundRect(ctx, opX, pY, opW + badgeH * 0.4, badgeH, badgeH / 2, withAlpha('#000000', 0.45));
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 2;
      ctx.fillStyle = '#e5e7eb';
      ctx.textAlign = 'center';
      ctx.fillText(props.originalPrice, opX + (opW + badgeH * 0.4) / 2, opY);
      ctx.beginPath();
      ctx.moveTo(opX + badgeH * 0.15, opY);
      ctx.lineTo(opX + opW + badgeH * 0.25, opY);
      ctx.stroke();
    }
  }
  ctx.restore();

  /* ---------- 底部字幕 ---------- */
  const subT = easeOutCubic(stagger(progress, 0.08, 0.3));
  ctx.globalAlpha = subT;
  const subFont = width * 0.052;
  setFont(ctx, { size: subFont, weight: 600 });
  const subLines = wrapText(ctx, props.subtitle, width * 0.82).slice(0, 2);
  const lineH = subFont * 1.4;
  const subH = subLines.length * lineH + width * 0.07;
  const subW = width * 0.88;
  const subX = (width - subW) / 2;
  const subY = height * 0.795;
  fillRoundRect(ctx, subX, subY, subW, subH, width * 0.03, withAlpha('#000000', 0.55));
  ctx.strokeStyle = withAlpha(th.primaryLight, 0.35);
  ctx.lineWidth = Math.max(2, width * 0.003);
  roundRect(ctx, subX, subY, subW, subH, width * 0.03);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  subLines.forEach((line, i) => {
    ctx.fillText(line, width / 2, subY + width * 0.035 + i * lineH);
  });
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ */
/* React 预览组件（rAF 循环调用同一 draw，保证预览 = 导出）               */
/* ------------------------------------------------------------------ */

export function DigitalHumanScene(props: DigitalHumanSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // props 存 ref：避免每次渲染重建 rAF 循环，同时保证 draw 始终拿到最新值
  const propsRef = useRef(props);
  propsRef.current = props;
  // 场景内容变化的序列化 key（字幕/商品/形象/主题任一变化时重置动画相位）
  const sceneKey = `${props.avatar.id}|${props.subtitle}|${props.badge ?? ''}|${props.productName}|${props.price ?? ''}|${props.productImage ?? ''}|${props.gesture ?? ''}|${props.theme?.id ?? ''}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 360;
    const H = 640;
    canvas.width = W;
    canvas.height = H;

    let raf = 0;
    let cancelled = false;
    const start = performance.now();
    const loop = (now: number) => {
      if (cancelled) return;
      // 循环播放（每 8s 一个周期，仅预览用）
      const progress = ((now - start) / 8000) % 1;
      ctx.clearRect(0, 0, W, H);
      try {
        drawDigitalHumanScene(
          { ctx, progress, width: W, height: H },
          propsRef.current,
        );
      } catch {
        // 预览绘制失败时静默降级
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [sceneKey]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full object-contain"
      aria-label="Digital human scene preview"
    />
  );
}

/* ------------------------------------------------------------------ */
/* 头像缩略图（形象选择器用，绘制头部特写）                                */
/* ------------------------------------------------------------------ */

export function drawAvatarThumb(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  avatar: AvatarSpec,
) {
  const headR = width * 0.26;
  const cx = width / 2;
  const headCY = height * 0.52;

  // 背景柔光
  const g = ctx.createRadialGradient(cx, headCY, headR * 0.4, cx, headCY, width * 0.7);
  g.addColorStop(0, withAlpha(avatar.outfit, 0.4));
  g.addColorStop(1, withAlpha(avatar.outfit, 0.08));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  // 肩部
  ctx.fillStyle = avatar.outfit;
  ctx.beginPath();
  ctx.ellipse(cx, height + headR * 0.4, headR * 1.5, headR * 0.95, 0, Math.PI, 0);
  ctx.fill();

  // 颈
  ctx.fillStyle = avatar.skinShadow;
  ctx.beginPath();
  ctx.roundRect(cx - headR * 0.28, headCY + headR * 0.5, headR * 0.56, headR * 0.6, headR * 0.15);
  ctx.fill();

  // 后发
  ctx.fillStyle = avatar.hair;
  if (avatar.hairStyle === 'long' || avatar.hairStyle === 'bob') {
    ctx.beginPath();
    ctx.ellipse(cx, headCY + headR * 0.05, headR * 1.12, headR * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (avatar.hairStyle === 'bun') {
    ctx.beginPath();
    ctx.arc(cx, headCY - headR * 1.05, headR * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, headCY, headR * 1.02, headR * 1.02, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(cx, headCY, headR * 1.0, headR * 1.0, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 脸
  ctx.fillStyle = avatar.skin;
  ctx.beginPath();
  ctx.ellipse(cx, headCY + headR * 0.05, headR * 0.9, headR * 1.0, 0, 0, Math.PI * 2);
  ctx.fill();

  // 刘海
  ctx.fillStyle = avatar.hair;
  ctx.beginPath();
  ctx.ellipse(cx, headCY - headR * 0.2, headR * 0.98, headR * 0.84, 0, Math.PI, 0);
  ctx.fill();

  // 眼睛（睁眼微笑）
  for (const side of [-1, 1] as const) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx + side * headR * 0.36, headCY + headR * 0.1, headR * 0.11, headR * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b2f2a';
    ctx.beginPath();
    ctx.arc(cx + side * headR * 0.36, headCY + headR * 0.11, headR * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }
  // 微笑
  ctx.strokeStyle = '#9c4433';
  ctx.lineWidth = headR * 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, headCY + headR * 0.38, headR * 0.28, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();

  // 腮红
  if (avatar.gender === 'female') {
    ctx.fillStyle = withAlpha('#f472b6', 0.3);
    ctx.beginPath();
    ctx.ellipse(cx - headR * 0.6, headCY + headR * 0.32, headR * 0.13, headR * 0.09, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + headR * 0.6, headCY + headR * 0.32, headR * 0.13, headR * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 形象选择器缩略图组件 */
export function AvatarThumb({ avatar, size = 72 }: { avatar: AvatarSpec; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    drawAvatarThumb(ctx, size, size, avatar);
  }, [avatar, size]);
  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size }}
      className="rounded-full"
      aria-label={`${avatar.name} avatar`}
    />
  );
}
