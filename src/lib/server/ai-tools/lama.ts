/**
 * LaMa 图片去水印 — 服务端实现
 *
 * 模型: Carve/LaMa-ONNX fp32，固定输入 512x512（image [1,3,512,512] + mask [1,1,512,512]）
 * 策略（与浏览器版一致的窗口法，适配固定输入尺寸）:
 * 1. 掩码 bbox + 上下文 → 处理窗口 [256, 768] px
 * 2. 窗口缩放到 512x512 推理（LaMa 对缩放鲁棒，输出再放大回窗口尺寸）
 * 3. 掩码膨胀 4px + soft mask 羽化混合，非水印区域 100% 原样
 */

import sharp from 'sharp';
import { Tensor } from 'onnxruntime-node';
import { getModelSession } from './inference';
import {
  dilateBinary,
  featherBinary,
  fetchImageRaw,
  maskBBoxSingleChannel,
} from './image-ops';

const MIN_WINDOW = 256;
const MAX_WINDOW = 768;
const CONTEXT_RATIO = 0.45;
const MASK_DILATE_PX = 4;
const FEATHER_PX = 2;
const MODEL_SIZE = 512;

/**
 * 对 imageUrl 上 maskUrl 标记（不透明白色涂抹）的区域执行 LaMa 修复，
 * 返回整图 PNG Buffer（原分辨率）。
 */
