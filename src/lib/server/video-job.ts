import { createClient, SupabaseClient } from '@supabase/supabase-js';
import videoClipper from '@/lib/server/video-clipper';
import { enqueueJob, type VideoJobMessage } from '@/lib/server/video-queue';
import { CREDIT_COST, refundIfCharged } from '@/lib/server/video-refund';
import { readTrialAnalysis } from '@/lib/server/guest-trial';
import { resolveEffectivePlan } from '@/lib/server/effective-plan';
import { pumpUserQueue } from '@/lib/server/video-batch-queue';
import { TERMINAL_VIDEO_STATUSES, BATCH_KICK_MIN_AGE_MS } from '@/lib/video-batch';
import {
  hasQuotaCrossed,
  isLegacyPaidRow,
  planQuota,
  quotaResetDescription,
  quotaTransactionType,
  resetBoundary,
} from '@/lib/plan-credits';

/**
 * Async video-job engine (QStash worker + inline `after()` fallback).
 *
 * One job = one video the user submitted. It is split into micro-tasks:
 *   - step "analyze": run LLM highlight analysis once, persist highlights, then
 *     enqueue one "clip" micro-task per highlight.
 *   - step "clip": produce exactly ONE short clip (bounded, well under the
 *     function timeout) and persist it.
 *
 * Every step updates the `videos` row (status / progress / error_message / updated_at)
 * so the frontend can poll a durable status endpoint. Terminal states are explicit
 * (completed / partial / link_only_completed / failed) — there is never an indefinite
 * "processing" hang: failures are written as `failed` + `error_message`.
 */

// 终态集合的唯一来源在 src/lib/video-batch.ts（批量队列 / 状态路由共用同一口径）
const TERMINAL = new Set<string>(TERMINAL_VIDEO_STATUSES);

/**
 * 管理员豁免（跳过额度检查与扣费）。
 *
 * 旧实现是 `ADMIN_EMAILS.has(video.user_id)` —— 拿 **UUID** 去比 **邮箱**，且 `'demo-admin-id'`
 * 也不是真实 UUID，因此生产里任何真实管理员都会按普通用户计费：免费档日额度
 * 60 = CREDIT_COST 意味着管理员**每天只能出 1 条视频**，第 2 条被 "Insufficient credits" 卡掉。
 * 改为查库 role，与 recap-studio / export-all / cut-clip 等全站门控一致。
 */
export async function isAdminUser(client: SupabaseClient, userId: string): Promise<boolean> {
  if (userId === 'demo-admin-id') return true;
  try {
    const { data } = await client.from('users').select('role').eq('id', userId).maybeSingle();
    return data?.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * 清晰度分层（server-authoritative）。
 *
 * 「清晰度不够」的根因：clipping 管线把源流高度硬编码成 360p，再靠下载时二次放大，
 * 放大不出细节。改为在**生成阶段**按套餐解析源流上限，让成片本身就是对应的清晰度：
 *   - 免费     → 720p
 *   - Starter  → 1080p
 *   - Pro      → 2160p（源不支持时自动落到最佳可用）
 *   - 管理员   → 2160p（最高）
 *
 * 高度只在这里裁定，**绝不接受客户端传入**（否则免费用户改请求体即可拿 4K）。
 */
export interface QualityTier {
  maxHeight: number;
  crf: number;
  label: '720p' | '1080p' | '4K';
}

export async function resolveQualityTier(client: SupabaseClient, userId: string): Promise<QualityTier> {
  try {
    if (await isAdminUser(client, userId)) return { maxHeight: 2160, crf: 18, label: '4K' };
    const ent = await resolveEffectivePlan(userId);
    if (ent.plan === 'pro') return { maxHeight: 2160, crf: 18, label: '4K' };
    if (ent.plan === 'starter') return { maxHeight: 1080, crf: 20, label: '1080p' };
  } catch (e) {
    console.warn('[video-job] resolveQualityTier failed, defaulting to 720p:', e instanceof Error ? e.message.slice(0, 160) : e);
  }
  return { maxHeight: 720, crf: 23, label: '720p' };
}

function getServiceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { timeout: 120000 },
  });
}

// 额度定义已统一到 @/lib/plan-credits（server + client 共用同一份，避免 UI 与库不一致）。
// 免费档 60/日（= 1 次生成）；Starter 6,000/月；Pro 20,000/月，UTC 月初重置不结转。

