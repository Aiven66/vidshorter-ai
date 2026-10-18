/**
 * /api/publish —— 发布运营台的服务端读写入口（跨设备同步）。
 *
 * 鉴权：只认服务端解析出的真实用户（Authorization: Bearer 或 clipop_access_token cookie），
 * 绝不接受前端传入的 userId（与全站 server-authoritative 约定一致）。
 *
 * 语义：
 *   GET  → 读取当前用户全部发布记录
 *   POST → { action: 'upsert', clipId, info }   新增/更新
 *          { action: 'delete', clipId }          删除
 *          { action: 'migrate', records }        一次性把本地记录并入服务端
 *
 * 未配置 service role（503）时前端安全回落 localStorage，不影响可用性。
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveBearerUserId } from '@/lib/server/plan-gate';
import {
  readPublishRecords,
  upsertPublishRecord,
  deletePublishRecord,
  mergePublishRecords,
  sanitizePublishInfo,
  isPublishStoreConfigured,
  type PublishRecordMap,
} from '@/lib/server/publish-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unauthorized() {
  return NextResponse.json(
    { error: 'Authentication required.', reason: 'unauthenticated' },
    { status: 401 },
  );
}

function unavailable() {
  return NextResponse.json(
    { error: 'Publish store is not configured.', reason: 'store_unavailable' },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  const userId = await resolveBearerUserId(request);
  if (!userId) return unauthorized();
  if (!isPublishStoreConfigured()) return unavailable();
  const records = await readPublishRecords(userId);
  return NextResponse.json({ records });
}

export async function POST(request: NextRequest) {
  const userId = await resolveBearerUserId(request);
  if (!userId) return unauthorized();
  if (!isPublishStoreConfigured()) return unavailable();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action : 'upsert';

  try {
    if (action === 'migrate') {
      const raw = body.records;
      const cleaned: PublishRecordMap = {};
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [clipId, value] of Object.entries(raw as Record<string, unknown>)) {
          const info = sanitizePublishInfo(value);
          if (clipId && info) cleaned[clipId] = info;
        }
      }
      const records = await mergePublishRecords(userId, cleaned);
      return NextResponse.json({ ok: true, records });
    }

    const clipId = typeof body.clipId === 'string' ? body.clipId.trim() : '';
    if (!clipId) {
      return NextResponse.json({ error: 'clipId is required.' }, { status: 400 });
    }

    if (action === 'delete') {
      const records = await deletePublishRecord(userId, clipId);
      return NextResponse.json({ ok: true, records });
    }

    const info = sanitizePublishInfo(body.info);
    if (!info) {
      return NextResponse.json({ error: 'info is required.' }, { status: 400 });
    }
    const records = await upsertPublishRecord(userId, clipId, info);
    return NextResponse.json({ ok: true, records });
  } catch (e) {
    console.warn('[api/publish] failed:', e instanceof Error ? e.message.slice(0, 200) : e);
    return NextResponse.json({ error: 'Failed to persist publish record.' }, { status: 500 });
  }
}