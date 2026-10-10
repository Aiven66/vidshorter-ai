/**
 * 人脸检测（YuNet / ONNX）—— 竖屏智能追焦的「主体定位」信号源。
 *
 * 为什么需要它：reframe.ts 原先用「肤色掩码 + 边缘能量」启发式定位主体，
 * 对暖色背景（肤色墙面、木质家具、夕阳）容易跑偏，而 UI 已对外承诺
 * 「9:16 智能主体居中 / 人脸追焦」。这里用 OpenCV 官方 YuNet 人脸检测
 * （232KB，公开 CDN 直链）给出**真实人脸**位置，替代「像皮肤的区域」的猜测。
 *
 * ⚠️ 与 ai-tools/inference.ts 的会话缓存刻意隔离：那个缓存是「单会话驻留、
 * 加载新模型前先释放旧会话」，目的是给 lama(208MB)/swin2sr 等大模型省内存。
 * 若把 face 会话塞进去，一次追焦就会驱逐掉 lama 会话，导致 AI 工具箱下次
 * 请求重新下载 200MB+。因此本模块自持一个极小会话，不参与那套驱逐。
 *
 * ⚠️ 原生绑定延迟加载：onnxruntime-node 是原生模块，静态 import 会让
 * /api/cut-clip 冷启动就依赖它（绑定缺失/平台不匹配时整条导出链路崩）。
 * 这里只在真正要推理时 `await import()`，任何失败都被 catch 兜住。
 *
 * ⚠️ 安全回落：下载/推理/解析任何一步失败 → 返回 null，由 reframe 回落到
 * 既有启发式。绝不因为「检测器不可用」而中断导出。
 */

import { createWriteStream, existsSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InferenceSession } from 'onnxruntime-node';

/** YuNet 2023mar（opencv_zoo 公开直链；GitHub 会 302 到 media.githubusercontent）。 */
const MODEL_URLS = [
  'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx',
  'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx',
];
const MODEL_FILE = 'face_detection_yunet_2023mar.onnx';
/** 下载后校验字节数，防止半截文件（实测值）。 */
const MODEL_BYTES = 232589;

/** 模型固定输入边长（YuNet ONNX 不接受动态尺寸）。 */
const INPUT_SIZE = 640;
/** 三个特征层级。 */
const STRIDES = [8, 16, 32] as const;
/** 检出分数门槛（score = sqrt(cls * obj)，两者均已 sigmoid）。 */
const SCORE_THRESHOLD = 0.6;
/** 同类框合并 IoU 阈值。 */
const NMS_IOU = 0.3;
/** 主脸最小面积占比：太小说明是远景/背景人群，不足以作为追焦主体。 */
const MIN_AREA_RATIO = 0.004;

/** 加载失败后的重试间隔（避免每一帧都去重新下载）。 */
const RETRY_MS = 10 * 60 * 1000;