function recommendClipCount(duration: number) {
  const safe = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const guess = Math.round(safe / 60);
  return Math.max(5, Math.min(10, guess));
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '').trim();
      return /^[a-zA-Z0-9_-]{7,15}$/.test(id) ? id : null;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{7,15}$/.test(v)) return v;
      const m = u.pathname.match(/\/(?:embed|shorts)\/([a-zA-Z0-9_-]{7,15})/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

function youTubeTimestampUrl(videoId: string, startTime: number): string {
  return `https://youtu.be/${videoId}?t=${Math.max(0, Math.floor(startTime))}s`;
}

function youTubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

export interface Highlight {
  title: string;
  start_time: number;
  end_time: number;
  summary: string;
  engagement_score: number;
}

function parseHighlights(raw: string | null | undefined): Highlight[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Highlight[]) : [];
  } catch {
    return [];
  }
}

/**
 * 按用户当前计费周期对账余额，并返回它。
 *
 *  - 免费档：60/日（UTC 日界重置）
 *  - Starter：6,000/月，Pro：20,000/月（UTC 月界重置，不结转）
 *  - 存量旧付费订阅（cutover 前售出、未记录 `current_period_end`）：沿用旧**日**额度，
 *    直到 LEGACY_DAILY_SUNSET，避免静默削弱已售承诺
 *
 * 余额一律以服务端为准；调用方负责管理员豁免（见 isAdminUser）。
 */
export async function ensureCreditsAndCheck(client: SupabaseClient, userId: string): Promise<number> {
  const now = new Date();
  const { data: planRow } = await client
    .from('subscriptions')
    .select('plan_type, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();
  const plan = planRow?.plan_type ?? null;
  const legacyPaid = isLegacyPaidRow(
    plan,
    (planRow as { current_period_end?: string | null } | null)?.current_period_end ?? null,
    now,
  );
  const quota = planQuota(plan, { legacyPaid });
  const resetAt = resetBoundary(quota.period, now);
  const txType = quotaTransactionType(quota.period);

  const { data: creditsRow } = await client.from('credits').select('*').eq('user_id', userId).maybeSingle();

  if (!creditsRow) {
    await client.from('credits').insert({ user_id: userId, balance: quota.amount, last_reset_at: resetAt });
    await client.from('credit_transactions').insert({
      user_id: userId,
      amount: quota.amount,
      type: txType,
      description: quotaResetDescription(plan, quota, true),
    });
    return quota.amount;
  }

  if (hasQuotaCrossed(quota.period, creditsRow.last_reset_at, now)) {
    await client.from('credits').update({ balance: quota.amount, last_reset_at: resetAt }).eq('user_id', userId);
    await client.from('credit_transactions').insert({
      user_id: userId,
      amount: quota.amount,
      type: txType,
      description: quotaResetDescription(plan, quota),
    });
    return quota.amount;
  }

  return creditsRow.balance ?? 0;
}

/** Idempotent credit deduction keyed by related_id=videoId. */
async function deductCreditsOnce(client: SupabaseClient, userId: string, videoId: string): Promise<void> {
  // Already deducted for this video? skip.
  const { data: existing } = await client
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'video_process')
    .eq('related_id', videoId)
    .limit(1);
  if (existing && existing.length > 0) return;
  const { data: creditsRow } = await client.from('credits').select('balance').eq('user_id', userId).maybeSingle();
  const balance = creditsRow?.balance ?? 0;
  if (balance >= CREDIT_COST) {
    await client.from('credits').update({ balance: balance - CREDIT_COST }).eq('user_id', userId);
    await client.from('credit_transactions').insert({
      user_id: userId,
      amount: -CREDIT_COST,
      type: 'video_process',
      description: 'Video processing',
      related_id: videoId,
    });
  }
}

async function setVideo(client: SupabaseClient, videoId: string, patch: Record<string, unknown>) {
  const { error } = await client.from('videos').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', videoId);
  if (error) console.warn('[video-job] setVideo update failed:', error.message);
}

// ---------------------------------------------------------------------------
// Clipboard:  produce one playable short clip for a highlight. Returns
// url/thumbnail or marks it link_only where a YouTube timestamp is available.
// ---------------------------------------------------------------------------
interface ClipArtifact {
  url: string;
  thumbnail: string;
  linkOnly: boolean;
  isFallback?: boolean;
  duration: number;
}
interface AnalyzedClip {
  artifact: ClipArtifact | null;
  duration: number;
}

