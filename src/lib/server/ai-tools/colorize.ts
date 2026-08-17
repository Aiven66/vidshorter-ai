/**
 * 黑白照片 AI 上色 — 服务端实现
 *
 * 模型: PINTO zoo #068 Colorful Image Colorization fp32（源自 richzhang/colorization SIGGRAPH17）
 * 输入: inputs:0 NHWC [1,256,256,1] — Lab L 通道，(L-50)/100 归一化
 * 输出: Identity:0 NHWC [1,256,256,2] — Lab ab 通道（幅值自适应兼容 ±1/±110 两种约定）
 *
 * 质量策略: 256x256 预测 ab → 高质量放大回原分辨率 → 与原图 L 合成
 * （亮度 = 原图全部细节，色彩 = AI 生成，色彩本就是低频信息）
 */

import sharp from 'sharp';
import { Tensor } from 'onnxruntime-node';
import { getModelSession } from './inference';
import {
  fetchImageRaw,
  labToRgbInto,
  resizeFloatChannel,
  rgbRawToLChannel,
} from './image-ops';

const MODEL_INPUT_SIZE = 256;
const MAX_OUTPUT_SIDE = 2560;

/** 黑白照片上色，返回彩色 PNG Buffer */
export async function colorizeServer(
  imageUrl: string
): Promise<{ png: Buffer; width: number; height: number }> {
  // 1. 全分辨率 RGBA（超大图缩放到 2560 内）
  const { data: pixels, width: outW, height: outH } = await fetchImageRaw(imageUrl, MAX_OUTPUT_SIDE);
  const n = outW * outH;

  // 2. 全图 L 通道
  const { L } = rgbRawToLChannel(pixels, outW, outH);

  // 3. 缩小图 L 通道 → 模型输入
  const small = await sharp(
    Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length),
    { raw: { width: outW, height: outH, channels: 4 } }
  )
    .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, { kernel: 'lanczos3', fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();

  // RGB 交错 → 展开为 RGBA（rgbRawToLChannel 按 4 字节步长读取）
  const smallRgba = new Uint8ClampedArray(MODEL_INPUT_SIZE * MODEL_INPUT_SIZE * 4);
  for (let i = 0; i < MODEL_INPUT_SIZE * MODEL_INPUT_SIZE; i++) {
    smallRgba[i * 4] = small[i * 3];
    smallRgba[i * 4 + 1] = small[i * 3 + 1];
    smallRgba[i * 4 + 2] = small[i * 3 + 2];
    smallRgba[i * 4 + 3] = 255;
  }
  const { L: smallL } = rgbRawToLChannel(smallRgba, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

  const input = new Float32Array(MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
  for (let i = 0; i < input.length; i++) {
    input[i] = (smallL[i] - 50) / 100; // SIGGRAPH17 归一化约定
  }

  // 4. ONNX 推理（NHWC）
  const session = await getModelSession('colorize');
  const results = await session.run({
    'inputs:0': new Tensor('float32', input, [1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 1]),
  });
  const output = results[session.outputNames[0]];
  const ab = output.data as Float32Array;
  const plane = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;

  // 5. 输出幅值自适应：±1 约定 ×128；否则视为原生 Lab ab
  let maxAbs = 0;
  const sampleStep = Math.max(1, Math.floor(plane / 4096));
  for (let i = 0; i < plane; i += sampleStep) {
    const va = Math.abs(ab[i * 2]);
    const vb = Math.abs(ab[i * 2 + 1]);
    if (va > maxAbs) maxAbs = va;
    if (vb > maxAbs) maxAbs = vb;
  }
  const abRange = maxAbs <= 1.5 ? 128 : 1;

  // 6. 分离 a/b（NHWC 交错）→ 上采样回原分辨率
  const aSmall = new Float32Array(plane);
  const bSmall = new Float32Array(plane);
  for (let i = 0; i < plane; i++) {
    aSmall[i] = ab[i * 2] * abRange;
    bSmall[i] = ab[i * 2 + 1] * abRange;
  }
  const aFull = await resizeFloatChannel(aSmall, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, outW, outH, 128);
  const bFull = await resizeFloatChannel(bSmall, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, outW, outH, 128);

  // 7. L + ab → RGB 合成
  const outPixels = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n * 4; i += 4) {
    outPixels[i] = pixels[i];
    outPixels[i + 1] = pixels[i + 1];
    outPixels[i + 2] = pixels[i + 2];
    outPixels[i + 3] = 255;
  }
  labToRgbInto(outPixels, L, aFull, bFull);

  // 8. 编码 PNG
  const png = await sharp(
    Buffer.from(outPixels.buffer, outPixels.byteOffset, outPixels.length),
    { raw: { width: outW, height: outH, channels: 4 } }
  )
    .removeAlpha()
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { png, width: outW, height: outH };
}
