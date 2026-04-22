import { NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import videoClipper from '@/lib/server/video-clipper';

interface ProcessVideoRequest {
  videoUrl?: string;
  userId?: string;
  sourceType?: string;
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

// On Vercel serverless, limit clips to avoid hitting the 300s function timeout.
// 3 clips × ~60s each (stream fetch + ffmpeg encode) = ~180s comfortably within budget.
const MAX_CLIPS = process.env.VERCEL ? 3 : 10;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ProcessVideoRequest;
  const videoUrl = body.videoUrl?.trim();
  const userId = body.userId?.trim();
  const sourceType = body.sourceType?.trim() || 'url';
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
        })) return;

        const isBilibili = videoUrl.includes('bilibili.com') || videoUrl.includes('b23.tv');
        if (abortSignal.aborted) return;
        if (!sendSSE(controller, {
          stage: 'ai_analysis',
          progress: 20,
          message: isBilibili
            ? 'Analyzing Bilibili video metadata and timeline...'
            : 'Analyzing subtitles and timeline to find highlight moments...',
        })) return;

        const analysis = await videoClipper.analyzeVideo(videoUrl);
        if (abortSignal.aborted) return;
        // Limit highlights to MAX_CLIPS to stay within serverless timeout budget
        const highlights = (analysis.highlights as Highlight[]).slice(0, MAX_CLIPS);

        if (!sendSSE(controller, {
          stage: 'analysis_complete',
          progress: 45,
          message: `Found ${highlights.length} highlight moments in "${analysis.title}".`,
          data: {
            highlights,
            estimatedDuration: analysis.duration,
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
        })) return;

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
            id: `clip-${Date.now()}-${index}`,
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
            message: `Generating clip ${index + 1}/${highlights.length}: "${highlight.title}"`,
            data: { clip: draftClip, clipIndex: index },
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
            data: { clip: draftClip, clipIndex: index },
          })) return;
        }

        const completedClips = clips.filter(hasPlayableUrl);
        if (abortSignal.aborted) return;
        if (completedClips.length === 0) {
          throw new Error('All highlight clip generation failed. Please retry or try a different video.');
        }

        if (!sendSSE(controller, {
          stage: 'saving',
          progress: 93,
          message: 'Saving generated clips...',
        })) return;

        if (isSupabaseConfigured() && !userId.startsWith('demo-')) {
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
                status: completedClips.length === clips.length ? 'completed' : 'partial',
                highlights: JSON.stringify(highlights),
              })
              .select()
              .single();

            if (video) {
              for (const clip of completedClips) {
                // Don't save large data URLs to the database — store a placeholder
                const dbVideoUrl = clip.videoUrl?.startsWith('data:')
                  ? `data-url:${clip.id}`
                  : clip.videoUrl;
                await client.from('short_videos').insert({
                  video_id: video.id,
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
            }
          } catch (dbError) {
            console.warn('Database save failed:', dbError);
          }
        }

        if (abortSignal.aborted) return;
        sendSSE(controller, {
          stage: 'complete',
          progress: 100,
          message: `Generated ${completedClips.length} playable highlight clips.`,
          data: {
            clips,
            highlights,
            estimatedDuration: analysis.duration,
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