const CLIPS_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'uploads';

/**
 * Persist a generated clip so it can be played/downloaded long after the Vercel
 * Lambda that created it has been recycled (its /tmp file is gone).
 *
 * In production `createLocalClip` returns a `data:video/mp4;base64,...` URL. The
 * DB `short_videos.url` column is varchar(1000) and cannot hold the ~MBs base64,
 * so we upload the raw bytes to Supabase Storage and return a short-lived signed
 * URL instead. A `data-url:${clipKey}` placeholder (previously stored) is NOT a
 * real URL — the front end cannot play it, so we must never persist it.
 *
 * Returns an absolute https URL (signed) when upload succeeds; otherwise falls
 * back to whatever the artifact gave us (transparent for link_only / http URLs).
 */
async function persistClip(
  client: SupabaseClient,
  userId: string,
  clipKey: string,
  artifact: ClipArtifact,
): Promise<string> {
  const { url, linkOnly } = artifact;

  // link_only / already-http URLs pass straight through.
  if (linkOnly) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  // Only handle inline base64 data URLs here.
  const m = /^data:video\/mp4;base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!m || !m[1]) {
    // Unknown shape (e.g. publicUrl relative path) — return as-is.
    return url;
  }

  try {
    const buf = Buffer.from(m[1], 'base64');
    const objectPath = `users/${userId}/clips/${clipKey}.mp4`;
    const { error: upErr } = await client.storage.from(CLIPS_BUCKET).upload(objectPath, buf, {
      contentType: 'video/mp4',
      cacheControl: '3600',
      upsert: true,
    });
    if (upErr) throw new Error(upErr.message);
    const { data: signed, error: signErr } = await client.storage
      .from(CLIPS_BUCKET)
      .createSignedUrl(objectPath, 60 * 60 * 24 * 7); // 7 days
    if (signErr || !signed?.signedUrl) throw new Error(signErr?.message || 'sign failed');
    console.log(`[video-job] persisted clip ${clipKey}: ${buf.length} bytes -> ${signed.signedUrl.slice(0, 90)}`);
    return signed.signedUrl;
  } catch (e) {
    console.warn('[video-job] persistClip upload failed (storing raw url):', e instanceof Error ? e.message : e);
    return url;
  }
}

