/**
 * AI 图片去水印 — 服务端 LaMa 推理
 * POST { imageUrl, maskUrl }（均为本项目 Storage 签名 URL）
 * → { resultUrl, width, height }
 */

import { NextRequest } from 'next/server';
import { lamaInpaintServer } from '@/lib/server/ai-tools/lama';
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
    if (!body.imageUrl || !body.maskUrl) throw new ApiError(400, 'MISSING_PARAMS');

    const imageUrl = assertUserStorageUrl(body.imageUrl, userId, 'ai-tools');
    const maskUrl = assertUserStorageUrl(body.maskUrl, userId, 'ai-tools');

    const { png, width, height } = await lamaInpaintServer(imageUrl, maskUrl);
    const { signedUrl } = await uploadResult(userId, 'png', png, 'image/png');

    return Response.json({ resultUrl: signedUrl, width, height });
  } catch (error) {
    return jsonError(error);
  }
}
