/**
 * AI 黑白照片上色 — 服务端推理
 * POST { imageUrl }
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
    const body = (await req.json()) as { imageUrl?: string };
    if (!body.imageUrl) throw new ApiError(400, 'MISSING_PARAMS');

    const imageUrl = assertUserStorageUrl(body.imageUrl, userId, 'ai-tools');
    // 延迟加载推理模块（sharp/onnxruntime 原生绑定）—— 加载失败返回可诊断 JSON 错误
    const { colorizeServer } = await import('@/lib/server/ai-tools/colorize');
    const { png, width, height } = await colorizeServer(imageUrl);
    const { signedUrl } = await uploadResult(userId, 'png', png, 'image/png');

    return Response.json({ resultUrl: signedUrl, width, height });
  } catch (error) {
    return jsonError(error);
  }
}
