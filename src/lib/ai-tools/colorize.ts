/**
 * 黑白照片 AI 上色 — 基于 colorful_image_colorization (Zhang et al., CVPR 2017)
 *
 * 质量策略:
 * 1. 模型在 256x256 上预测 chrominance (Lab 的 ab 通道)
 * 2. ab 通道高质量放大回原分辨率，L 亮度通道直接取自原图
 *    → 输出保留原图全部细节，只有色彩是 AI 生成的（色彩本就是低频信息）
 * 3. 输出 ab 幅值自适应检测（兼容 ±1 / ±128 两种模型输出约定）
 */

import { getOrtSession, type ModelProgress } from './model-loader';
import {
  createCanvas,
  fitSize,
  labToRgb,
  rgbToLab,
  resizeFloatChannel,
} from './image-utils';

export const COLORIZE_REPO = 'Xenova/colorful_image_colorization/resolve/main/onnx/model.onnx';
const MODEL_INPUT_SIZE = 256;
const MAX_OUTPUT_SIDE = 2560;

interface OrtTensor {
  data: Float32Array;
  dims: number[];
}

/** 黑白照片上色，返回彩色 canvas */
export async function colorizeImage(
  sourceCanvas: HTMLCanvasElement,
  onProgress?: ModelProgress
): Promise<HTMLCanvasElement> {
  // 0. 限制输出尺寸（超大图缩放，避免逐像素转换耗时过长）
  const { width: outW, height: outH } = fitSize(
    sourceCanvas.width,
    sourceCanvas.height,
    MAX_OUTPUT_SIDE
  );

  const workCanvas = createCanvas(outW, outH);
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true })!;
  workCtx.imageSmoothingEnabled = true;
  workCtx.imageSmoothingQuality = 'high';
  workCtx.drawImage(sourceCanvas, 0, 0, outW, outH);
  const outPixels = workCtx.getImageData(0, 0, outW, outH);
  const pixels = outPixels.data;

  // 1. 全分辨率 L 通道 + 缩小图送模型
  const L = new Float32Array(outW * outH); // Lab L ∈ [0, 100]
  for (let i = 0; i < outW * outH; i++) {
    const [labL] = rgbToLab(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]);
    L[i] = labL;
  }

  const smallCanvas = createCanvas(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const smallCtx = smallCanvas.getContext('2d', { willReadFrequently: true })!;
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.imageSmoothingQuality = 'high';
  smallCtx.drawImage(workCanvas, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const smallPixels = smallCtx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE).data;

  const input = new Float32Array(MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
  for (let i = 0; i < input.length; i++) {
    const [labL] = rgbToLab(
      smallPixels[i * 4],
      smallPixels[i * 4 + 1],
      smallPixels[i * 4 + 2]
    );
    input[i] = labL / 100; // 模型期望 [0, 1]
  }

  // 2. ONNX 推理
  const session = await getOrtSession('colorize', COLORIZE_REPO, onProgress);
  const ort = await import('onnxruntime-web');
  const TensorCtor = ort.Tensor as unknown as new (
    type: 'float32',
    data: Float32Array,
    dims: number[]
  ) => OrtTensor;

  const inputTensor = new TensorCtor('float32', input, [1, 1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
  const feeds: Record<string, OrtTensor> = {};
  if (session.inputNames.includes('input')) {
    feeds.input = inputTensor;
  } else {
    feeds[session.inputNames[0]] = inputTensor;
  }
  const results = await session.run(feeds as never);
  const output = (results[session.outputNames[0]] ?? Object.values(results)[0]) as OrtTensor;

  const ab = output.data; // [1, 2, 256, 256]，平面布局
  const plane = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;

  // 3. 输出幅值自适应：±1 约定 ×128；已是 ±128 约定则直接用
  let maxAbs = 0;
  const sampleStep = Math.max(1, Math.floor(plane / 4096));
  for (let i = 0; i < plane; i += sampleStep) {
    const v = Math.abs(ab[i]);
    if (v > maxAbs) maxAbs = v;
    const v2 = Math.abs(ab[plane + i]);
    if (v2 > maxAbs) maxAbs = v2;
  }
  const abRange = maxAbs <= 1.5 ? 1 : 128;

  // 4. ab 通道分离并放大回原分辨率
  const aSmall = new Float32Array(plane);
  const bSmall = new Float32Array(plane);
  for (let i = 0; i < plane; i++) {
    aSmall[i] = ab[i] * abRange;
    bSmall[i] = ab[plane + i] * abRange;
  }
  const aFull = resizeFloatChannel(aSmall, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, outW, outH, 128);
  const bFull = resizeFloatChannel(bSmall, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, outW, outH, 128);

  // 5. Lab → RGB 合成
  for (let i = 0; i < outW * outH; i++) {
    const [r, g, b] = labToRgb(L[i], aFull[i], bFull[i]);
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    // alpha 保持不变
  }
  workCtx.putImageData(outPixels, 0, 0);
  return workCanvas;
}
