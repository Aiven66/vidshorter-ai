import { NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import videoClipper from '@/lib/server/video-clipper';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
            } else if (shouldResetUtc(creditsRow.last_reset_at)) {
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
            if (currentBalance < 30) {
              throw new Error('Insufficient credits. Your credits reset to 100 at 00:00 UTC daily.');
            }

            await client
              .from('credits')
              .update({ balance: currentBalance - 30 })
              .eq('user_id', userId);
            await client.from('credit_transactions').insert({
              user_id: userId,
              amount: -30,
              type: 'video_process',
              description: 'Video processing',
            });
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
              120_000,
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
          progress: 48,
          message: isBilibili
            ? 'Connecting to Bilibili video stream...'
            : 'Connecting to video stream...',
          data: { jobId },
        })) return;

        if (dbVideoId) {
          send({
            stage: 'analysis_complete',
            progress: 46,
            message: 'Preparing clip generation...',
            data: { jobId, videoId: dbVideoId },
          });
        }

        try {
          source = await promiseWithTimeout(
            videoClipper.downloadSourceVideo(videoUrl),
            150_000,
            'Failed to prepare source video within time limit. This YouTube video may require login or be blocked. Please retry or try another video.',
          );
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Failed to prepare source video.';
          // Fallback: if this is a YouTube video, switch to link-only mode
          // (AI highlights with YouTube timestamp links + thumbnails, no video clips)
          const ytId = extractYouTubeId(videoUrl);
          if (ytId) {
            console.warn(`Video download failed, switching to link-only mode for YouTube video ${ytId}:`, errorMsg);
            isLinkOnlyMode = true;
            linkOnlyVideoId = ytId;
            if (!send({
              stage: 'generating_clip',
              progress: 49,
              message: 'Video download blocked by YouTube. Generating highlight links with timestamps instead...',
              data: { jobId, videoId: dbVideoId || undefined, linkOnlyMode: true },
            })) return;
          } else {
            throw new Error(`Failed to prepare source video: ${errorMsg}`);
          }
        }

        if (!isLinkOnlyMode && !source?.inputPath) {
          throw new Error('Failed to prepare source video: no file path returned.');
        }

        if (abortSignal.aborted) return;
        if (!send({
          stage: 'generating_clip',
          progress: 49,
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

          // Link-only mode: generate YouTube timestamp links + thumbnails (no video download)
          if (isLinkOnlyMode && linkOnlyVideoId) {
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

          try {
            // 3 attempts: HD (default) → HD refresh → SD fallback (360p).
            // The SD fallback is critical for bot-detected videos where 720p
            // adaptiveFormats are blocked but 360p combined streams work.
            // This is the "B-plan" — at least produce a downloadable SD clip
            // when HD fails, rather than falling through to link_only.
            for (let attempt = 0; attempt < 3; attempt += 1) {
              const currentSource = attempt === 0
                ? source
                : attempt === 1
                  ? await videoClipper.downloadSourceVideo(videoUrl, { forceRefresh: true })
                  : await videoClipper.downloadSourceVideo(videoUrl, { forceRefresh: true, forceMaxHeight: 360 });

              try {
                const result = await videoClipper.createLocalClip({
                  inputPath: currentSource.inputPath,
                  audioInputPath: currentSource.audioInputPath,
                  inputHeaders: currentSource.ffmpegHeaders,
                  startTime: safeStart,
                  endTime: safeEnd,
                  title: highlight.title,
                });

                draftClip.videoUrl = result.dataUrl || result.publicUrl;
                draftClip.thumbnailUrl = result.thumbnailUrl || '';
                draftClip.status = 'completed';
                if (attempt === 2) {
                  // SD fallback succeeded — mark for UI transparency
                  (draftClip as unknown as { quality?: string }).quality = 'SD';
                }
                break;
              } catch (err) {
                if (attempt === 2) throw err;
              }
            }

            // Prefer data URL (works across Lambda invocations without /tmp dependency)
            // Fall back to serve-clip URL (works only within same Lambda instance)
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
          // Last-resort fallback: if this is a YouTube video and ALL clip
          // generation failed (typically CF Worker /stream returns 502 due to
          // YouTube bot detection / LOGIN_REQUIRED), switch to link_only mode.
          // This ensures users always get highlight links with timestamps +
          // thumbnails, even when video download is completely blocked.
          const fallbackYtId = extractYouTubeId(videoUrl);
          if (fallbackYtId && !isLinkOnlyMode) {
            console.warn(
              `All clips failed for YouTube video ${fallbackYtId}, switching to link_only fallback mode`,
            );
            isLinkOnlyMode = true;
            linkOnlyVideoId = fallbackYtId;
            // Rebuild clips as link_only entries with YouTube timestamp links
            for (let i = 0; i < clips.length; i += 1) {
              const c = clips[i];
              const h = highlights[i];
              const safeStart = Math.max(0, Math.floor(h.start_time));
              c.status = 'link_only';
              c.videoUrl = null;
              (c as unknown as { error?: string }).error = undefined;
              c.linkOnlyUrl = buildYouTubeTimestampUrl(fallbackYtId, safeStart);
              c.thumbnailUrl = buildYouTubeThumbnailUrl(fallbackYtId);
            }
            if (!send({
              stage: 'generating_clip',
              progress: 70,
              message: 'Video download blocked by YouTube. Generated highlight links with timestamps instead.',
              data: { jobId, videoId: dbVideoId || undefined, linkOnlyMode: true },
            })) return;
            // Re-filter after fallback conversion
            const newLinkOnlyClips = clips.filter(isLinkOnlyClip);
            if (newLinkOnlyClips.length > 0) {
              // Skip the error throw below — we have link_only clips to return
              if (!send({
                stage: 'saving',
                progress: 93,
                message: 'Saving highlight links...',
                data: { jobId, videoId: dbVideoId || undefined, linkOnlyMode: true },
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
