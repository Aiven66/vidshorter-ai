/**
 * AI 图片背景消除 — 服务端 MODNet 推理
 * POST { imageUrl }（本项目 Storage 签名 URL）
 * → { resultUrl, width, height }（透明 PNG，原分辨率）
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

    // 延迟加载 MODNet 推理模块（sharp/onnxruntime 原生绑定）
    const { removeBackground } = await import('@/lib/server/ai-tools/modnet');
    const { png, width, height } = await removeBackground(imageUrl);
    const { signedUrl } = await uploadResult(userId, 'png', png, 'image/png');

    return Response.json({ resultUrl: signedUrl, width, height });
  } catch (error) {
    return jsonError(error);
  }
}