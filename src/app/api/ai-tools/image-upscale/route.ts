/**
 * AI 图片变高清 — 服务端 Swin2SR 超分
 * POST { imageUrl, scale: 2 | 4 }
 * → { resultUrl, width, height }
 */

import { NextRequest } from 'next/server';
import { upscaleServer } from '@/lib/server/ai-tools/upscale';
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
    const body = (await req.json()) as { imageUrl?: string; scale?: number };
    if (!body.imageUrl) throw new ApiError(400, 'MISSING_PARAMS');
    const scale = body.scale === 4 ? 4 : 2;

    const imageUrl = assertUserStorageUrl(body.imageUrl, userId, 'ai-tools');
    const { png, width, height } = await upscaleServer(imageUrl, scale);
    const { signedUrl } = await uploadResult(userId, 'png', png, 'image/png');

    return Response.json({ resultUrl: signedUrl, width, height });
  } catch (error) {
    return jsonError(error);
  }
}
