import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  BATCH_ERROR_CODES,
  BATCH_MAX_STATUS_IDS,
  BATCH_SLOT_STALE_MS,
  BATCH_STATUS_WINDOW_LIMIT,
  BATCH_STATUS_WINDOW_MS,
  isTerminalVideoStatus,
  summarizeBatchItems,
  type BatchItem,
} from '@/lib/video-batch';
import { resolveBearerUserId } from '@/lib/server/plan-gate';
import { pumpUserQueue } from '@/lib/server/video-batch-queue';
import { normalizeClipRows, stageFor } from '@/lib/server/video-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 查询 + pump（≤5 次自踢，一次 1.5s 冲刷）
export const maxDuration = 60;

/**
 * 批量生产队列 —— 聚合状态 + 补位。
 *
 * 客户端每 3s 轮询本路由（页面隐藏时降到 10s）。除返回聚合进度外，它还是队列的**驱动点之一**：
 * 每次调用都会 pumpUserQueue 补满并发槽（并发已满时零开销，只一次 select）。
 * 另两个驱动点是提交时与 worker 出片终态时（自续航，用户关页面也能继续排空）。
 *
 * 严格鉴权：无 Bearer token → 401。`ids` 只用于**精确圈定某一批**，
 * 并且永远再用 user_id 过滤——客户端无法借此窥视他人任务。
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: NextRequest) {
  const userId = await resolveBearerUserId(request);
  if (!userId) {
    return NextResponse.json({ error: BATCH_ERROR_CODES.unauthorized }, { status: 401 });
  }

  const client = serviceRoleClient();
  if (!client) return NextResponse.json({ error: BATCH_ERROR_CODES.failed }, { status: 500 });

  const rawIds = (request.nextUrl.searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s));
  const truncatedIds = rawIds.length > BATCH_MAX_STATUS_IDS;
  const scopedIds = rawIds.slice(0, BATCH_MAX_STATUS_IDS);

  // 补位（驱动点之一）。默认 minAgeMs=20s，避免对同一条 pending 反复踢。
  const pump = await pumpUserQueue(client, userId);

  let query = client
    .from('videos')
    .select('id,original_url,title,status,progress,error_message,created_at,updated_at')
    .eq('user_id', userId);
  if (scopedIds.length > 0) {
    query = query.in('id', scopedIds);
  } else {
    query = query.gte('created_at', new Date(Date.now() - BATCH_STATUS_WINDOW_MS).toISOString());
  }
  const { data: videos, error } = await query
    .order('created_at', { ascending: true })
    .limit(BATCH_STATUS_WINDOW_LIMIT);
  if (error) {
    console.error('[videos/batch/status] query failed:', error.message);
    return NextResponse.json({ error: BATCH_ERROR_CODES.failed }, { status: 500 });
  }

  const rows = (videos ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((v) => String(v.id));

  const clipsByVideo = new Map<string, Array<Record<string, unknown>>>();
  if (ids.length > 0) {
    const { data: clips } = await client
      .from('short_videos')
      .select('id,video_id,url,start_time,end_time,duration,highlight_title,highlight_summary,thumbnail_url,created_at')
      .in('video_id', ids)
      .order('created_at', { ascending: true });
    for (const c of (clips ?? []) as Array<Record<string, unknown>>) {
      const key = String(c.video_id);
      const list = clipsByVideo.get(key);
      if (list) list.push(c);
      else clipsByVideo.set(key, [c]);
    }
  }

  const now = Date.now();
  const items: BatchItem[] = rows.map((v) => {
    const videoId = String(v.id);
    const status = typeof v.status === 'string' && v.status ? v.status : 'processing';
    const progress = Number(v.progress ?? 0);
    const updatedAt = typeof v.updated_at === 'string' ? v.updated_at : null;
    const clips = normalizeClipRows(videoId, clipsByVideo.get(videoId));
    const terminal = isTerminalVideoStatus(status);
    const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN;
    return {
      videoId,
      url: typeof v.original_url === 'string' ? v.original_url : '',
      title: typeof v.title === 'string' ? v.title : '',
      status,
      stage: stageFor(status, progress),
      progress: terminal ? 100 : progress,
      clipsGenerated: clips.length,
      playableClips: clips.filter((c) => c.status === 'completed').length,
      clips,
      error: typeof v.error_message === 'string' && v.error_message ? v.error_message : null,
      // 僵尸：非终态但久未更新（疑似被函数超时杀掉）→ 不占并发槽，前端需明文提示
      stalled: !terminal && Number.isFinite(updatedMs) && now - updatedMs > BATCH_SLOT_STALE_MS,
      createdAt: typeof v.created_at === 'string' ? v.created_at : null,
      updatedAt,
    };
  });

  return NextResponse.json({
    queue: {
      concurrency: pump.concurrency,
      active: pump.active,
      pending: pump.pending,
      stalled: pump.stalled,
    },
    summary: summarizeBatchItems(items),
    items,
    truncatedIds,
  });
}