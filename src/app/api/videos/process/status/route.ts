import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { qstashEnabled, workerWebhookUrl } from '@/lib/server/video-queue';
import { refundIfCharged } from '@/lib/server/video-refund';
import { normalizeClipRows, stageFor } from '@/lib/server/video-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Durable progress/status endpoint for async video jobs.
 *
 * Returns a normalized payload the client can render directly:
 *   - stage: init | ai_analysis | generating_clip | clips_complete | complete | error
 *   - progress: 0..100
 *   - clips: playable/link_only clips persisted so far
 *   - status: the raw videos.status
 *   - error: a user-facing message when the job failed or went stale
 *
 * A stale job (still "processing" longer than PROCESS_STALE_MS, default 25 min,
 * beyond Pro's function window) is reported as a timed-out failure instead of an
 * endless "processing" spinner.
 */

const STALE_MS = Number(process.env.PROCESS_STALE_MS || 25 * 60 * 1000);

const TERMINAL = new Set(['completed', 'partial', 'link_only_completed', 'failed']);

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get('videoId')?.trim() || '';
  if (!videoId) return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });

  const client = serviceRoleClient();
  if (!client) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const { data: video, error } = await client
    .from('videos')
    .select('id,user_id,status,progress,progress_message,error_message,title,duration,highlights,updated_at,created_at,original_url,source_type')
    .eq('id', videoId)
    .maybeSingle();

  if (error || !video) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const rawStatus = video.status || 'processing';
  const progress = Number(video.progress ?? 0);

  // Rescue kick: a job that never started (progress 0, no updated_at, older
  // than 20s) means the submit-time worker kick didn't land — e.g. the submit
  // function was frozen before the outgoing request flushed. Kick the worker
  // again; it runs as its own invocation. Only in no-queue mode (QStash would
  // deliver on its own, and a second analyze could duplicate clips).
  if (
    !qstashEnabled() &&
    !TERMINAL.has(rawStatus) &&
    progress === 0 &&
    !video.updated_at &&
    video.created_at &&
    Date.now() - new Date(video.created_at).getTime() > 20_000 &&
    video.original_url
  ) {
    void fetch(workerWebhookUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step: 'analyze',
        videoId,
        userId: video.user_id,
        videoUrl: video.original_url,
        sourceType: video.source_type || 'url',
      }),
    }).catch(() => {});
  }

  // Staleness detection → explicit failure (item 2: no more infinite "processing").
  let effectiveStatus = rawStatus;
  let effectiveMessage = video.error_message || null;
  if (!TERMINAL.has(rawStatus)) {
    // Fall back to created_at when the job never even started, so a dead
    // submission still turns into an explicit failure after STALE_MS.
    const updated = video.updated_at || video.created_at
      ? new Date((video.updated_at || video.created_at) as string).getTime()
      : Date.now();
    if (Date.now() - updated > STALE_MS) {
      // Atomically claim the transition to failed so concurrent pollers don't
      // double-process it; refundIfCharged is also idempotent per video.
      // NOTE: `.not('status','in',[...])` generates an unparseable postgREST
      // filter (`not.in.completed,...` — no column prefix, no parens), so use a
      // raw `.or()` predicate that maps to `status=not.in.(completed,partial,...)`.
      const { data: claimed } = await client
        .from('videos')
        .update({ status: 'failed', error_message: effectiveMessage, updated_at: new Date().toISOString() })
        .eq('id', videoId)
        .or('status.not.in.(completed,partial,link_only_completed,failed)')
        .select('status');
      effectiveStatus = 'failed';
      effectiveMessage = effectiveMessage ||
        'Processing timed out and was stopped. This may be a temporary issue with the video source. Please retry.';
      if (!claimed || claimed.length === 0) {
        // Lost the transition race: the winner is responsible for the refund below.
        console.log('[status] stale transition already claimed by another poller');
      }
    }
  }

  // P0-1 失败零损失：任何 failed 终态都保证走一次退款（幂等，按 related_id 去重）。
  // worker 写下的 failed（例如全部片段生成失败）过去从不退款 —— 此处统一兜底，
  // 重复轮询不会二次退款；未扣费的失败任务为空操作。
  let creditsRefunded = false;
  if (effectiveStatus === 'failed') {
    try {
      await refundIfCharged(client, video.user_id, videoId);
      creditsRefunded = true;
    } catch (e) {
      console.warn('[status] refund failed:', e);
    }
  }

  const { data: clips } = await client
    .from('short_videos')
    .select('id,url,start_time,end_time,duration,highlight_title,highlight_summary,thumbnail_url,created_at')
    .eq('video_id', videoId)
    .order('created_at', { ascending: true });

  const highlights = (() => {
    try { const h = JSON.parse(video.highlights || '[]'); return Array.isArray(h) ? h : []; } catch { return []; }
  })();

  // 片段 URL → 播放状态（storage 签名 / youtu.be 时间戳页 / 失败）的判定口径集中在
  // src/lib/server/video-status.ts，与 /api/videos/batch/status 共用，避免两处漂移。
  // P0-3：传入 highlights 以回填 engagement_score / rank / hookTitle（short_videos 无对应列）。
  const normalizedClips = normalizeClipRows(
    videoId,
    clips as Array<Record<string, unknown>> | null,
    highlights as Array<{ title?: unknown; engagement_score?: unknown; start_time?: unknown }>,
  );

  const stage = stageFor(effectiveStatus, progress);
  const done = TERMINAL.has(effectiveStatus);

  return NextResponse.json({
    videoId,
    status: effectiveStatus,
    stage,
    progress: done ? 100 : progress,
    message: effectiveMessage || (() => {
      if (effectiveStatus === 'failed') return 'Processing failed. Please retry.';
      if (stage === 'ai_analysis') return 'Analyzing subtitles and timeline to find highlight moments...';
      if (stage === 'generating_clip') return `Generating highlight clips... (${doneCountMsgs(progress)})`;
      return 'Preparing your highlight clips...';
    })(),
    title: video.title || null,
    duration: video.duration || 0,
    highlights,
    clips: normalizedClips,
    error: effectiveStatus === 'failed' ? effectiveMessage : null,
    creditsRefunded,
    done,
  });
}

function doneCountMsgs(progress: number): string {
  const n = Math.min(10, Math.floor((progress - 45) / 5) + 1);
  return `${n}/10`;
}