export async function produceClip(
  videoUrl: string,
  highlight: Highlight,
  params: {
    preResolvedStreamUrl?: string;
    preResolvedMetadata?: Record<string, unknown>;
    /** 源流清晰度上限（按套餐裁定，见 resolveQualityTier）。 */
    maxHeight?: number;
    /** 目标 CRF（越低越清晰、体积越大）。 */
    crf?: number;
  },
): Promise<AnalyzedClip> {
  const rawStart = Math.max(0, Number.isFinite(highlight.start_time) ? highlight.start_time : 0);
  const rawEnd = Math.max(0, Number.isFinite(highlight.end_time) ? highlight.end_time : rawStart + 60);
  const start = rawStart;
  const end = Math.max(rawStart + 1, rawEnd);
  const duration = Math.max(1, Math.round(end - start));
  const ytId = extractYouTubeId(videoUrl);

  // YouTube: always attempt a real server-side clip via createClipFromYouTubeStream.
  // That helper self-resolves the stream (pre-resolved streamUrl is the first/fastest
  // candidate; otherwise it falls back to CF Worker / Invidious / yt-dlp). Only when
  // it returns null do we degrade to a link_only timestamp placeholder.
  if (ytId) {
    try {
      const clip = await videoClipper.createClipFromYouTubeStream({
        videoId: ytId,
        title: highlight.title,
        summary: highlight.summary,
        startTime: start,
        endTime: end,
        fastCopy: true,
        ...(params.maxHeight ? { maxHeight: params.maxHeight } : {}),
        ...(params.crf ? { crf: params.crf } : {}),
        ...(params.preResolvedStreamUrl
          ? { preResolvedStreamUrl: params.preResolvedStreamUrl, preResolvedMetadata: params.preResolvedMetadata as never }
          : {}),
      });
      const clipUrl = clip?.dataUrl || clip?.publicUrl || '';
      if (clip && clipUrl) {
        return {
          artifact: {
            url: clipUrl,
            thumbnail: clip.thumbnailUrl || youTubeThumbnailUrl(ytId),
            linkOnly: false,
            duration,
          },
          duration,
        };
      }
      console.warn('[video-job] youtube clip produced no url, falling to link_only');
    } catch (e) {
      console.warn('[video-job] youtube clip generation failed, falling to link_only:', e instanceof Error ? e.message.slice(0, 120) : e);
    }
    // Link-only fallback: deterministic timestamp link + thumbnail. Always available.
    return {
      artifact: {
        url: youTubeTimestampUrl(ytId, start),
        thumbnail: youTubeThumbnailUrl(ytId),
        linkOnly: true,
        duration,
      },
      duration,
    };
  }

  // Non-YouTube (Bilibili / hosted upload): download + local cut.
  try {
    const source = await videoClipper.downloadSourceVideo(videoUrl, { forceMaxHeight: params.maxHeight || 720 });
    if (!source?.inputPath) throw new Error('download returned no file');
    const result = await videoClipper.createLocalClip({
      inputPath: source.inputPath,
      startTime: start,
      endTime: end,
      title: highlight.title,
      fastCopy: true,
      ...(params.maxHeight ? { targetHeight: params.maxHeight } : {}),
      ...(params.crf ? { crf: params.crf } : {}),
    });
    if (!result?.dataUrl && !result?.publicUrl) throw new Error('clip produced no url');
    return {
      artifact: { url: result.dataUrl || result.publicUrl, thumbnail: result.thumbnailUrl || '', linkOnly: false, duration },
      duration,
    };
  } catch (e) {
    console.warn('[video-job] clip generation failed:', e instanceof Error ? e.message.slice(0, 120) : e);
    return { artifact: null, duration };
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
async function runAnalyze(client: SupabaseClient, msg: VideoJobMessage): Promise<void> {
  const { videoId, userId, videoUrl } = msg;
  const { data: video } = await client.from('videos').select('id,status,user_id,source_type').eq('id', videoId).maybeSingle();
  if (!video) { console.warn('[video-job] analyze: video not found', videoId); return; }
  if (TERMINAL.has(video.status)) { console.log('[video-job] analyze: already terminal, skip', videoId, video.status); return; }

  // Atomic claim: exactly one analyze run may proceed. The UPDATE matches only
  // while progress is still 0, so a duplicate delivery (double worker kick,
  // QStash retry) loses the race and exits instead of double-generating clips.
  const { data: claimed } = await client
    .from('videos')
    .update({ status: 'processing', progress: 10, error_message: null, updated_at: new Date().toISOString() })
    .eq('id', videoId)
    .eq('progress', 0)
    .select('id')
    .maybeSingle();
  if (!claimed) {
    console.log('[video-job] analyze: another run already claimed this job, skip', videoId);
    return;
  }

  // P0-2 免登录试跑：注册后继承试跑时已算好的分析结果（<24h 且 URL 匹配），
  // 跳过 LLM 分析，避免用户「白等一次」。任何校验失败一律静默回落正常分析。
  let analysis: Awaited<ReturnType<typeof videoClipper.analyzeVideo>> | undefined;
  if (msg.trialId) {
    try {
      const reused = await readTrialAnalysis(msg.trialId, videoUrl);
      if (reused) {
        analysis = { duration: reused.duration, title: reused.title, highlights: reused.highlights };
        console.log('[video-job] analyze: reused trial analysis, skipping LLM', msg.trialId);
      }
    } catch (e) {
      console.warn('[video-job] trial reuse failed (falling back):', e instanceof Error ? e.message : e);
    }
  }
  if (!analysis) {
    try {
      // Shorts 成片走「多而短」：clipTargetSeconds 透传到分析器，决定每条高光的窗口长度。
      analysis = await videoClipper.analyzeVideo(videoUrl, { targetSeconds: msg.clipTargetSeconds });
    } catch (e) {
      await setVideo(client, videoId, { status: 'failed', progress: 0, error_message: (e instanceof Error ? e.message : 'AI analysis failed.') });
      // P0-1 失败零损失：失败的终态一律走一次幂等退款（此处通常尚未扣费，属空操作，仅统一不变式）。
      await refundIfCharged(client, userId, videoId).catch((err) =>
        console.warn('[video-job] analyze-failure refund failed:', err instanceof Error ? err.message : err),
      );
      return;
    }
  }

  // Honor the caller's requested clip count (e.g. Shorts 成片 asks for 3).
  // Without an explicit count keep the legacy behavior (up to 10).
  // The analyzer always emits highlights in chronological order, so sample
  // evenly instead of taking the first N — the degraded (offline/LLM-less)
  // analyzer emits evenly spaced candidates, and first-N would be intro-biased.
  const allHighlights = analysis.highlights as Highlight[];
  const requestedCount = clampInt(msg.desiredClipCount, 1, 12, 0);
  const highlights =
    requestedCount > 0 && allHighlights.length > requestedCount
      ? Array.from({ length: requestedCount }, (_, i) => allHighlights[Math.floor((i * allHighlights.length) / requestedCount)])
      : allHighlights.slice(0, 12);
  if (highlights.length === 0) {
    await setVideo(client, videoId, { status: 'failed', progress: 0, error_message: 'No highlight moments found. Try another video.' });
    // P0-1 失败零损失：见上。失败终态保证用户积分分文未损。
    await refundIfCharged(client, userId, videoId).catch((err) =>
      console.warn('[video-job] no-highlight refund failed:', err instanceof Error ? err.message : err),
    );
    return;
  }

  // Auth / credits are checked once during the analyze step (analogous to the
  // old synchronous route's pre-flight gate). Admins skip it (role lookup — see isAdminUser).
  if (!(await isAdminUser(client, userId))) {
    const balance = await ensureCreditsAndCheck(client, userId);
    if (balance < CREDIT_COST) {
      await setVideo(client, videoId, { status: 'failed', progress: 0, error_message: `Insufficient credits. You need at least ${CREDIT_COST} credits.` });
      return;
    }
  }

  await setVideo(client, videoId, {
    status: 'processing',
    progress: 45,
    title: analysis.title || 'Video',
    duration: analysis.duration || 0,
    highlights: JSON.stringify(highlights),
    error_message: null,
  });

  // Enqueue one micro-task per highlight (or run inline for the fallback dev mode).
  const desiredCount = clampInt(msg.desiredClipCount, 1, 12, 0) || recommendClipCount(analysis.duration || 0);
  for (let i = 0; i < highlights.length; i += 1) {
    const clipMsg: VideoJobMessage = {
      step: 'clip',
      videoId,
      userId,
      videoUrl,
      sourceType: msg.sourceType,
      quality: msg.quality,
      locale: msg.locale,
      streamUrl: msg.streamUrl,
      streamMetadata: msg.streamMetadata,
      index: i,
      desiredClipCount: desiredCount,
      clipTargetSeconds: msg.clipTargetSeconds,
    };
    // Durable queue → real micro-task. No queue → run inline sequentially.
    const queued = await enqueueJob(clipMsg);
    if (!queued) {
      await runClip(client, clipMsg).catch((e) =>
        console.warn(`[video-job] inline clip ${i} failed:`, e instanceof Error ? e.message : e),
      );
    }
  }
}

async function runClip(client: SupabaseClient, msg: VideoJobMessage): Promise<void> {
  const { videoId, userId, videoUrl, index } = msg;
  const { data: video } = await client.from('videos').select('id,status,highlights,duration,user_id,progress').eq('id', videoId).maybeSingle();
  if (!video || !video.highlights) { console.warn('[video-job] clip: video missing highlights', videoId); return; }
  const highlights = parseHighlights(video.highlights);
  if (!highlights.length) return;
  const idx = clampInt(index, 0, highlights.length - 1, 0);
  const highlight = highlights[idx];
  if (!highlight) return;
  // Idempotency: if already terminal, do not touch anything.
  if (TERMINAL.has(video.status)) { console.log('[video-job] clip: video terminal, skip', videoId, video.status); return; }

  await setVideo(client, videoId, { status: 'processing', progress: Math.max(45, video.progress ?? 45), error_message: null });

  const preResolvedStreamUrl = msg.streamUrl;
  const preResolvedMetadata = msg.streamMetadata as Record<string, unknown> | undefined;
  // 清晰度分层：按订阅/角色裁定源流上限（免费 720 / Starter 1080 / Pro·管理员 2160）。
  const tier = await resolveQualityTier(client, userId);
  const { artifact, duration: clipDuration } = await produceClip(videoUrl, highlight, {
    preResolvedStreamUrl,
    preResolvedMetadata,
    maxHeight: tier.maxHeight,
    crf: tier.crf,
  });

  // Persist the short clip (idempotent per index). Remove any prior row for this
  // index — legacy rows may hold either a `data-url:${clipKey}` placeholder or a
  // signed Storage URL ending in `${clipKey}.mp4`, so remove both patterns.
  const clipKey = `${videoId}-clip-${idx}`;
  await client.from('short_videos').delete().eq('video_id', videoId).like('url', `%${clipKey}%`);

  // In production the clip is a base64 data URL that must be uploaded to Storage;
  // persistClip turns it into a playable signed https URL (or passes through
  // link_only / already-http URLs unchanged).
  let dbUrl: string | null = null;
  if (artifact) {
    dbUrl = await persistClip(client, userId, clipKey, artifact);
  }

  if (artifact && dbUrl) {
    await client.from('short_videos').insert({
      video_id: videoId,
      user_id: userId,
      url: dbUrl,
      start_time: highlight.start_time,
      end_time: highlight.end_time,
      duration: artifact.duration || clipDuration,
      highlight_title: highlight.title,
      highlight_summary: highlight.summary,
      thumbnail_url: artifact.thumbnail,
    });
  }

  // Recompute progress + decide terminal state.
  const { data: rows } = await client.from('short_videos').select('id').eq('video_id', videoId).limit(1000);
  const total = highlights.length;
  const doneCount = rows?.length ?? 0;
  const finished = doneCount >= total;
  const progress = finished ? 100 : Math.max(45, Math.min(99, 45 + Math.floor((doneCount / Math.max(1, total)) * 50)));

  if (finished) {
    const { data: clips } = await client.from('short_videos').select('url').eq('video_id', videoId);
    const playable = (clips ?? []).filter((c) => !!c.url && !(c.url?.includes('data-url:') && c.url?.endsWith('.youtu')));
    const allLinkOnly = playable.every((c) => c.url && (c.url.startsWith('https://youtu.be/') || c.url.includes('youtu.be/')) && playable.length === (clips?.length ?? 0));
    let finalStatus: string;
    if (playable.length === 0) {
      finalStatus = 'failed';
    } else if (allLinkOnly) {
      // all clips are just timestamp links (video download blocked upstream)
      finalStatus = 'link_only_completed';
    } else if (playable.length === total) {
      finalStatus = 'completed';
    } else {
      finalStatus = 'partial';
    }
    const errMsg = finalStatus === 'failed' ? 'All highlight clips failed to generate. Please retry or try a different video.' : null;
    await setVideo(client, videoId, { status: finalStatus, progress: 100, error_message: errMsg });

    // P0-1 失败零损失：
    //   - 失败终态**不扣费**，并退还此前可能已产生的扣费（幂等，按 related_id 去重）。
    //     旧实现无条件扣费且失败路径从不退款 —— failed 属于终态，status 路由的
    //     STALE 分支不会再触发，用户会被永久扣掉 60 积分。
    //   - 非失败终态才扣费（首次终态转移，幂等）。Admins 豁免（role 查询，见 isAdminUser）。
    if (finalStatus === 'failed') {
      try { await refundIfCharged(client, userId, videoId); }
      catch (e) { console.warn('[video-job] refund failed:', e instanceof Error ? e.message : e); }
    } else {
      const isAdmin = await isAdminUser(client, userId);
      if (!isAdmin && !video.user_id?.startsWith('demo-')) {
        try { await deductCreditsOnce(client, userId, videoId); } catch (e) { console.warn('[video-job] deduct failed:', e); }
      }
    }

    // 批量队列自续航：本条进终态后把同一用户的队列继续排空（用户关掉页面也能继续）。
    // 队列身份 = 该用户 videos 表中的非终态行，因此这里不需要知道批次是谁。
    // best-effort：排队失败绝不影响本条视频的出片结果。
    try {
      const pump = await pumpUserQueue(client, userId, { minAgeMs: BATCH_KICK_MIN_AGE_MS });
      if (pump.started.length > 0) console.log('[video-job] batch pump started:', pump.started.join(','));
    } catch (e) {
      console.warn('[video-job] batch pump failed (non-fatal):', e instanceof Error ? e.message.slice(0, 160) : e);
    }
  } else {
    await setVideo(client, videoId, { status: 'processing', progress });
  }
}

/** Single entry point for the worker / inline fallback. */
export async function runVideoJob(msg: VideoJobMessage): Promise<void> {
  const client = getServiceRoleClient();
  if (!client) throw new Error('Supabase service role not configured');
  try {
    if (msg.step === 'analyze') await runAnalyze(client, msg);
    else await runClip(client, msg);
  } finally {
    // service role client is short-lived; nothing to release
  }
}