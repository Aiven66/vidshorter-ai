import { NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import videoClipper from '@/lib/server/video-clipper';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const IS_VERCEL = !!process.env.VERCEL;

interface ProcessVideoRequest {
  videoUrl?: string;
  userId?: string;
  sourceType?: string;
  highlights?: Highlight[];
  duration?: number;
  title?: string;
  desiredClipCount?: number;
  clipOffset?: number;
  clipLimit?: number;
  jobId?: string;
  videoId?: string;
  quality?: 'sd' | 'hd';
  // Pre-resolved stream URL from CF Worker /resolve (obtained by frontend).
  // When provided, Vercel uses it directly with CF Worker /stream fast path,
  // avoiding the need to call CF Worker /resolve from Vercel (which fails
  // intermittently due to YouTube rate-limiting Vercel's CF colo).
  streamUrl?: string;
  streamMetadata?: {
    userAgent?: string;
    visitorData?: string;
    xClientName?: number;
    clientVersion?: string;
    client?: string;
    audioUrl?: string;
  };
}

interface Highlight {
  title: string;
  start_time: number;
  end_time: number;
  summary: string;
  engagement_score: number;
}

interface ClipResult {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  summary: string;
  engagementScore: number;
  thumbnailUrl: string;
  videoUrl: string | null;   // data URL (preferred) or serve-clip URL
  status: 'processing' | 'completed' | 'failed' | 'link_only';
  linkOnlyUrl?: string;      // YouTube timestamp link (when video download is blocked)
  // 标记此 clip 是 fallback zoompan 视频（由静态缩略图 + zoompan 滤镜生成），
  // 不是真实视频。前端可以通过这个标记识别需要重新生成的 clip。
  isFallback?: boolean;
}

interface SSEMessage {
  stage: string;
  progress: number;
  message: string;
  data?: Record<string, unknown>;
}

const sseEncoder = new TextEncoder();

function sendSSE(controller: ReadableStreamDefaultController<Uint8Array>, payload: SSEMessage) {
  try {
    controller.enqueue(sseEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    return true;
  } catch {
    return false;
  }
}

function promiseWithTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error(message)), { once: true });
    }),
  ]).finally(() => clearTimeout(timeoutId));
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function recommendClipCount(duration: number) {
  const safe = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const guess = Math.round(safe / 90);
  return Math.max(3, Math.min(10, guess));
}

function isValidVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function hasPlayableUrl(clip: ClipResult): clip is ClipResult & { videoUrl: string } {
  return clip.status === 'completed' && typeof clip.videoUrl === 'string' && clip.videoUrl.length > 0;
}

function isLinkOnlyClip(clip: ClipResult): clip is ClipResult & { linkOnlyUrl: string } {
  return clip.status === 'link_only' && typeof clip.linkOnlyUrl === 'string' && clip.linkOnlyUrl.length > 0;
}

