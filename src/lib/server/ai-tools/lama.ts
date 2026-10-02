/**
 * LaMa 图片去水印 — 服务端实现
 *
 * 模型: Carve/LaMa-ONNX fp32，固定输入 512x512（image [1,3,512,512] + mask [1,1,512,512]）
 * 策略（v3 彻底去水印，修复"即梦AI"类水印残留）:
 * 1. 掩码 bbox + 上下文 → 处理窗口 [256, 768] px
 * 2. 掩码在「原图窗口尺度等效 ~12px」的幅度膨胀（按窗口→512 缩放比换算），
 *    覆盖水印抗锯齿边缘、光晕/阴影、以及涂抹边缘外紧邻的细笔画字样
 *    （"即梦AI"水印的"AI"紧贴"即梦"，用户涂抹常有几个像素遗漏）
 * 3. 掩码缩放用 nearest 保真（cubic+阈值会让细笔画掩码收缩甚至断裂）
 * 4. 窗口缩放到 512x512 推理，输出放大回窗口尺寸
 * 5. 混合 alpha = max(羽化膨胀掩码, 用户原始掩码)——用户涂抹区 100% 硬替换，
 *    羽化只作用于膨胀外圈过渡带（修复 v2 羽化过渡带水印边缘残留）
 */

import sharp from 'sharp';
import { Tensor } from 'onnxruntime-node';
import { acquireModelSession, releaseModelSession } from './inference';
import {
  detectWatermark,
  dilateBinary,
  expandMaskByBrightness,
  featherBinary,
  fetchImageRaw,
  maskBBoxSingleChannel,
} from './image-ops';

const MIN_WINDOW = 256;
const MAX_WINDOW = 768;
const CONTEXT_RATIO = 0.45;
/** 原图尺度期望的掩码膨胀像素（覆盖光晕 + 紧邻漏涂笔画） */
const MASK_DILATE_SOURCE_PX = 12;
/** 512 模型尺度最小膨胀（大窗口换算值过小时保底） */
const MASK_DILATE_MODEL_MIN = 6;
const FEATHER_PX = 2;
const MODEL_SIZE = 512;
/** 一键模式水印印章矩形掩码的外扩安全边（像素），覆盖光晕/软边缘 */
const AUTO_SEAL_PAD = 10;

/**
 * 生成一键模式的"水印印章"矩形掩码：把检测到的整颗水印 bbox 外扩
 * AUTO_SEAL_PAD 后整体填满（clip 到图像边界）。这样无论水印是白字、黑字、
 * 半透明、带光晕还是细笔画，整片区域都会被 LaMa 整体修复，不留残影。
 */
function makeSealMask(
  width: number,
  height: number,
  bbox: { x: number; y: number; w: number; h: number },
  pad: number
): { bin: Buffer; gray: Uint8Array } {
  const x0 = Math.max(0, bbox.x - pad);
  const y0 = Math.max(0, bbox.y - pad);
  const x1 = Math.min(width, bbox.x + bbox.w + pad);
  const y1 = Math.min(height, bbox.y + bbox.h + pad);
  const bin = Buffer.alloc(width * height);
  const gray = new Uint8Array(width * height);
  for (let y = y0; y < y1; y++) {
    const row = y * width;
    for (let x = x0; x < x1; x++) {
      gray[row + x] = 1;
      bin[row + x] = 255;
    }
  }
  return { bin, gray };
}

/**
 * 一键去水印: 自动检测水印区域（角落文字/logo 聚簇）并修复，无需涂抹。
 * 未检测到明显水印时抛 WATERMARK_NOT_FOUND（前端引导用户手动涂抹）。
 *
 * 一键模式把检测到的"水印印章"整体作为矩形掩码（含膨胀安全边）——
 * 覆盖独立检测阈值漏掉的低对比度半透明光晕、抗锯齿软边缘与细笔画的
 * 交叉漏网（如"即梦AI"的"AI"细笔画），并给 LaMa 一个连续填充区域，
 * 从根上杜绝"涂抹/检测没盖住→残影"这一类去不干净的问题。
 * 自动检测只接受角落/贴边水印（位置硬约束），矩形填满不会误伤内容。
 */