/** 单帧人脸检测结果（坐标为归一化比例，与帧分辨率无关）。 */
export interface FaceCenter {
  /** 主脸水平重心，0..1（相对帧宽）。 */
  centerX: number;
  /** 主脸检出置信度，0..1。 */
  confidence: number;
  /** 该帧合并后的人脸数。 */
  count: number;
  /** 主脸面积占整帧比例，0..1。 */
  areaRatio: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

let sessionPromise: Promise<InferenceSession | null> | null = null;
let failedUntil = 0;

/** 取得（或懒加载）推理会话；不可用时返回 null 并进入退避窗口。 */
function acquireSession(): Promise<InferenceSession | null> {
  if (Date.now() < failedUntil) return Promise.resolve(null);
  if (!sessionPromise) {
    sessionPromise = loadSession().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[face-detect] unavailable (falling back to heuristic): ${msg.slice(0, 200)}`);
      failedUntil = Date.now() + RETRY_MS;
      sessionPromise = null; // 退避窗口结束后允许重试
      return null;
    });
  }
  return sessionPromise;
}

async function loadSession(): Promise<InferenceSession> {
  const { InferenceSession: Session } = await import('onnxruntime-node');
  const file = await ensureModel();
  const session = await Session.create(file, {
    graphOptimizationLevel: 'all',
    executionMode: 'sequential',
  });
  // 会话已把模型读入内存，删除临时文件释放 /tmp（本地调试可保留以便复用）。
  if (process.env.AI_KEEP_MODELS !== '1') {
    try {
      unlinkSync(file);
    } catch {
      /* 删除失败不影响功能 */
    }
  }
  return session;
}

/** 下载模型到 /tmp（带主备源与字节校验），返回本地路径。 */
async function ensureModel(): Promise<string> {
  const dest = join(tmpdir(), MODEL_FILE);
  if (existsSync(dest)) return dest;

  let lastError: unknown = null;
  for (const url of MODEL_URLS) {
    try {
      const resp = await fetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': 'clipop-reframe/1.0' },
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
      const tmp = `${dest}.downloading`;
      await pipeline(Readable.fromWeb(resp.body as never), createWriteStream(tmp));
      if (statSync(tmp).size !== MODEL_BYTES) {
        throw new Error(`size mismatch: ${statSync(tmp).size} != ${MODEL_BYTES}`);
      }
      renameSync(tmp, dest);
      return dest;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `face model download failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/**
 * 检测单帧里最显著的人脸（面积最大者）。
 *
 * @param jpeg 抽帧得到的 JPEG 原始字节（内部会拉伸到 640×640，与训练一致）
 * @returns 无人脸 / 主脸过小 / 模型不可用 → null（调用方回落启发式）
 */
export async function detectFaceCenter(jpeg: Buffer): Promise<FaceCenter | null> {
  const session = await acquireSession();
  if (!session) return null;

  try {
    const sharp = (await import('sharp')).default;
    const { Tensor } = await import('onnxruntime-node');

    const { data, info } = await sharp(jpeg)
      .removeAlpha()
      .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const plane = INPUT_SIZE * INPUT_SIZE;
    const ch = info.channels;
    // YuNet 前处理：BGR、0..255、不归一化（与 OpenCV FaceDetectorYN 的 blobFromImage 一致）。
    const f32 = new Float32Array(plane * 3);
    for (let i = 0; i < plane; i++) {
      f32[i] = data[i * ch + 2];
      f32[plane + i] = data[i * ch + 1];
      f32[2 * plane + i] = data[i * ch];
    }

    const out = await session.run({
      input: new Tensor('float32', f32, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    });

    const boxes = nms(decodeBoxes(out as Record<string, { data: Float32Array }>));
    if (boxes.length === 0) return null;

    let main = boxes[0];
    for (const b of boxes) if (b.w * b.h > main.w * main.h) main = b;

    const areaRatio = (main.w * main.h) / plane;
    if (areaRatio < MIN_AREA_RATIO) return null;

    return {
      centerX: (main.x + main.w / 2) / INPUT_SIZE,
      confidence: Math.min(1, Math.max(0, main.score)),
      count: boxes.length,
      areaRatio,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[face-detect] inference failed (non-fatal): ${msg.slice(0, 200)}`);
    return null;
  }
}

/** 解码三个层级的原始输出为候选框（OpenCV FaceDetectorYN 解码公式）。 */
function decodeBoxes(out: Record<string, { data: Float32Array }>): Box[] {
  const boxes: Box[] = [];

  for (const s of STRIDES) {
    const cls = out[`cls_${s}`]?.data;
    const obj = out[`obj_${s}`]?.data;
    const bbox = out[`bbox_${s}`]?.data;
    if (!cls || !obj || !bbox) continue;

    const gw = Math.floor(INPUT_SIZE / s);
    const gh = Math.floor(INPUT_SIZE / s);
    for (let r = 0; r < gh; r++) {
      for (let c = 0; c < gw; c++) {
        const i = r * gw + c;
        const score = Math.sqrt(cls[i] * obj[i]);
        if (!(score >= SCORE_THRESHOLD)) continue;
        const b = i * 4;
        const cx = (c + bbox[b]) * s;
        const cy = (r + bbox[b + 1]) * s;
        const w = Math.exp(bbox[b + 2]) * s;
        const h = Math.exp(bbox[b + 3]) * s;
        boxes.push({ x: cx - w / 2, y: cy - h / 2, w, h, score });
      }
    }
  }
  return boxes;
}

/** 贪心非极大值抑制（按 score 降序）。 */
function nms(boxes: Box[]): Box[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep: Box[] = [];
  for (const box of sorted) {
    if (keep.every((k) => iou(k, box) < NMS_IOU)) keep.push(box);
  }
  return keep;
}

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  return inter / (a.w * a.h + b.w * b.h - inter);
}