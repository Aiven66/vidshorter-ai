import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, getSupabaseClient } from '@/storage/database/supabase-client';
import { enqueueJob, workerWebhookUrl, type VideoJobMessage } from '@/lib/server/video-queue';
import { runVideoJob } from '@/lib/server/video-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Async video-processing submit endpoint.
 *
 * Unlike the legacy thin SSE route (/api/process-video), this returns 200
 * immediately after creating a `videos` row + enqueuing the analysis micro-task.
 * The client then polls /api/videos/process/status for durable progress.
 * Each highlight is rendered as its own queued micro-task, so a single long
 * function timeout can no longer kill the whole job.
 */

function isHttpUrl(v: string) {
  try {
    const u = new URL(v);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const sourceType = typeof body.sourceType === 'string' ? body.sourceType.trim() || 'url' : 'url';
  const quality = body.quality === 'hd' ? 'hd' : 'sd';
  const locale = typeof body.locale === 'string' ? body.locale.slice(0, 10) : undefined;
  const streamUrl = typeof body.streamUrl === 'string' ? body.streamUrl.trim() : undefined;
  const streamMetadata = body.streamMetadata && typeof body.streamMetadata === 'object' ? body.streamMetadata as Record<string, unknown> : undefined;
  const desiredClipCount = typeof body.desiredClipCount === 'number' ? Math.max(1, Math.min(10, Math.floor(body.desiredClipCount))) : undefined;

  if (!videoUrl) return NextResponse.json({ error: 'Missing video URL' }, { status: 400 });
  if (!isHttpUrl(videoUrl)) return NextResponse.json({ error: 'Please provide a valid http(s) video URL' }, { status: 400 });

  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const supabaseMode = isSupabaseConfigured() && !!bearerToken && !userId.startsWith('demo-');
  if (!userId && !(supabaseMode)) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const client = serviceRoleClient();
  if (!client) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  // Resolve the real user server-side from the bearer token. Never trust the
  // client-supplied userId — demo ids (`demo-*`) and stale ids violate the
  // `videos_user_id_fkey` foreign key and caused opaque 500s.
  let jobUserId = userId;
  let bearerResolved = false;
  if (bearerToken) {
    try {
      const userClient = getSupabaseClient(bearerToken);
      const { data: { user: authUser }, error: authErr } = await userClient.auth.getUser();
      if (!authErr && authUser?.id) {
        bearerResolved = true;
        jobUserId = authUser.id;
        // Google OAuth / raced signups can land in auth.users without a
        // public.users profile row — the videos FK then fails. Self-heal it.
        const { data: profile } = await client
          .from('users')
          .select('id')
          .eq('id', jobUserId)
          .maybeSingle();
        if (!profile) {
          await client
            .from('users')
            .upsert(
              {
                id: jobUserId,
                email: authUser.email ?? '',
                name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
                role: 'user',
                avatar_url: authUser.user_metadata?.avatar_url ?? null,
                google_id: authUser.app_metadata?.provider === 'google' ? authUser.id : null,
              },
              { onConflict: 'id', ignoreDuplicates: true },
            );
        }
      }
    } catch (e) {
      console.error('[videos/process] auth resolution failed:', e instanceof Error ? e.message : e);
    }
  }

  // 401 semantics:
  //  - A request carrying a bearer token MUST resolve to a real Supabase user.
  //    If `bearerResolved` is false the token is expired/invalid → hard
  //    `auth_expired`. Never silently fall back to the client-supplied userId:
  //    that both reproduced "Your session has expired" 401s and trusted the
  //    client with a spoofable id.
  //  - A request WITHOUT a token may only proceed with a valid UUID userId
  //    (desktop/local cookie flows) — anything else is also `auth_expired`.
  if (bearerToken && !bearerResolved) {
    return NextResponse.json(
      { error: 'Please sign in again to process videos (your session expired).', code: 'auth_expired' },
      { status: 401 },
    );
  }
  if (!bearerToken && !UUID_RE.test(jobUserId)) {
    return NextResponse.json(
      { error: 'Please sign in again to process videos (your session expired).', code: 'auth_expired' },
      { status: 401 },
    );
  }

  // Without a UUID-shaped user id we cannot create the durable job row
  // (FK constraint) — return a clear, actionable error instead of a 500.
  if (!UUID_RE.test(jobUserId)) {
    return NextResponse.json(
      { error: 'Please sign in again to process videos (your session expired).', code: 'auth_expired' },
      { status: 401 },
    );
  }

  // Create the video job row (durable status source).
  const { data: video, error } = await client
    .from('videos')
    .insert({
      user_id: jobUserId,
      original_url: videoUrl,
      source_type: sourceType,
      status: 'processing',
      progress: 0,
      error_message: null,
    })
    .select('id')
    .single();

  if (error || !video) {
    console.error('[videos/process] failed to create video row:', error?.message);
    return NextResponse.json(
      { error: 'Failed to create processing job', detail: error?.message || 'unknown db error' },
      { status: 500 },
    );
  }
  const videoId = String(video.id);

  const jobMsg: VideoJobMessage = {
    step: 'analyze',
    videoId,
    userId: jobUserId,
    videoUrl,
    sourceType,
    quality: quality as VideoJobMessage['quality'],
    locale,
    ...(streamUrl ? { streamUrl } : {}),
    ...(streamMetadata ? { streamMetadata } : {}),
    ...(desiredClipCount ? { desiredClipCount } : {}),
  };

  const queued = await enqueueJob(jobMsg);
  if (!queued) {
    // QStash not configured. `after()` callbacks do not execute on Vercel
    // serverless (verified in production: the callback never runs), so kick
    // the worker via an internal HTTP self-call instead — the worker runs as
    // its own function invocation and completes independently of this request.
    // Local dev keeps the direct inline call (no network round-trip needed).
    if (process.env.VERCEL === '1' && workerWebhookUrl().startsWith('https://')) {
      void fetch(workerWebhookUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobMsg),
      }).catch((e) => console.error('[videos/process] worker kick failed:', e instanceof Error ? e.message : e));
      // Give the outgoing request time to flush before this function returns;
      // Vercel freezes the instance right after the response is sent.
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      runVideoJob(jobMsg).catch((e) =>
        console.error('[videos/process] inline analyze failed:', e instanceof Error ? e.message : e),
      );
    }
  }

  return NextResponse.json({ ok: true, videoId, queued }, { status: 200 });
}