export async function lamaInpaintAuto(
  imageUrl: string
): Promise<{ png: Buffer; width: number; height: number; window: { x: number; y: number; w: number; h: number } }> {
  const image = await fetchImageRaw(imageUrl);
  const { width, height, data: pixels } = image;

  const detected = detectWatermark(pixels, width, height);
  if (!detected) throw new Error('WATERMARK_NOT_FOUND');

  // 检测印章矩形（外扩安全边）。矩形整体填满保证整颗水印
  // （logo+即梦+AI+低对比度光晕/软边缘/细笔画漏网）被 LaMa 作为一个
  // 连续区域修复，不留残影。自动检测只接受角落/贴边水印（位置硬约束），
  // 矩形填满不会误伤内容。
  const seal = makeSealMask(width, height, detected.bbox, AUTO_SEAL_PAD);
  let gray = Uint8Array.from(seal.gray);
  let bin = Buffer.from(seal.bin);

  // 链式亮度扩展: detect 的聚簇间隙阈值 hgap=max(32, medH*1.8) 无法归并
  // 远处分离元素（"即梦" + 20-120px 留白 + "AI"），且 merge 只并入 bbox
  // 重叠≥35% 的候选，分离元素跨不过——检测 bbox（或印章矩形）只盖住局部，
  // 整个 "AI" 因此出不了掩码，这是"AI 残留"的根因。以当前掩码为锚点反复
  // 做亮度引导扩展、再把新并入像素并入掩码重新锚定，逐圈向外传播（BFS
  // 阶梯），直至无新像素加入（≤5 轮收敛）。无论检测选到哪一侧，分离的
  // 同色系水印元素最终都能被盖上。
  for (let iter = 0; iter < 5; iter++) {
    const expanded = expandMaskByBrightness(pixels, bin, gray, width, height);
    if (expanded.addedPixels === 0) break;
    for (let i = 0; i < gray.length; i++) {
      if (expanded.gray[i] && !gray[i]) {
        gray[i] = 1;
        bin[i] = 255;
      }
    }
  }

  return runInpaintPipeline(pixels, width, height, bin, gray);
}

