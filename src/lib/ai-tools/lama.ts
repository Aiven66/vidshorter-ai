/**
 * LaMa (Large Mask Inpainting) — AI 图片去水印核心算法
 *
 * 质量策略:
 * 1. 只对水印区域周围的"窗口"跑 LaMa（窗口 ≤768px），修复结果保持原分辨率不缩水
 * 2. 掩码先膨胀 4px，保证水印边缘完全覆盖
 * 3. 输出经高斯羽化的 soft mask 混合回原图，非水印区域 100% 保持原样
 * 4. 输入尺寸 pad 到 8 的倍数，适配 FFC 网络结构
 */

import { getOrtSession, type ModelProgress } from './model-loader';
import {
  createCanvas,
  dilateMask,
  maskBoundingBox,
} from './image-utils';

const LAMA_REPO = 'Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx';

/** 处理窗口约束 */
const MIN_WINDOW = 256;
const MAX_WINDOW = 768;
const CONTEXT_RATIO = 0.45; // bbox 每侧额外上下文
const MASK_DILATE_PX = 4;
const FEATHER_PX = 2;

interface OrtTensor {
  data: Float32Array;
  dims: number[];
}

type OrtTensorCtor = new (
  type: 'float32',
  data: Float32Array,
  dims: number[]
) => OrtTensor;

export interface InpaintResult {
  canvas: HTMLCanvasElement;
  windowInfo: { x: number; y: number; w: number; h: number };
}

/**
 * 对 imageCanvas 上 maskCanvas 标记（白色）的水印区域执行 LaMa 修复。
 * 返回全新 canvas，原图不被修改。
 */
