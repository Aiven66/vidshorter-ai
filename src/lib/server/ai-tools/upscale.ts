/**
 * Swin2SR 图片超分 — 服务端实现
 *
 * 模型: Xenova/swin2SR-classical-sr-x2-64 fp32
 * 输入: pixel_values NCHW [1,3,H,W]（/255 归一化，H/W 为 8 的倍数）
 * 输出: reconstruction NCHW [1,3,2H,2W]
 * 4x = 两次 2x 级联
 */

import sharp from 'sharp';
import { Tensor } from 'onnxruntime-node';
import { getModelSession } from './inference';
import { fitSize, roundToMultiple } from './image-ops';

const MAX_INPUT_SIDE = 960;
const MAX_OUTPUT_SIDE = 4096; // 单次 2x 后的安全上限

interface RawImage {
  data: Buffer; // RGB 3 通道交错
  width: number;
  height: number;
}

async function loadResizedRgb(imageUrl: string, maxSide: number): Promise<RawImage> {
  const resp = await fetch(imageUrl, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`Failed to fetch image: HTTP ${resp.status}`);
  const input = Buffer.from(await resp.arrayBuffer());
  const meta = await sharp(input, { failOn: 'none' }).metadata();
  if (!meta.width || !meta.height) throw new Error('Invalid image dimensions');

  const fitted = fitSize(meta.width, meta.height, maxSide);
  const aligned = roundToMultiple(fitted.width, fitted.height, 8);

  const { data, info } = await sharp(input, { failOn: 'none' })
    .resize(aligned.width, aligned.height, { kernel: 'lanczos3', fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** 单次 2x 推理：RGB raw → 2x RGB raw */
async function upscale2x(input: RawImage): Promise<RawImage> {
  const { width, height, data } = input;
  const plane = width * height;

  const floatInput = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    floatInput[i] = data[i * 3] / 255;
    floatInput[plane + i] = data[i * 3 + 1] / 255;
    floatInput[2 * plane + i] = data[i * 3 + 2] / 255;
  }

  const session = await getModelSession('swin2sr');
  const results = await session.run({
    pixel_values: new Tensor('float32', floatInput, [1, 3, height, width]),
  });
  const output = results[session.outputNames[0]];
  const outData = output.data as Float32Array;
  const outH = output.dims[2] as number;
  const outW = output.dims[3] as number;
  const outPlane = outW * outH;

  const out = Buffer.alloc(outPlane * 3);
  for (let i = 0; i < outPlane; i++) {
    out[i * 3] = Math.min(255, Math.max(0, Math.round(outData[i] * 255)));
    out[i * 3 + 1] = Math.min(255, Math.max(0, Math.round(outData[outPlane + i] * 255)));
    out[i * 3 + 2] = Math.min(255, Math.max(0, Math.round(outData[2 * outPlane + i] * 255)));
  }
  return { data: out, width: outW, height: outH };
}

/** 超分入口：scale 2 或 4，返回 PNG Buffer 与输出尺寸 */
export async function upscaleServer(
  imageUrl: string,
  scale: 2 | 4
): Promise<{ png: Buffer; width: number; height: number }> {
  const maxSide = scale === 4 ? Math.floor(MAX_INPUT_SIDE / 2) : MAX_INPUT_SIDE;
  let image = await loadResizedRgb(imageUrl, maxSide);

  const passes = scale === 4 ? 2 : 1;
  for (let i = 0; i < passes; i++) {
    if (Math.max(image.width, image.height) > MAX_OUTPUT_SIDE) break; // 防失控
    image = await upscale2x(image);
  }

  const png = await sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: 3 },
  })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { png, width: image.width, height: image.height };
}
