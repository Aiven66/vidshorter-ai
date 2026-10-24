/**
 * /api/publish/schedule —— 发布排期的服务端读写（跨设备）。
 *
 * 鉴权与 /api/publish 一致：只认服务端解析出的真实用户，绝不接受前端 userId。
 *   GET  → 当前用户全部排期
 *   POST → { action: 'upsert', post } | { action: 'delete', id }
 *
 * 语义是「内容日历」，不做平台直发：到点由前端提醒并深链跳转平台上传页。
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveBearerUserId } from '@/lib/server/plan-gate';
import {
  deleteScheduledPost,
  isScheduleStoreConfigured,
  readSchedule,
  sanitizeScheduledPost,
  upsertScheduledPost,
} from '@/lib/server/schedule-store';

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
    { error: 'Schedule store is not configured.', reason: 'store_unavailable' },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  const userId = await resolveBearerUserId(request);
  if (!userId) return unauthorized();
  if (!isScheduleStoreConfigured()) return unavailable();
  const posts = await readSchedule(userId);
  return NextResponse.json({ posts });
}

export async function POST(request: NextRequest) {
  const userId = await resolveBearerUserId(request);
  if (!userId) return unauthorized();
  if (!isScheduleStoreConfigured()) return unavailable();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action : 'upsert';

  try {
    if (action === 'delete') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
      const posts = await deleteScheduledPost(userId, id);
      return NextResponse.json({ ok: true, posts });
    }

    const post = sanitizeScheduledPost(body.post);
    if (!post) {
      return NextResponse.json({ error: 'post is invalid.' }, { status: 400 });
    }
    const posts = await upsertScheduledPost(userId, post);
    return NextResponse.json({ ok: true, posts });
  } catch (e) {
    console.warn('[api/publish/schedule] failed:', e instanceof Error ? e.message.slice(0, 200) : e);
    return NextResponse.json({ error: 'Failed to persist schedule.' }, { status: 500 });
  }
}