export async function lamaInpaint(
  imageCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  onProgress?: ModelProgress
): Promise<InpaintResult> {
  const width = imageCanvas.width;
  const height = imageCanvas.height;

  const imgCtx = imageCanvas.getContext('2d', { willReadFrequently: true })!;
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;

  const imageData = imgCtx.getImageData(0, 0, width, height);
  const maskData = maskCtx.getImageData(0, 0, width, height);

  const bbox = maskBoundingBox(maskData.data, width, height);
  if (!bbox) {
    throw new Error('EMPTY_MASK');
  }

  // 1. 计算处理窗口（bbox + 上下文，限制在 [MIN_WINDOW, MAX_WINDOW]）
  const padX = Math.max(bbox.w * CONTEXT_RATIO, 32);
  const padY = Math.max(bbox.h * CONTEXT_RATIO, 32);
  let wx0 = Math.max(0, Math.round(bbox.x - padX));
  let wy0 = Math.max(0, Math.round(bbox.y - padY));
  let wx1 = Math.min(width, Math.round(bbox.x + bbox.w + padX));
  let wy1 = Math.min(height, Math.round(bbox.y + bbox.h + padY));

  let winW = wx1 - wx0;
  let winH = wy1 - wy0;

  // 小窗口扩到 MIN_WINDOW（提供足够上下文）
  if (winW < MIN_WINDOW || winH < MIN_WINDOW) {
    const needX = Math.max(0, MIN_WINDOW - winW);
    const needY = Math.max(0, MIN_WINDOW - winH);
    wx0 = Math.max(0, wx0 - Math.floor(needX / 2));
    wy0 = Math.max(0, wy0 - Math.floor(needY / 2));
    wx1 = Math.min(width, wx1 + needX - (wx0 < 0 ? 0 : Math.floor(needX / 2)));
    wy1 = Math.min(height, wy1 + needY - (wy0 < 0 ? 0 : Math.floor(needY / 2)));
    wx0 = Math.max(0, wx1 - MIN_WINDOW >= 0 ? Math.min(wx0, width - MIN_WINDOW) : wx0);
    wy0 = Math.max(0, wy1 - MIN_WINDOW >= 0 ? Math.min(wy0, height - MIN_WINDOW) : wy0);
    winW = Math.min(width, wx1) - Math.max(0, wx0);
    winH = Math.min(height, wy1) - Math.max(0, wy0);
  }

  // 大窗口整体缩放到 MAX_WINDOW 内
  let scale = 1;
  if (winW > MAX_WINDOW || winH > MAX_WINDOW) {
    scale = MAX_WINDOW / Math.max(winW, winH);
  }
  const runW = Math.round(winW * scale);
  const runH = Math.round(winH * scale);

  // 2. 提取窗口内容（drawImage 缩放插值质量高于逐像素采样）
  const winImgCanvas = createCanvas(runW, runH);
  const winImgCtx = winImgCanvas.getContext('2d', { willReadFrequently: true })!;
  winImgCtx.imageSmoothingEnabled = true;
  winImgCtx.imageSmoothingQuality = 'high';
  winImgCtx.drawImage(imageCanvas, wx0, wy0, winW, winH, 0, 0, runW, runH);

  const winMaskCanvas = createCanvas(runW, runH);
  const winMaskCtx = winMaskCanvas.getContext('2d', { willReadFrequently: true })!;
  winMaskCtx.imageSmoothingEnabled = true;
  winMaskCtx.drawImage(maskCanvas, wx0, wy0, winW, winH, 0, 0, runW, runH);
  const winMaskData = winMaskCtx.getImageData(0, 0, runW, runH).data;

  // 3. 掩码膨胀 + pad 到 8 的倍数
  const binaryMask = dilateMask(winMaskData, runW, runH, MASK_DILATE_PX);
  const paddedW = Math.ceil(runW / 8) * 8;
  const paddedH = Math.ceil(runH / 8) * 8;

  const imageInput = new Float32Array(3 * paddedW * paddedH);
  const maskInput = new Float32Array(paddedW * paddedH);
  const winPixels = winImgCtx.getImageData(0, 0, runW, runH).data;

  for (let y = 0; y < runH; y++) {
    for (let x = 0; x < runW; x++) {
      const srcIdx = y * runW + x;
      const dstIdx = y * paddedW + x;
      imageInput[dstIdx] = winPixels[srcIdx * 4] / 255;
      imageInput[paddedW * paddedH + dstIdx] = winPixels[srcIdx * 4 + 1] / 255;
      imageInput[2 * paddedW * paddedH + dstIdx] = winPixels[srcIdx * 4 + 2] / 255;
      maskInput[dstIdx] = binaryMask[srcIdx];
    }
  }

  // 4. ONNX 推理
  const session = await getOrtSession('lama', LAMA_REPO, onProgress);
  const ort = await import('onnxruntime-web');
  const TensorCtor = ort.Tensor as unknown as OrtTensorCtor;

  const imageTensor = new TensorCtor('float32', imageInput, [1, 3, paddedH, paddedW]);
  const maskTensor = new TensorCtor('float32', maskInput, [1, 1, paddedH, paddedW]);

  // 输入名动态映射：优先语义名（image/mask），否则按声明顺序；shape 不匹配时交换重试
  let output: OrtTensor | undefined;
  try {
    const feeds: Record<string, OrtTensor> = {};
    if (session.inputNames.includes('image') && session.inputNames.includes('mask')) {
      feeds.image = imageTensor;
      feeds.mask = maskTensor;
    } else {
      feeds[session.inputNames[0]] = imageTensor;
      feeds[session.inputNames[1]] = maskTensor;
    }
    const results = await session.run(feeds as never);
    output = (results[session.outputNames[0]] ?? Object.values(results)[0]) as OrtTensor;
  } catch {
    // 声明顺序与预期相反时交换
    const feeds: Record<string, OrtTensor> = {
      [session.inputNames[0]]: maskTensor,
      [session.inputNames[1]]: imageTensor,
    };
    const results = await session.run(feeds as never);
    output = (results[session.outputNames[0]] ?? Object.values(results)[0]) as OrtTensor;
  }

  // 5. soft mask（高斯羽化）
  const softCanvas = createCanvas(runW, runH);
  const softCtx = softCanvas.getContext('2d', { willReadFrequently: true })!;
  softCtx.filter = `blur(${FEATHER_PX}px)`;
  softCtx.drawImage(winMaskCanvas, 0, 0);
  const softData = softCtx.getImageData(0, 0, runW, runH).data;

  // 6. 输出放大回窗口原尺寸（若缩放过）
  const resultCanvas = createCanvas(runW, runH);
  const resultCtx = resultCanvas.getContext('2d', { willReadFrequently: true })!;
  resultCtx.imageSmoothingEnabled = true;
  resultCtx.imageSmoothingQuality = 'high';
  resultCtx.drawImage(winImgCanvas, 0, 0);

  const outData = resultCtx.getImageData(0, 0, runW, runH);
  const outPixels = outData.data;
  const plane = paddedW * paddedH;

  for (let y = 0; y < runH; y++) {
    for (let x = 0; x < runW; x++) {
      const idx = y * runW + x;
      const alpha = softData[idx * 4] / 255; // 0..1 羽化权重
      if (alpha <= 0.001) continue;

      const srcIdx = y * paddedW + x;
      const r = Math.min(1, Math.max(0, output.data[srcIdx])) * 255;
      const g = Math.min(1, Math.max(0, output.data[plane + srcIdx])) * 255;
      const b = Math.min(1, Math.max(0, output.data[2 * plane + srcIdx])) * 255;

      // 掩码区域（alpha≈1）完全用修复结果；羽化边缘线性混合
      outPixels[idx * 4] = Math.round(outPixels[idx * 4] * (1 - alpha) + r * alpha);
      outPixels[idx * 4 + 1] = Math.round(outPixels[idx * 4 + 1] * (1 - alpha) + g * alpha);
      outPixels[idx * 4 + 2] = Math.round(outPixels[idx * 4 + 2] * (1 - alpha) + b * alpha);
    }
  }
  resultCtx.putImageData(outData, 0, 0);

  // 7. 贴回原图
  const finalCanvas = createCanvas(width, height);
  const finalCtx = finalCanvas.getContext('2d')!;
  finalCtx.drawImage(imageCanvas, 0, 0);
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(resultCanvas, 0, 0, runW, runH, wx0, wy0, winW, winH);

  return {
    canvas: finalCanvas,
    windowInfo: { x: wx0, y: wy0, w: winW, h: winH },
  };
}
