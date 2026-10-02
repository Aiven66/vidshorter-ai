/**
 * MODNet 人像背景消除 — 服务端实现
 *
 * 模型: Xenova/modnet（ONNX，人像前景分割 / 肖像抠图），固定输入 512x512
 *   输入: [1,3,512,512] float32（BGR，mean 127.5 / scale 127.5，MODNet 官方前处理）
 *   输出: [1,1,512,512] float32，范围 [0,1]（前景 alpha matte）
 *
 * remove.bg 风格: 保留原图清晰度与宽高比，仅去除背景，输出透明 PNG（RGBA）。
 * 由于模型是正方形输入，先保持宽高比缩放到 512 内并用黑色 letterbox 补齐到
 * 512x512（letterbox 作为背景 → matte 为 0，天然被移除），推理后再裁剪 letterbox
 * 并把 matte 缩放回原分辨率，最终作为原图 alpha 通道输出。
 */

import sharp from 'sharp';
import { Tensor } from 'onnxruntime-node';
import { acquireModelSession, releaseModelSession } from './inference';
import { fetchImageRaw } from './image-ops';

const MODEL_SIZE = 512;

/**
 * 移除图片背景，返回带透明通道的原分辨率 PNG。
 * @param imageUrl 本项目 Supabase Storage 签名 URL
 */
export async function removeBackground(
  imageUrl: string
): Promise<{ png: Buffer; width: number; height: number }> {
  const { data: rgba, width: origW, height: origH } = await fetchImageRaw(imageUrl);

  // 1. 保持宽高比缩放到 512 内，letterbox（黑边）补齐到 512x512
  const scale = MODEL_SIZE / Math.max(origW, origH);
  const scaledW = Math.max(1, Math.round(origW * scale));
  const scaledH = Math.max(1, Math.round(origH * scale));

  const scaledRGBA = await sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length), {
    raw: { width: origW, height: origH, channels: 4 },
  })
    .resize(scaledW, scaledH, { kernel: 'lanczos3' })
    .raw()
    .toBuffer();

  // 黑边 letterbox 基板（黑/透明均可，MODNet 会当作背景）
  const RGB_W = 3;
  const plane = MODEL_SIZE * MODEL_SIZE;
  const rgb = Buffer.alloc(plane * RGB_W); // 全黑

  // 2. 填写 BGR mean127.5 / scale127.5 到 NCHW 张量（MODNet 官方前处理）
  const input = new Float32Array(RGB_W * plane);
  for (let y = 0; y < scaledH; y++) {
    for (let x = 0; x < scaledW; x++) {
      const si = (y * scaledW + x) * 4;
      const ti = y * MODEL_SIZE + x;
      const r = scaledRGBA[si];
      const g = scaledRGBA[si + 1];
      const b = scaledRGBA[si + 2];
      // BGR 通道 + (x-127.5)/127.5
      input[ti] = (b - 127.5) / 127.5;
      input[plane + ti] = (g - 127.5) / 127.5;
      input[2 * plane + ti] = (r - 127.5) / 127.5;
    }
  }

  // 3. 推理（借出会话 → 完成即归还）
  const session = await acquireModelSession('modnet');
  let alpha: Float32Array;
  try {
    const results = await session.run({
      input: new Tensor('float32', input, [1, 3, MODEL_SIZE, MODEL_SIZE]),
    });
    const output = results[session.outputNames[0]];
    alpha = output.data as Float32Array;
  } finally {
    releaseModelSession('modnet');
  }

  // 4. 裁剪 letterbox → 缩放回原分辨率（lanczos 保持发丝软边缘）
  const matteScaled = Buffer.alloc(scaledW * scaledH);
  for (let y = 0; y < scaledH; y++) {
    for (let x = 0; x < scaledW; x++) {
      const v = alpha[y * MODEL_SIZE + x];
      matteScaled[y * scaledW + x] = Math.round(Math.max(0, Math.min(1, v)) * 255);
    }
  }
  const matteFull = await sharp(matteScaled, {
    raw: { width: scaledW, height: scaledH, channels: 1 },
  })
    .resize(origW, origH, { kernel: 'lanczos3' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  // 5. 用计算出的 alpha 覆盖原图 RGBA 的 alpha 通道 → 透明 PNG
  const outRGBA = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length);
  for (let i = 0; i < origW * origH; i++) {
    outRGBA[i * 4 + 3] = matteFull[i];
  }

  const png = await sharp(outRGBA, {
    raw: { width: origW, height: origH, channels: 4 },
  })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { png, width: origW, height: origH };
}