/**
 * 手动涂抹去水印: 对 imageUrl 上 maskUrl 标记（不透明白色涂抹）的区域执行
 * LaMa 修复，返回整图 PNG Buffer（原分辨率）。
 *
 * v5: 自动检测到的水印聚簇若与用户涂抹区域重叠则并入掩码——用户只需涂到
 * 水印的任意一部分（如"即梦"），检测自动补全整个水印（logo+"即梦"+"AI"），
 * 彻底解决涂抹遗漏导致的"AI"残留。
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

  // 2. 掩码（红通道 > 128；透明区域红通道为 0）
  const maskGray0 = new Uint8Array(width * height);
  const maskBin0 = Buffer.alloc(width * height); // 0/255 灰度（供 sharp raw 管线）
  for (let i = 0; i < maskGray0.length; i++) {
    const on = mask.data[i * 4] > 128 ? 1 : 0;
    maskGray0[i] = on;
    maskBin0[i] = on ? 255 : 0;
  }
  const userBBox = maskBBoxSingleChannel(maskGray0, width, height, 0);
  if (!userBBox) {
    throw new Error('EMPTY_MASK');
  }

  // 2.5 自动检测并入: 检测聚簇与用户涂抹 bbox 重叠 → 同一水印，取并集
  //    （用户只涂了"即梦"，检测补全 logo + "AI"）；无重叠则忽略检测
  //    （用户可能只想移除别的东西，不能误伤）
  let maskBin = maskBin0;
  let maskGray = maskGray0;
  const detected = detectWatermark(pixels, width, height);
  if (detected) {
    const overlapX =
      Math.min(detected.bbox.x + detected.bbox.w, userBBox.x + userBBox.w) -
      Math.max(detected.bbox.x, userBBox.x);
    const overlapY =
      Math.min(detected.bbox.y + detected.bbox.h, userBBox.y + userBBox.h) -
      Math.max(detected.bbox.y, userBBox.y);
    if (overlapX > 0 && overlapY > 0) {
      maskBin = Buffer.from(maskBin0);
      maskGray = Uint8Array.from(maskGray0);
      for (let i = 0; i < maskGray.length; i++) {
        if (detected.gray[i] && !maskGray[i]) {
          maskGray[i] = 1;
          maskBin[i] = 255;
        }
      }
    }
  }

  // 2.6 亮度引导扩展: 把掩码附近的"水印色"分离元素（对比度不足或无符合
  //     条件的连通域时原样返回，零风险）
  const expanded = expandMaskByBrightness(pixels, maskBin, maskGray, width, height);

  return runInpaintPipeline(pixels, width, height, expanded.bin, expanded.gray);
}

/** LaMa 修复核心管线（掩码 → 窗口 → 膨胀 → 推理 → 混合 → 贴回全图） */
async function runInpaintPipeline(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  maskBin: Buffer,
  maskGray: Uint8Array
): Promise<{ png: Buffer; width: number; height: number; window: { x: number; y: number; w: number; h: number } }> {
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

  // 不足 MIN_WINDOW 的维度扩到 MIN_WINDOW（逐维度独立扩展——窗口已达标
  // 的维度保持不变；整窗重置会把贴窗缘的水印切出窗外，如右下角水印的
  // "I" 距图右缘仅 26px，窗口 400 宽被重置成 256 后 I 整体丢出掩码）
  if (winW < MIN_WINDOW) {
    const cx = Math.floor((wx0 + wx1) / 2);
    const half = Math.floor(MIN_WINDOW / 2);
    wx0 = Math.max(0, Math.min(cx - half, width - MIN_WINDOW));
    wx1 = Math.min(width, wx0 + MIN_WINDOW);
  }
  if (winH < MIN_WINDOW) {
    const cy = Math.floor((wy0 + wy1) / 2);
    const half = Math.floor(MIN_WINDOW / 2);
    wy0 = Math.max(0, Math.min(cy - half, height - MIN_WINDOW));
    wy1 = Math.min(height, wy0 + MIN_WINDOW);
  }
  winW = wx1 - wx0;
  winH = wy1 - wy0;

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

  // 4. 提取窗口 image raw 并缩放到 512x512
  const windowImage = await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length), {
    raw: { width, height, channels: 4 },
  })
    .extract({ left: wx0, top: wy0, width: winW, height: winH })
    .resize(MODEL_SIZE, MODEL_SIZE, { kernel: 'lanczos3', fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();

  // 5. 用户掩码裁剪到窗口 → nearest 缩放到 512（二值保真，细笔画不收缩）
  // 注意: sharp 对 1 通道 raw 输入经 extract/resize 后会输出 3 通道，
  // 必须尾部 toColourspace('b-w') 强制回 1 通道，否则掩码读出来全 0（EMPTY_MASK）
  const userMaskWin = await sharp(maskBin, {
    raw: { width, height, channels: 1 },
  })
    .extract({ left: wx0, top: wy0, width: winW, height: winH })
    .resize(MODEL_SIZE, MODEL_SIZE, { kernel: 'nearest', fit: 'fill' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();
  const userMask512 = new Uint8Array(MODEL_SIZE * MODEL_SIZE);
  for (let i = 0; i < userMask512.length; i++) userMask512[i] = userMaskWin[i] > 128 ? 1 : 0;
  const hasMask = userMask512.some((v) => v === 1);
  if (!hasMask) throw new Error('EMPTY_MASK');

  // 6. 膨胀: 原图尺度等效 MASK_DILATE_SOURCE_PX。窗口 x/y 缩放比不同
  //    （非正方形窗口 → 512x512）时按轴分别换算，保证两轴都是原图 12px
  const dilatePxX = Math.max(
    MASK_DILATE_MODEL_MIN,
    Math.ceil((MASK_DILATE_SOURCE_PX * MODEL_SIZE) / winW)
  );
  const dilatePxY = Math.max(
    MASK_DILATE_MODEL_MIN,
    Math.ceil((MASK_DILATE_SOURCE_PX * MODEL_SIZE) / winH)
  );
  const dilated = dilateBinary(userMask512, MODEL_SIZE, MODEL_SIZE, dilatePxX, dilatePxY);

  // 7. 构建张量（NCHW，/255 归一化）
  const plane = MODEL_SIZE * MODEL_SIZE;
  const imageInput = new Float32Array(3 * plane);
  const maskInput = new Float32Array(plane);
  for (let i = 0; i < plane; i++) {
    imageInput[i] = windowImage[i * 3] / 255;
    imageInput[plane + i] = windowImage[i * 3 + 1] / 255;
    imageInput[2 * plane + i] = windowImage[i * 3 + 2] / 255;
    maskInput[i] = dilated[i];
  }

  // 8. 推理（会话借出 → 推理+解码完成即归还，允许驱逐器回收内存）
  const session = await acquireModelSession('lama');
  let inpainted512: Buffer;
  try {
    const results = await session.run({
      image: new Tensor('float32', imageInput, [1, 3, MODEL_SIZE, MODEL_SIZE]),
      mask: new Tensor('float32', maskInput, [1, 1, MODEL_SIZE, MODEL_SIZE]),
    });
    const output = results[session.outputNames[0]];
    const outData = output.data as Float32Array;
    const outH = output.dims[2] as number;
    const outW = output.dims[3] as number;
    const outPlane = outW * outH;

    // 9. 输出 512x512 → 编码 PNG → 放大回窗口尺寸
    // 注意: 不同 LaMa ONNX 导出的输出尺度不同（0-1 或 0-255），自动检测
    let outMax = 0;
    for (let i = 0; i < outData.length; i++) {
      if (outData[i] > outMax) outMax = outData[i];
    }
    const outScale = outMax > 1.5 ? 1 : 255; // 0-255 尺度直接用；0-1 尺度乘 255
    inpainted512 = Buffer.alloc(plane * 3);
    for (let i = 0; i < plane; i++) {
      // 模型输出可能带轻微越界，clamp 到 [0,255]
      inpainted512[i * 3] = Math.min(255, Math.max(0, Math.round(outData[i] * outScale)));
      inpainted512[i * 3 + 1] = Math.min(255, Math.max(0, Math.round(outData[outPlane + i] * outScale)));
      inpainted512[i * 3 + 2] = Math.min(255, Math.max(0, Math.round(outData[2 * outPlane + i] * outScale)));
    }
  } finally {
    releaseModelSession('lama');
  }
  const inpaintWindow = await sharp(inpainted512, {
    raw: { width: MODEL_SIZE, height: MODEL_SIZE, channels: 3 },
  })
    .resize(winW, winH, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer();

  // 10. 混合 alpha = max(羽化膨胀掩码, 用户原始掩码):
  //   - 用户涂抹区内 alpha=1 → 100% 修复结果（杜绝羽化过渡带水印边缘残留）
  //   - 膨胀圈向外平滑衰减（羽化只影响膨胀外圈过渡带）
  const soft = await featherBinary(dilated, MODEL_SIZE, MODEL_SIZE, FEATHER_PX);
  const softWindow = await resizeSoftMask(soft, winW, winH);
  const userMaskWindow = await sharp(Buffer.from(userMaskWin), {
    raw: { width: MODEL_SIZE, height: MODEL_SIZE, channels: 1 },
  })
    .resize(winW, winH, { kernel: 'nearest', fit: 'fill' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  const blended = Buffer.from(inpaintWindow);
  const windowOriginal = await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length), {
    raw: { width, height, channels: 4 },
  })
    .extract({ left: wx0, top: wy0, width: winW, height: winH })
    .removeAlpha()
    .raw()
    .toBuffer();

  for (let i = 0; i < softWindow.length; i++) {
    const hard = userMaskWindow[i] > 128 ? 1 : 0;
    const alpha = Math.max(softWindow[i], hard);
    if (alpha <= 0.002) continue;
    if (alpha >= 0.998) {
      // 硬替换区（用户掩码内/膨胀圈内芯）: 直接用修复结果
      blended[i * 3] = inpaintWindow[i * 3];
      blended[i * 3 + 1] = inpaintWindow[i * 3 + 1];
      blended[i * 3 + 2] = inpaintWindow[i * 3 + 2];
      continue;
    }
    const r = blended[i * 3];
    const g = blended[i * 3 + 1];
    const b = blended[i * 3 + 2];
    blended[i * 3] = Math.round(windowOriginal[i * 3] * (1 - alpha) + r * alpha);
    blended[i * 3 + 1] = Math.round(windowOriginal[i * 3 + 1] * (1 - alpha) + g * alpha);
    blended[i * 3 + 2] = Math.round(windowOriginal[i * 3 + 2] * (1 - alpha) + b * alpha);
  }

  // 11. 贴回全图
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
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  const result = new Float32Array(dstW * dstH);
  for (let i = 0; i < result.length; i++) result[i] = out[i] / 255;
  return result;
}