function extractYouTubeId(url: string): string | null {
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

function buildYouTubeTimestampUrl(videoId: string, startTime: number): string {
  const t = Math.max(0, Math.floor(startTime));
  return `https://youtu.be/${videoId}?t=${t}s`;
}

function buildYouTubeThumbnailUrl(videoId: string): string {
  // maxresdefault may not exist for all videos; frontend falls back to hqdefault
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// Number of clips to generate per batch. On Vercel, 3 clips per batch balances
// quality (multiple highlights) with the 300s function timeout (~60-90s per HD clip).
// Was 1 (only 1 clip per batch — users had to click "generate more" repeatedly).
// Override via PROCESS_VIDEO_BATCH_SIZE env var (1-10).
const DEFAULT_BATCH_SIZE =
  clampInt(process.env.PROCESS_VIDEO_BATCH_SIZE, 1, 10, 0) ||
  (process.env.VERCEL ? 3 : 10);

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ProcessVideoRequest;
  const videoUrl = body.videoUrl?.trim();
  const requestedUserId = body.userId?.trim();
  const sourceType = body.sourceType?.trim() || 'url';
  const jobId = body.jobId?.trim() || `job-${Date.now()}`;
  const isContinuation = !!body.jobId?.trim();
  const clipOffset = clampInt(body.clipOffset, 0, 10_000, 0);
  const clipLimitFromRequest = clampInt(body.clipLimit, 1, 10, 0);
  const desiredClipCountFromRequest = clampInt(body.desiredClipCount, 1, 10, 0);
  const suppliedHighlights = Array.isArray(body.highlights) ? (body.highlights as Highlight[]) : null;
  const suppliedDuration = clampInt(body.duration, 0, 100_000, 0);
  const suppliedTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const suppliedVideoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
  const quality = body.quality === 'hd' ? 'hd' : 'sd';
  // Pre-resolved stream URL from frontend (CF Worker /resolve).
  // When provided, createClipFromYouTubeStream uses it directly with /stream fast path.
  const preResolvedStreamUrl = typeof body.streamUrl === 'string' ? body.streamUrl.trim() : '';
  const preResolvedMetadata = body.streamMetadata && typeof body.streamMetadata === 'object' ? body.streamMetadata : undefined;
  const abortSignal = request.signal;
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  if (!videoUrl) {
    return new Response(JSON.stringify({ error: 'Missing video URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isValidVideoUrl(videoUrl)) {
    return new Response(JSON.stringify({ error: 'Please provide a valid http(s) video URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!requestedUserId && !(isSupabaseConfigured() && bearerToken)) {
    return new Response(JSON.stringify({ error: 'Missing userId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let lastSsePayload: SSEMessage | null = null;
      const send = (payload: SSEMessage) => {
        lastSsePayload = payload;
        return sendSSE(controller, payload);
      };
      const heartbeat = setInterval(() => {
        if (abortSignal.aborted) return;
        try {
          controller.enqueue(sseEncoder.encode(':\n\n'));
        } catch {}
      }, 15_000);

      try {
        const isSupabaseMode = isSupabaseConfigured() && !!bearerToken && !requestedUserId?.startsWith('demo-');
        let userId = requestedUserId || '';
        let userRole = userId === 'demo-admin-id' ? 'admin' : 'user';
        let supabaseClient: SupabaseClient | null = null;

        const planDailyCredits = (planType: string | null | undefined) => {
          if (planType === 'starter') return 500;
          if (planType === 'pro') return 1_000_000;
          return 100;
        };

        const utcMidnightIso = (now: Date) => new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          0,
          0,
          0,
          0,
        )).toISOString();

        const shouldResetUtc = (lastResetAt: string) => {
          const last = new Date(lastResetAt);
          const now = new Date();
          return (
            now.getUTCFullYear() !== last.getUTCFullYear()
            || now.getUTCMonth() !== last.getUTCMonth()
            || now.getUTCDate() !== last.getUTCDate()
          );
        };

        if (isSupabaseMode) {
          const { getSupabaseClient } = await import('@/storage/database/supabase-client');
          const client = getSupabaseClient(bearerToken);
          supabaseClient = client;
          const { data: { user }, error } = await client.auth.getUser();
          if (error || !user?.id) {
            send({
              stage: 'error',
              progress: 0,
              message: 'Authentication required. Please log in again.',
              data: { error: true },
            });
            clearInterval(heartbeat);
            return;
          }
          userId = user.id;
          const { data: profile } = await client
            .from('users')
            .select('role')
            .eq('id', userId)
            .maybeSingle();
          userRole = profile?.role || 'user';

          if (!isContinuation && clipOffset === 0 && userRole !== 'admin') {
            const { data: sub } = await client
              .from('subscriptions')
              .select('plan_type')
              .eq('user_id', userId)
              .maybeSingle();
            const dailyCredits = planDailyCredits(sub?.plan_type);
            const resetAt = utcMidnightIso(new Date());

            const { data: creditsRow } = await client
              .from('credits')
              .select('*')
              .eq('user_id', userId)
              .maybeSingle();

            if (!creditsRow) {
              await client.from('credits').insert({
                user_id: userId,
                balance: dailyCredits,
                last_reset_at: resetAt,
              });
            } else {
              await client
                .from('credits')
                .update({ balance: dailyCredits, last_reset_at: resetAt })
                .eq('user_id', userId);
              await client.from('credit_transactions').insert({
                user_id: userId,
                amount: dailyCredits,
                type: 'daily_reset',
                description: 'Daily credits reset',
              });
            }

            const { data: latestCredits } = await client
              .from('credits')
              .select('balance')
              .eq('user_id', userId)
              .maybeSingle();

            const currentBalance = latestCredits?.balance ?? 0;
            if (currentBalance < 60) {
              throw new Error('Insufficient credits. You need at least 60 credits.');
            }
          }
        } else if (!userId) {
          send({
            stage: 'error',
            progress: 0,
            message: 'Missing userId',
            data: { error: true },
          });
          clearInterval(heartbeat);
          return;
        }

        if (abortSignal.aborted) return;
        if (!send({
          stage: 'init',
          progress: 5,
          message: 'Initializing AutoClip-style processing...',
          data: { jobId },
        })) return;

        const isBilibili = videoUrl.includes('bilibili.com') || videoUrl.includes('b23.tv');
        if (abortSignal.aborted) return;
        if (!send({
          stage: 'ai_analysis',
          progress: 20,
          message: isBilibili
            ? 'Analyzing Bilibili video metadata and timeline...'
            : 'Analyzing subtitles and timeline to find highlight moments...',
          data: { jobId },
        })) return;

        const analysis = suppliedHighlights && suppliedHighlights.length > 0
          ? {
              duration: suppliedDuration,
              title: suppliedTitle || 'Video',
              highlights: suppliedHighlights,
            }
          : await promiseWithTimeout(
              videoClipper.analyzeVideo(videoUrl),
              180_000,
              'AI analysis timed out. Please retry or try another video.',
            );
        if (abortSignal.aborted) return;
        const recommendedCount =
          desiredClipCountFromRequest ||
          (suppliedHighlights && suppliedHighlights.length > 0 ? suppliedHighlights.length : 0) ||
          recommendClipCount(analysis.duration);
        const allHighlights = (analysis.highlights as Highlight[]).slice(0, recommendedCount);
        const remaining = Math.max(0, allHighlights.length - clipOffset);
        const batchLimit = Math.max(
          0,
          Math.min(remaining, clipLimitFromRequest || DEFAULT_BATCH_SIZE),
        );
        const highlights = allHighlights.slice(clipOffset, clipOffset + batchLimit);
        if (highlights.length === 0) {
          throw new Error('No highlights to process for the given clipOffset/clipLimit.');
        }

        let dbVideoId = suppliedVideoId || '';

        if (!dbVideoId && isSupabaseMode && clipOffset === 0) {
          try {
            const { data: video } = await supabaseClient!
              .from('videos')
              .insert({
                user_id: userId,
                original_url: videoUrl,
                source_type: sourceType,
                title: analysis.title,
                duration: analysis.duration,
                status: 'processing',
                highlights: JSON.stringify(allHighlights),
              })
              .select()
              .single();
            if (video?.id) dbVideoId = String(video.id);
          } catch {}
        }

        if (!send({
          stage: 'analysis_complete',
          progress: 45,
          message: `Found ${allHighlights.length} highlight moments in "${analysis.title}".`,
          data: {
            jobId,
            highlights: allHighlights,
            estimatedDuration: analysis.duration,
            title: analysis.title,
            clipOffset,
            clipLimit: batchLimit || DEFAULT_BATCH_SIZE,
            totalHighlights: allHighlights.length,
            recommendedClipCount: recommendedCount,
            videoId: dbVideoId || undefined,
            nextOffset: suppliedHighlights && suppliedHighlights.length > 0 ? clipOffset : 0,
            done: false,
          },
        })) return;

        if (!suppliedHighlights || suppliedHighlights.length === 0) {
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {}
          return;
        }

        const clips: ClipResult[] = [];
        let source: { inputPath: string; audioInputPath?: string; ffmpegHeaders?: string } | null = null;
        let isLinkOnlyMode = false;
        let linkOnlyVideoId: string | null = null;

        if (abortSignal.aborted) return;
        if (!send({
          stage: 'generating_clip',
          progress: 46,
          message: 'Preparing video source...',
          data: { jobId, videoId: dbVideoId || undefined },
        })) return;

        if (dbVideoId) {
          send({
            stage: 'analysis_complete',
            progress: 46,
            message: 'Preparing clip generation...',
            data: { jobId, videoId: dbVideoId },
          });
        }

        let lastSourceProgress = 46;
        let sourceStartAt = Date.now();
        let sourceProgressInterval: NodeJS.Timeout | null = null;

        const startSourceProgressTimer = (startProgress: number, stages: { p: number; m: string }[], stepMs: number) => {
          if (sourceProgressInterval) clearInterval(sourceProgressInterval);
          lastSourceProgress = startProgress;
          sourceStartAt = Date.now();
          sourceProgressInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - sourceStartAt;
            const stageIndex = Math.min(stages.length - 1, Math.floor(elapsed / stepMs));
            const stage = stages[stageIndex];
            if (lastSourceProgress !== stage.p) {
              lastSourceProgress = stage.p;
              send({
                stage: 'generating_clip',
                progress: stage.p,
                message: stage.m,
                data: { jobId, videoId: dbVideoId || undefined },
              });
            }
          }, 3000);
        };

        const stopSourceProgressTimer = () => {
          if (sourceProgressInterval) {
            clearInterval(sourceProgressInterval);
            sourceProgressInterval = null;
          }
        };

        const isHD = quality === 'hd';
        const sdTimeout = IS_VERCEL ? 90_000 : 120_000;
        const hdTimeout = IS_VERCEL ? 90_000 : 120_000;

        if (isHD) {
          startSourceProgressTimer(46, [
            { p: 47, m: isBilibili ? 'Connecting to Bilibili video stream (HD)...' : 'Connecting to video stream (HD)...' },
            { p: 48, m: 'Downloading HD video to local cache...' },
            { p: 49, m: 'Finalizing HD video source...' },
          ], 10000);

          try {
            source = await promiseWithTimeout(
              videoClipper.downloadSourceVideo(videoUrl),
              hdTimeout,
              'HD download timed out. Falling back to SD quality for faster results...',
            );
            stopSourceProgressTimer();
          } catch (hdError) {
            const hdMsg = hdError instanceof Error ? hdError.message : 'HD download failed.';
            const ytId = extractYouTubeId(videoUrl);
            console.warn(`HD source preparation failed, falling back to SD for ${ytId || videoUrl.slice(0, 50)}:`, hdMsg.slice(0, 120));

            if (ytId || !isLinkOnlyMode) {
              startSourceProgressTimer(48, [
                { p: 48, m: 'HD download timed out, switching to SD quality for faster results...' },
                { p: 49, m: 'Downloading SD video...' },
                { p: 49.5, m: 'Finalizing SD source...' },
              ], 8000);
              try {
                source = await promiseWithTimeout(
                  videoClipper.downloadSourceVideo(videoUrl, { forceRefresh: true, forceMaxHeight: 360 }),
                  sdTimeout,
                  'SD download also failed. Video may be blocked.',
                );
                console.log('SD fallback succeeded after HD timeout');
                stopSourceProgressTimer();
              } catch (sdError) {
                const sdMsg = sdError instanceof Error ? sdError.message : 'SD fallback failed.';
                console.warn(`SD fallback also failed:`, sdMsg.slice(0, 120));
                stopSourceProgressTimer();
                const ytIdForLink = extractYouTubeId(videoUrl);
                if (ytIdForLink) {
                  isLinkOnlyMode = true;
                  linkOnlyVideoId = ytIdForLink;
                  if (!send({
                    stage: 'generating_clip',
                    progress: 50,
                    message: 'Video download blocked. Generating downloadable highlight clips from thumbnails...',
                    data: { jobId, videoId: dbVideoId || undefined, linkOnlyMode: true },
                  })) return;
                } else {
                  throw new Error(`Failed to prepare source video: ${sdMsg}`);
                }
              }
            } else {
              stopSourceProgressTimer();
              throw new Error(`Failed to prepare source video: ${hdMsg}`);
            }
          }
        } else {
          const ytId = extractYouTubeId(videoUrl);
          const isYouTube = !!ytId && !isBilibili;

          if (isYouTube) {
            startSourceProgressTimer(46, [
              { p: 47, m: 'Analyzing video highlights...' },
              { p: 48, m: 'Preparing highlight clips...' },
              { p: 49, m: 'Generating clip thumbnails...' },
            ], 3000);

            stopSourceProgressTimer();

            isLinkOnlyMode = true;
            linkOnlyVideoId = ytId;

            console.log(`SD mode YouTube: using fast fallback path (no full download) for ${ytId}`);

            if (!send({
              stage: 'generating_clip',
              progress: 50,
              message: 'Generating highlight clips with thumbnails (real video loading in background)...',
              data: { jobId, videoId: dbVideoId || undefined, linkOnlyMode: true },
            })) return;
          } else {
            startSourceProgressTimer(46, [
              { p: 47, m: isBilibili ? 'Connecting to Bilibili video stream...' : 'Connecting to video stream...' },
              { p: 48, m: 'Downloading video to local cache...' },
              { p: 49, m: 'Finalizing video source...' },
            ], 8000);

            try {
              source = await promiseWithTimeout(
                videoClipper.downloadSourceVideo(videoUrl, { forceMaxHeight: 360 }),
                sdTimeout,
                'Failed to prepare source video within time limit. This video may require login or be blocked. Please retry or try another video.',
              );
              stopSourceProgressTimer();
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Failed to prepare source video.';
              const ytIdFallback = extractYouTubeId(videoUrl);
              stopSourceProgressTimer();

              if (ytIdFallback && !isLinkOnlyMode) {
                isLinkOnlyMode = true;
                linkOnlyVideoId = ytIdFallback;
                if (!send({
                  stage: 'generating_clip',
                  progress: 50,
                  message: 'Video download blocked. Generating downloadable highlight clips from thumbnails...',
                  data: { jobId, videoId: dbVideoId || undefined, linkOnlyMode: true },
                })) return;
              } else {
                throw new Error(`Failed to prepare source video: ${errorMsg}`);
              }
            }
          }
        }

        stopSourceProgressTimer();

        if (!isLinkOnlyMode && !source?.inputPath) {
          throw new Error('Failed to prepare source video: no file path returned.');
        }

        if (abortSignal.aborted) return;
        if (!send({
          stage: 'generating_clip',
          progress: 50,
          message: isLinkOnlyMode
            ? 'Generating highlight links with YouTube timestamps...'
            : 'Source ready. Generating highlight clips...',
          data: { jobId, videoId: dbVideoId || undefined, linkOnlyMode: isLinkOnlyMode },
        })) return;

        for (let index = 0; index < highlights.length; index += 1) {
          if (abortSignal.aborted) return;
          const highlight = highlights[index];
          const maxDuration = Math.max(0, analysis.duration || 0);
          const rawStart = Math.max(0, Number.isFinite(highlight.start_time) ? highlight.start_time : 0);
          const rawEnd = Math.max(0, Number.isFinite(highlight.end_time) ? highlight.end_time : rawStart + 60);
          const safeStart = maxDuration > 0 ? Math.min(rawStart, Math.max(0, maxDuration - 1)) : rawStart;
          const safeEnd = maxDuration > 0 ? Math.min(Math.max(rawEnd, safeStart + 1), maxDuration) : Math.max(rawEnd, safeStart + 1);

          const draftClip: ClipResult = {
            id: `${jobId}-clip-${clipOffset + index}`,
            title: highlight.title,
            startTime: safeStart,
            endTime: safeEnd,
            duration: safeEnd - safeStart,
            summary: highlight.summary,
            engagementScore: highlight.engagement_score,
            thumbnailUrl: '',
            videoUrl: null,
            status: 'processing',
          };

          if (!send({
            stage: 'generating_clip',
            progress: 50 + Math.floor((index / highlights.length) * 35),
            message: `Generating clip ${clipOffset + index + 1}/${allHighlights.length}: "${highlight.title}"`,
            data: { clip: draftClip, clipIndex: clipOffset + index, jobId, videoId: dbVideoId || undefined },
          })) return;

          // Link-only mode: try real video generation first (Invidious proxy, CF Worker), then fallback
          if (isLinkOnlyMode && linkOnlyVideoId) {
            const isSDFastPath = !isHD && quality === 'sd';

            if (!isSDFastPath || true) {
              try {
                const streamClip = await videoClipper.createClipFromYouTubeStream({
                  videoId: linkOnlyVideoId,
                  title: highlight.title,
                  summary: highlight.summary,
                  startTime: safeStart,
                  endTime: safeEnd,
                  fastCopy: isSDFastPath,
                  ...(preResolvedStreamUrl ? { preResolvedStreamUrl, preResolvedMetadata } : {}),
                });

                if (streamClip && streamClip.videoUrl) {
                  streamClip.id = draftClip.id;
                  streamClip.engagementScore = draftClip.engagementScore;
                  streamClip.linkOnlyUrl = buildYouTubeTimestampUrl(linkOnlyVideoId, safeStart);
                  streamClip.isFallback = false;

                  clips.push(streamClip);

                  if (abortSignal.aborted) return;
                  if (!send({
                    stage: 'clip_ready',
                    progress: 55 + Math.floor(((index + 1) / highlights.length) * 35),
                    message: `Clip ready: "${highlight.title}"`,
                    data: { clip: streamClip, clipIndex: clipOffset + index, jobId, videoId: dbVideoId || undefined, linkOnlyMode: true },
                  })) return;
                  continue;
                }
              } catch (streamErr) {
                console.warn(`Stream clip failed for highlight ${index}, trying thumbnail fallback:`,
                  streamErr instanceof Error ? streamErr.message.slice(0, 100) : streamErr);
              }
            }

            try {
              const fallbackClip = await videoClipper.generateFallbackClip({
                videoId: linkOnlyVideoId,
                title: highlight.title,
                summary: highlight.summary,
                startTime: safeStart,
                endTime: safeEnd,
              });

              fallbackClip.id = draftClip.id;
              fallbackClip.engagementScore = draftClip.engagementScore;
              fallbackClip.linkOnlyUrl = buildYouTubeTimestampUrl(linkOnlyVideoId, safeStart);

              clips.push(fallbackClip);

              if (abortSignal.aborted) return;
              if (!send({
                stage: 'clip_ready',
                progress: 55 + Math.floor(((index + 1) / highlights.length) * 35),
                message: `Clip ready: "${highlight.title}"`,
                data: { clip: fallbackClip, clipIndex: clipOffset + index, jobId, videoId: dbVideoId || undefined, linkOnlyMode: true },
              })) return;
              continue;
            } catch (fallbackErr) {
              console.warn(`Fallback clip generation failed for highlight ${index}:`, fallbackErr instanceof Error ? fallbackErr.message.slice(0, 100) : fallbackErr);
              draftClip.status = 'link_only';
              draftClip.videoUrl = null;
              draftClip.linkOnlyUrl = buildYouTubeTimestampUrl(linkOnlyVideoId, safeStart);
              draftClip.thumbnailUrl = buildYouTubeThumbnailUrl(linkOnlyVideoId);
              clips.push(draftClip);

              if (abortSignal.aborted) return;
              if (!send({
                stage: 'clip_ready',
                progress: 55 + Math.floor(((index + 1) / highlights.length) * 35),
                message: `Highlight link ready: "${highlight.title}"`,
                data: { clip: draftClip, clipIndex: clipOffset + index, jobId, videoId: dbVideoId || undefined, linkOnlyMode: true },
              })) return;
              continue;
            }
          }

          // Stream fast path mode: use createClipFromYouTubeStream with fastCopy
          // No full video download needed — each clip is fetched directly from stream
          const isStreamFastPath = source?.inputPath === '__stream_fast_path__';
          const ytIdForFastPath = extractYouTubeId(videoUrl);

          if (isStreamFastPath && ytIdForFastPath && !isLinkOnlyMode) {
            try {
              const streamClip = await videoClipper.createClipFromYouTubeStream({
                videoId: ytIdForFastPath,
                title: highlight.title,
                summary: highlight.summary,
                startTime: safeStart,
                endTime: safeEnd,
                fastCopy: true,
                ...(preResolvedStreamUrl ? { preResolvedStreamUrl, preResolvedMetadata } : {}),
              });

              if (streamClip && streamClip.videoUrl) {
                streamClip.id = draftClip.id;
                streamClip.engagementScore = draftClip.engagementScore;
                streamClip.status = 'completed';
                clips.push(streamClip as unknown as ClipResult);

                if (abortSignal.aborted) return;
                if (!send({
                  stage: 'clip_ready',
                  progress: 50 + Math.floor(((index + 1) / highlights.length) * 45),
                  message: `Clip ready: "${highlight.title}"`,
                  data: { clip: streamClip as unknown as ClipResult, clipIndex: clipOffset + index, jobId, videoId: dbVideoId || undefined },
                })) return;
                continue;
              }
              throw new Error('Stream fast path returned empty clip');
            } catch (streamErr) {
              console.warn(`Stream fast path failed for highlight ${index}, falling back to local clip:`,
                streamErr instanceof Error ? streamErr.message.slice(0, 100) : streamErr);
            }
          }

          try {
            const baseProgress = 50 + Math.floor((index / highlights.length) * 35);
            const isSD = !isHD || quality === 'sd';
            const maxAttempts = isSD ? 1 : 3;
            const attemptMessages = isSD
              ? ['Generating clip (fast mode)...']
              : [
                  'Generating clip...',
                  'Retrying with fresh source...',
                  'Trying SD quality fallback...',
                ];
            let clipSucceeded = false;

            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
              if (abortSignal.aborted) return;
              if (attempt > 0) {
                send({
                  stage: 'generating_clip',
                  progress: baseProgress + Math.floor(attempt * 3),
                  message: `Clip ${clipOffset + index + 1}/${allHighlights.length}: ${attemptMessages[attempt]}`,
                  data: { clip: draftClip, clipIndex: clipOffset + index, jobId, videoId: dbVideoId || undefined, attempt: attempt + 1 },
                });
              }

              let currentSource = source;
              if (attempt === 1 || attempt === 2) {
                const sdOnly = attempt === 2;
                try {
                  const freshSource = await promiseWithTimeout(
                    videoClipper.downloadSourceVideo(videoUrl, {
                      forceRefresh: true,
                      ...(sdOnly ? { forceMaxHeight: 360 } : {}),
                    }),
                    120_000,
                    `Source refresh timed out (${sdOnly ? 'SD' : 'HD'})`,
                  );
                  if (freshSource?.inputPath) {
                    currentSource = freshSource;
                    if (attempt === 1) source = freshSource;
                  }
                } catch (refreshErr) {
                  console.warn(`Clip ${clipOffset + index + 1} attempt ${attempt + 1}: source refresh failed`,
                    refreshErr instanceof Error ? refreshErr.message.slice(0, 100) : refreshErr);
                  if (attempt === 2) throw refreshErr;
                  continue;
                }
              }

              try {
                const useFastCopy = isSD && !currentSource?.audioInputPath;
                const result = await promiseWithTimeout(
                  videoClipper.createLocalClip({
                    inputPath: currentSource.inputPath,
                    audioInputPath: currentSource.audioInputPath,
                    inputHeaders: currentSource.ffmpegHeaders,
                    startTime: safeStart,
                    endTime: safeEnd,
                    title: highlight.title,
                    fastCopy: useFastCopy,
                  }),
                  useFastCopy ? 60_000 : 120_000,
                  'Clip generation timed out. This may be due to slow video decoding. Trying lower quality...',
                );

                draftClip.videoUrl = result.dataUrl || result.publicUrl;
                draftClip.thumbnailUrl = result.thumbnailUrl || '';
                draftClip.status = 'completed';
                if (attempt === 2) {
                  (draftClip as unknown as { quality?: string }).quality = 'SD';
                }
                clipSucceeded = true;
                break;
              } catch (err) {
                if (attempt === maxAttempts - 1) throw err;
                console.warn(`Clip ${clipOffset + index + 1} attempt ${attempt + 1} failed:`,
                  err instanceof Error ? err.message.slice(0, 100) : err);
              }
            }

            if (!clipSucceeded) throw new Error('All clip generation attempts failed');
          } catch (error) {
            console.warn(`Clip generation failed for "${highlight.title}":`, error);
            draftClip.status = 'failed';
            draftClip.videoUrl = null;
            (draftClip as unknown as { error?: string }).error = error instanceof Error
              ? error.message.slice(-800)
              : String(error).slice(-800);
          }

          clips.push(draftClip);

          if (abortSignal.aborted) return;
          if (!send({
            stage: 'clip_ready',
            progress: 55 + Math.floor(((index + 1) / highlights.length) * 35),
            message:
              draftClip.status === 'completed'
                ? `Clip ready: "${highlight.title}"`
                : `Clip failed: "${highlight.title}"`,
            data: { clip: draftClip, clipIndex: clipOffset + index, jobId, videoId: dbVideoId || undefined },
          })) return;
        }

        const completedClips = clips.filter(hasPlayableUrl);
        const linkOnlyClips = clips.filter(isLinkOnlyClip);
        const successfulClips = [...completedClips, ...linkOnlyClips];
        if (abortSignal.aborted) return;
        if (successfulClips.length === 0 && clipOffset === 0) {
          const fallbackYtId = extractYouTubeId(videoUrl);
          if (fallbackYtId && !isLinkOnlyMode) {
            console.warn(
              `All clips failed for YouTube video ${fallbackYtId}, generating fallback clips from thumbnails`,
            );
            isLinkOnlyMode = true;
            linkOnlyVideoId = fallbackYtId;

            for (let i = 0; i < clips.length; i += 1) {
              const c = clips[i];
              const h = highlights[i];
              const safeStart = Math.max(0, Math.floor(h.start_time));
              const safeEnd = Math.max(safeStart + 1, Math.floor(h.end_time));

              // Strategy 1: Try real video stream first
              let clipCreated = false;
              try {
                const streamClip = await videoClipper.createClipFromYouTubeStream({
                  videoId: fallbackYtId,
                  title: h.title,
                  summary: h.summary,
                  startTime: safeStart,
                  endTime: safeEnd,
                  ...(preResolvedStreamUrl ? { preResolvedStreamUrl, preResolvedMetadata } : {}),
                });
                if (streamClip && streamClip.videoUrl) {
                  c.status = 'completed';
                  c.videoUrl = streamClip.videoUrl;
                  c.thumbnailUrl = streamClip.thumbnailUrl || '';
                  c.duration = streamClip.duration;
                  c.linkOnlyUrl = buildYouTubeTimestampUrl(fallbackYtId, safeStart);
                  (c as unknown as { error?: string }).error = undefined;
                  clipCreated = true;
                }
              } catch (streamErr) {
                console.warn(`Stream clip ${i} failed, trying thumbnail fallback:`,
                  streamErr instanceof Error ? streamErr.message.slice(0, 80) : streamErr);
              }

              // Strategy 2: Thumbnail video as fallback
              if (!clipCreated) {
                try {
                  const fallbackClip = await videoClipper.generateFallbackClip({
                    videoId: fallbackYtId,
                    title: h.title,
                    summary: h.summary,
                    startTime: safeStart,
                    endTime: safeEnd,
                  });
                  c.status = 'completed';
                  c.videoUrl = fallbackClip.videoUrl;
                  c.thumbnailUrl = fallbackClip.thumbnailUrl;
                  c.duration = fallbackClip.duration;
                  c.linkOnlyUrl = buildYouTubeTimestampUrl(fallbackYtId, safeStart);
                  // 标记为 fallback zoompan 伪视频，前端识别此标记后会触发重新生成
                  c.isFallback = true;
                  (c as unknown as { error?: string }).error = undefined;
                } catch (fbErr) {
                  console.warn(`Fallback clip ${i} also failed:`, fbErr instanceof Error ? fbErr.message.slice(0, 80) : fbErr);
                  c.status = 'link_only';
                  c.videoUrl = null;
                  (c as unknown as { error?: string }).error = undefined;
                  c.linkOnlyUrl = buildYouTubeTimestampUrl(fallbackYtId, safeStart);
                  c.thumbnailUrl = buildYouTubeThumbnailUrl(fallbackYtId);
                }
              }
            }

            if (!send({
              stage: 'generating_clip',
              progress: 70,
              message: 'Video download blocked. Generated downloadable clips from video thumbnails.',
              data: { jobId, videoId: dbVideoId || undefined, linkOnlyMode: true },
            })) return;

            const newPlayableClips = clips.filter(hasPlayableUrl);
            const newLinkOnlyClips = clips.filter(isLinkOnlyClip);
            if (newPlayableClips.length > 0 || newLinkOnlyClips.length > 0) {
              if (!send({
                stage: 'saving',
                progress: 93,
                message: newPlayableClips.length > 0 ? 'Saving generated clips...' : 'Saving highlight links...',
                data: { jobId, videoId: dbVideoId || undefined, linkOnlyMode: newPlayableClips.length === 0 },
              })) return;
              // Save link_only clips to DB if in Supabase mode
              if (dbVideoId && isSupabaseMode) {
                try {
                  for (const clip of newLinkOnlyClips) {
                    await supabaseClient!.from('short_videos').insert({
                      video_id: dbVideoId,
                      user_id: userId,
                      url: clip.linkOnlyUrl,
                      start_time: clip.startTime,
                      end_time: clip.endTime,
                      duration: clip.duration,
                      highlight_title: clip.title,
                      highlight_summary: clip.summary,
                      thumbnail_url: clip.thumbnailUrl,
                    });
                  }
                } catch (dbError) {
                  console.warn('Database save failed (link_only fallback):', dbError);
                }
              }
              // Send completion with link_only clips
              const nextOffset = clipOffset + highlights.length;
              const done = nextOffset >= allHighlights.length;
              if (dbVideoId && isSupabaseMode) {
                try {
                  await supabaseClient!
                    .from('videos')
                    .update({ status: done ? 'link_only_completed' : 'link_only_processing' })
                    .eq('id', dbVideoId);
                } catch {}
              }
              if (!send({
                stage: 'clips_complete',
                progress: 100,
                message: `Generated ${newLinkOnlyClips.length} highlight links with YouTube timestamps (video download blocked).`,
                data: {
                  jobId,
                  clips: newLinkOnlyClips,
                  highlights,
                  estimatedDuration: suppliedDuration || 0,
                  title: suppliedTitle,
                  clipOffset,
                  clipLimit: highlights.length,
                  totalHighlights: allHighlights.length,
                  nextOffset,
                  done,
                  linkOnlyMode: true,
                },
              })) return;
              clearInterval(heartbeat);
              return;
            }
          }
          const lastFailed = clips.findLast(c => c.status === 'failed') as (ClipResult & { error?: string }) | undefined;
          const extra = lastFailed?.error ? ` Last error: ${lastFailed.error}` : '';
          throw new Error(`All highlight clip generation failed. Please retry or try a different video.${extra}`);
        }

        if (!send({
          stage: 'saving',
          progress: 93,
          message: isLinkOnlyMode ? 'Saving highlight links...' : 'Saving generated clips...',
          data: { jobId, videoId: dbVideoId || undefined, linkOnlyMode: isLinkOnlyMode },
        })) return;

        if (dbVideoId && isSupabaseMode) {
          try {
            for (const clip of successfulClips) {
              const dbVideoUrl = clip.videoUrl?.startsWith('data:')
                ? `data-url:${clip.id}`
                : (clip.videoUrl || (isLinkOnlyClip(clip) ? clip.linkOnlyUrl : null));
              await supabaseClient!.from('short_videos').insert({
                video_id: dbVideoId,
                user_id: userId,
                url: dbVideoUrl,
                start_time: clip.startTime,
                end_time: clip.endTime,
                duration: clip.duration,
                highlight_title: clip.title,
                highlight_summary: clip.summary,
                thumbnail_url: clip.thumbnailUrl,
              });
            }
          } catch (dbError) {
            console.warn('Database save failed:', dbError);
          }
        }

        if (abortSignal.aborted) return;
        const nextOffset = clipOffset + highlights.length;
        const done = nextOffset >= allHighlights.length;
        if (dbVideoId && isSupabaseMode) {
          try {
            const finalStatus = isLinkOnlyMode
              ? (done ? 'link_only_completed' : 'link_only_processing')
              : done
                ? (completedClips.length === clips.length ? 'completed' : 'partial')
                : 'processing';
            await supabaseClient!
              .from('videos')
              .update({ status: finalStatus })
              .eq('id', dbVideoId);
          } catch {}
        }

        // Deduct credits only after successful processing
        if (isSupabaseMode && !isContinuation && clipOffset === 0 && userRole !== 'admin' && userId) {
          try {
            const { getSupabaseClient } = await import('@/storage/database/supabase-client');
            const client = getSupabaseClient(bearerToken);
            const { data: latestCredits } = await client
              .from('credits')
              .select('balance')
              .eq('user_id', userId)
              .maybeSingle();
            const currentBalance = latestCredits?.balance ?? 0;
            if (currentBalance >= 60) {
              await client
                .from('credits')
                .update({ balance: currentBalance - 60 })
                .eq('user_id', userId);
              await client.from('credit_transactions').insert({
                user_id: userId,
                amount: -60,
                type: 'video_process',
                description: 'Video processing',
              });
            }
          } catch (deductErr) {
            console.error('Failed to deduct credits:', deductErr);
          }
        }

        const completionMessage = isLinkOnlyMode
          ? `Generated ${linkOnlyClips.length} highlight links with YouTube timestamps (video download blocked).`
          : `Generated ${completedClips.length} playable highlight clips.`;
        sendSSE(controller, {
          stage: 'complete',
          progress: 100,
          message: completionMessage,
          data: {
            jobId,
            videoId: dbVideoId || undefined,
            clips,
            highlights: allHighlights,
            estimatedDuration: analysis.duration,
            clipOffset,
            clipLimit: batchLimit,
            totalHighlights: allHighlights.length,
            nextOffset,
            done,
            linkOnlyMode: isLinkOnlyMode,
          },
        });
        clearInterval(heartbeat);
      } catch (error) {
        if (!abortSignal.aborted) {
          console.error('Video processing failed:', error);
          sendSSE(controller, {
            stage: 'error',
            progress: 0,
            message: error instanceof Error ? error.message : 'Unexpected processing error',
            data: { error: true },
          });
        }
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
