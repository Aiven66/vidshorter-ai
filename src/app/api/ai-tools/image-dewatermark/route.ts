/**
 * AI 图片去水印 — 服务端 LaMa 推理
 * POST { imageUrl, maskUrl? }（均为本项目 Storage 签名 URL）
 *   - 带 maskUrl: 手动涂抹模式（掩码=用户涂抹 + 自动检测并集）
 *   - 不带 maskUrl: 一键模式（自动检测水印，无需涂抹）
 * → { resultUrl, width, height }
 */

import { NextRequest } from 'next/server';
import {
  ApiError,
  assertUserStorageUrl,
  jsonError,
  requireUserId,
  uploadResult,
} from '@/lib/server/ai-tools/storage';

export const maxDuration = 300;
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const body = (await req.json()) as { imageUrl?: string; maskUrl?: string };
    if (!body.imageUrl) throw new ApiError(400, 'MISSING_PARAMS');

    const imageUrl = assertUserStorageUrl(body.imageUrl, userId, 'ai-tools');

    // 延迟加载 LaMa 推理模块（sharp/onnxruntime 原生绑定）—— 加载失败时
    // 返回可诊断的 JSON 错误而非整个路由 500
    const { lamaInpaintServer, lamaInpaintAuto } = await import('@/lib/server/ai-tools/lama');
    const { png, width, height } = body.maskUrl
      ? await lamaInpaintServer(
          imageUrl,
          assertUserStorageUrl(body.maskUrl, userId, 'ai-tools')
        )
      : await lamaInpaintAuto(imageUrl);
    const { signedUrl } = await uploadResult(userId, 'png', png, 'image/png');

    return Response.json({ resultUrl: signedUrl, width, height });
  } catch (error) {
    return jsonError(error);
  }
}
