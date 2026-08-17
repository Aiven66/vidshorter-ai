/**
 * AI 工具箱 — 输入文件存储访问票据
 * POST { action: 'ticket', filename } → { uploadUrl, objectPath }（客户端 PUT 直传 Supabase）
 * POST { action: 'read-url', objectPath } → { signedUrl }（1h 读取签名）
 */

import { NextRequest } from 'next/server';
import {
  ApiError,
  createInputSignedUrl,
  createUploadTicket,
  jsonError,
  requireUserId,
} from '@/lib/server/ai-tools/storage';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      filename?: string;
      objectPath?: string;
    };

    if (body.action === 'ticket') {
      if (!body.filename || typeof body.filename !== 'string') {
        throw new ApiError(400, 'MISSING_PARAMS');
      }
      const ticket = await createUploadTicket(userId, body.filename.slice(0, 120));
      return Response.json(ticket);
    }

    if (body.action === 'read-url') {
      if (!body.objectPath) throw new ApiError(400, 'MISSING_PARAMS');
      const signedUrl = await createInputSignedUrl(userId, String(body.objectPath));
      return Response.json({ signedUrl });
    }

    throw new ApiError(400, 'UNKNOWN_ACTION');
  } catch (error) {
    return jsonError(error);
  }
}