export async function lamaInpaintServer(
  imageUrl: string,
  maskUrl: string
): Promise<{ png: Buffer; width: number; height: number; window: { x: number; y: number; w: number; h: number } }> {
  // 1. 并行拉取原图与掩码（掩码与原图同尺寸，前端保证）
  const [image, mask] = await Promise.all([fetchImageRaw(imageUrl), fetchImageRaw(maskUrl)]);
  const { width, height, data: pixels } = image;
  if (mask.width !== width || mask.height !== height) {
    throw new Error('MASK_SIZE_MISMATCH');
  }

  // 2. 掩码 bbox（红通道 > 128；透明区域红通道为 0）
  const maskGray = new Uint8Array(width * height);
  for (let i = 0; i < maskGray.length; i++) {
    maskGray[i] = mask.data[i * 4] > 128 ? 1 : 0;
  }
  const bbox = maskBBoxSingleChannel(maskGray, width, height, 0);
  if (!bbox) throw new Error('EMPTY_MASK');

  // 3. 计算处理窗口
  const padX = Math.max(bbox.w * CONTEXT_RATIO, 32);
  const padY = Math.max(bbox.h * CONTEXT_RATIO, 32);
  let wx0 = Math.max(0, Math.round(bbox.x - padX));
  let wy0 = Math.max(0, Math.round(bbox.y - padY));
  let wx1 = Math.min(width, Math.round(bbox.x + bbox.w + padX));
  let wy1 = Math.min(height, Math.round(bbox.y + bbox.h + padY));

  let winW = wx1 - wx0;
  let winH = wy1 - wy0;

  // 小窗口扩到 MIN_WINDOW
  if (winW < MIN_WINDOW || winH < MIN_WINDOW) {
    const cx = Math.floor((wx0 + wx1) / 2);
    const cy = Math.floor((wy0 + wy1) / 2);
    const half = Math.floor(MIN_WINDOW / 2);
    wx0 = Math.max(0, Math.min(cx - half, width - MIN_WINDOW));
    wy0 = Math.max(0, Math.min(cy - half, height - MIN_WINDOW));
    wx1 = Math.min(width, wx0 + MIN_WINDOW);
    wy1 = Math.min(height, wy0 + MIN_WINDOW);
    winW = wx1 - wx0;
    winH = wy1 - wy0;
  }

  // 大窗口限制在 MAX_WINDOW（随后整体缩放到 512）
  if (winW > MAX_WINDOW || winH > MAX_WINDOW) {
    const scale = MAX_WINDOW / Math.max(winW, winH);
    const newW = Math.round(winW * scale);
    const newH = Math.round(winH * scale);
    wx0 += Math.floor((winW - newW) / 2);
    wy0 += Math.floor((winH - newH) / 2);
    winW = newW;
    winH = newH;
    wx1 = wx0 + winW;
    wy1 = wy0 + winH;
  }

  // 4. 提取窗口 image/mask raw 并缩放到 512x512
  const windowImage = await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length), {
    raw: { width, height, channels: 4 },
  })
    .extract({ left: wx0, top: wy0, width: winW, height: winH })
    .resize(MODEL_SIZE, MODEL_SIZE, { kernel: 'lanczos3', fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();

  const windowMask = await sharp(
    Buffer.from(mask.data.buffer, mask.data.byteOffset, mask.data.length),
    { raw: { width, height, channels: 4 } }
  )
    .extract({ left: wx0, top: wy0, width: winW, height: winH })
    .resize(MODEL_SIZE, MODEL_SIZE, { kernel: 'cubic', fit: 'fill' })
    .extractChannel(0)
    .raw()
    .toBuffer();

  const maskBinary = new Uint8Array(MODEL_SIZE * MODEL_SIZE);
  for (let i = 0; i < maskBinary.length; i++) maskBinary[i] = windowMask[i] > 128 ? 1 : 0;
  const hasMask = maskBinary.some((v) => v === 1);
  if (!hasMask) throw new Error('EMPTY_MASK');

  const dilated = dilateBinary(maskBinary, MODEL_SIZE, MODEL_SIZE, MASK_DILATE_PX);

  // 5. 构建张量（NCHW，/255 归一化）
  const plane = MODEL_SIZE * MODEL_SIZE;
  const imageInput = new Float32Array(3 * plane);
  const maskInput = new Float32Array(plane);
  for (let i = 0; i < plane; i++) {
    imageInput[i] = windowImage[i * 3] / 255;
    imageInput[plane + i] = windowImage[i * 3 + 1] / 255;
    imageInput[2 * plane + i] = windowImage[i * 3 + 2] / 255;
    maskInput[i] = dilated[i];
  }

  // 6. 推理
  const session = await getModelSession('lama');
  const results = await session.run({
    image: new Tensor('float32', imageInput, [1, 3, MODEL_SIZE, MODEL_SIZE]),
    mask: new Tensor('float32', maskInput, [1, 1, MODEL_SIZE, MODEL_SIZE]),
  });
  const output = results[session.outputNames[0]];
  const outData = output.data as Float32Array;
  const outH = output.dims[2] as number;
  const outW = output.dims[3] as number;
  const outPlane = outW * outH;

  // 7. 输出 512x512 → 编码 PNG → 放大回窗口尺寸
  // 注意: 不同 LaMa ONNX 导出的输出尺度不同（0-1 或 0-255），自动检测
  let outMax = 0;
  for (let i = 0; i < outData.length; i++) {
    if (outData[i] > outMax) outMax = outData[i];
  }
  const outScale = outMax > 1.5 ? 1 : 255; // 0-255 尺度直接用；0-1 尺度乘 255
  const inpainted512 = Buffer.alloc(plane * 3);
  for (let i = 0; i < plane; i++) {
    // 模型输出可能带轻微越界，clamp 到 [0,255]
    inpainted512[i * 3] = Math.min(255, Math.max(0, Math.round(outData[i] * outScale)));
    inpainted512[i * 3 + 1] = Math.min(255, Math.max(0, Math.round(outData[outPlane + i] * outScale)));
    inpainted512[i * 3 + 2] = Math.min(255, Math.max(0, Math.round(outData[2 * outPlane + i] * outScale)));
  }
  const inpaintWindow = await sharp(inpainted512, {
    raw: { width: MODEL_SIZE, height: MODEL_SIZE, channels: 3 },
  })
    .resize(winW, winH, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer();

  // 8. soft mask 羽化 + 混合（掩码区完全用修复结果）
  const soft = await featherBinary(dilated, MODEL_SIZE, MODEL_SIZE, FEATHER_PX);
  const softWindow = await resizeSoftMask(soft, winW, winH);

  const blended = Buffer.from(inpaintWindow); // 复制一份做混合基底无关紧要，直接在窗口原图上混
  const windowOriginal = await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length), {
    raw: { width, height, channels: 4 },
  })
    .extract({ left: wx0, top: wy0, width: winW, height: winH })
    .removeAlpha()
    .raw()
    .toBuffer();

  for (let i = 0; i < softWindow.length; i++) {
    const alpha = softWindow[i];
    if (alpha <= 0.002) continue;
    const r = blended[i * 3];
    const g = blended[i * 3 + 1];
    const b = blended[i * 3 + 2];
    blended[i * 3] = Math.round(windowOriginal[i * 3] * (1 - alpha) + r * alpha);
    blended[i * 3 + 1] = Math.round(windowOriginal[i * 3 + 1] * (1 - alpha) + g * alpha);
    blended[i * 3 + 2] = Math.round(windowOriginal[i * 3 + 2] * (1 - alpha) + b * alpha);
  }

  // 9. 贴回全图
  const blendedPng = await sharp(blended, {
    raw: { width: winW, height: winH, channels: 3 },
  })
    .png()
    .toBuffer();

  const finalPng = await sharp(
    Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length),
    { raw: { width, height, channels: 4 } }
  )
    .removeAlpha()
    .composite([{ input: blendedPng, left: wx0, top: wy0 }])
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { png: finalPng, width, height, window: { x: wx0, y: wy0, w: winW, h: winH } };
}

/** soft mask（[0,1] 浮点）缩放到窗口尺寸 */
async function resizeSoftMask(
  soft: Float32Array,
  dstW: number,
  dstH: number
): Promise<Float32Array> {
  const src8 = Buffer.alloc(soft.length);
  for (let i = 0; i < soft.length; i++) {
    src8[i] = Math.round(soft[i] * 255);
  }
  const out = await sharp(src8, {
    raw: { width: MODEL_SIZE, height: MODEL_SIZE, channels: 1 },
  })
    .resize(dstW, dstH, { kernel: 'cubic', fit: 'fill' })
    .raw()
    .toBuffer();

  const result = new Float32Array(dstW * dstH);
  for (let i = 0; i < result.length; i++) result[i] = out[i] / 255;
  return result;
}
