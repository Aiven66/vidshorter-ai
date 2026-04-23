import { NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import videoClipper from '@/lib/server/video-clipper';

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
  status: 'processing' | 'completed' | 'failed';
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

const DEFAULT_BATCH_SIZE =
  clampInt(process.env.PROCESS_VIDEO_BATCH_SIZE, 1, 10, 0) ||
  (process.env.VERCEL ? 3 : 10);

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ProcessVideoRequest;
  const videoUrl = body.videoUrl?.trim();
  const userId = body.userId?.trim();
  const sourceType = body.sourceType?.trim() || 'url';
  const jobId = body.jobId?.trim() || `job-${Date.now()}`;
  const clipOffset = clampInt(body.clipOffset, 0, 10_000, 0);
  const clipLimitFromRequest = clampInt(body.clipLimit, 1, 10, 0);
  const desiredClipCountFromRequest = clampInt(body.desiredClipCount, 1, 10, 0);
  const suppliedHighlights = Array.isArray(body.highlights) ? (body.highlights as Highlight[]) : null;
  const suppliedDuration = clampInt(body.duration, 0, 100_000, 0);
  const suppliedTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const suppliedVideoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
  const abortSignal = request.signal;

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

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Missing userId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (abortSignal.aborted) return;
        if (!sendSSE(controller, {
          stage: 'init',
          progress: 5,
          message: 'Initializing AutoClip-style processing...',
          data: { jobId },
        })) return;

        const isBilibili = videoUrl.includes('bilibili.com') || videoUrl.includes('b23.tv');
        if (abortSignal.aborted) return;
        if (!sendSSE(controller, {
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
          : await videoClipper.analyzeVideo(videoUrl);
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

        if (!sendSSE(controller, {
          stage: 'analysis_complete',
          progress: 45,
          message: `Found ${allHighlights.length} highlight moments in "${analysis.title}".`,
          data: {
            jobId,
            highlights: allHighlights,
            estimatedDuration: analysis.duration,
            title: analysis.title,
            clipOffset,
            clipLimit: batchLimit,
            totalHighlights: allHighlights.length,
            recommendedClipCount: recommendedCount,
            videoId: dbVideoId || undefined,
          },
        })) return;

        const clips: ClipResult[] = [];
        let source: { inputPath: string; ffmpegHeaders?: string } | null = null;

        if (abortSignal.aborted) return;
        if (!sendSSE(controller, {
          stage: 'generating_clip',
          progress: 48,
          message: isBilibili
            ? 'Connecting to Bilibili video stream...'
            : 'Connecting to video stream...',
          data: { jobId },
        })) return;

        if (!dbVideoId && isSupabaseConfigured() && !userId.startsWith('demo-')) {
          try {
            const { getSupabaseClient } = await import('@/storage/database/supabase-client');
            const client = getSupabaseClient();
            const { data: video } = await client
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

        if (dbVideoId) {
          sendSSE(controller, {
            stage: 'analysis_complete',
            progress: 46,
            message: 'Preparing clip generation...',
            data: { jobId, videoId: dbVideoId },
          });
        }

        try {
          source = await videoClipper.downloadSourceVideo(videoUrl);
        } catch (error) {
          throw new Error(
            error instanceof Error
              ? `Failed to prepare source video: ${error.message}`
              : 'Failed to prepare source video.'
          );
        }

        if (!source?.inputPath) {
          throw new Error('Failed to prepare source video: no file path returned.');
        }

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

          if (!sendSSE(controller, {
            stage: 'generating_clip',
            progress: 50 + Math.floor((index / highlights.length) * 35),
            message: `Generating clip ${clipOffset + index + 1}/${allHighlights.length}: "${highlight.title}"`,
            data: { clip: draftClip, clipIndex: clipOffset + index, jobId, videoId: dbVideoId || undefined },
          })) return;

          try {
            let lastError: unknown = null;
            for (let attempt = 0; attempt < 3; attempt += 1) {
              const currentSource = attempt === 0
                ? source
                : await videoClipper.downloadSourceVideo(videoUrl, { forceRefresh: true });

              try {
                const result = await videoClipper.createLocalClip({
                  inputPath: currentSource.inputPath,
                  inputHeaders: currentSource.ffmpegHeaders,
                  startTime: safeStart,
                  endTime: safeEnd,
                  title: highlight.title,
                });

                draftClip.videoUrl = result.dataUrl || result.publicUrl;
                draftClip.thumbnailUrl = result.thumbnailUrl || '';
                draftClip.status = 'completed';
                lastError = null;
                break;
              } catch (err) {
                lastError = err;
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
              ? error.message.slice(0, 200)
              : String(error).slice(0, 200);
          }

          clips.push(draftClip);

          if (abortSignal.aborted) return;
          if (!sendSSE(controller, {
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
        if (abortSignal.aborted) return;
        if (completedClips.length === 0 && clipOffset === 0) {
          const lastFailed = clips.findLast(c => c.status === 'failed') as (ClipResult & { error?: string }) | undefined;
          const extra = lastFailed?.error ? ` Last error: ${lastFailed.error}` : '';
          throw new Error(`All highlight clip generation failed. Please retry or try a different video.${extra}`);
        }

        if (!sendSSE(controller, {
          stage: 'saving',
          progress: 93,
          message: 'Saving generated clips...',
          data: { jobId, videoId: dbVideoId || undefined },
        })) return;

        if (dbVideoId && isSupabaseConfigured() && !userId.startsWith('demo-')) {
          try {
            const { getSupabaseClient } = await import('@/storage/database/supabase-client');
            const client = getSupabaseClient();

            for (const clip of completedClips) {
              const dbVideoUrl = clip.videoUrl?.startsWith('data:')
                ? `data-url:${clip.id}`
                : clip.videoUrl;
              await client.from('short_videos').insert({
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
        if (dbVideoId && isSupabaseConfigured() && !userId.startsWith('demo-')) {
          try {
            const { getSupabaseClient } = await import('@/storage/database/supabase-client');
            const client = getSupabaseClient();
            await client
              .from('videos')
              .update({
                status: done
                  ? (completedClips.length === clips.length ? 'completed' : 'partial')
                  : 'processing',
              })
              .eq('id', dbVideoId);
          } catch {}
        }
        sendSSE(controller, {
          stage: 'complete',
          progress: 100,
          message: `Generated ${completedClips.length} playable highlight clips.`,
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
          },
        });
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
      Connection: 'keep-alive',
    },
  });
}
