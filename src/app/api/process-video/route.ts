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
  videoUrl: string | null;
  status: 'processing' | 'completed' | 'failed';
}

interface SSEMessage {
  stage: string;
  progress: number;
  message: string;
  data?: Record<string, unknown>;
}

function sendSSE(controller: ReadableStreamDefaultController<Uint8Array>, payload: SSEMessage) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`));
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

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ProcessVideoRequest;
  const videoUrl = body.videoUrl?.trim();
  const userId = body.userId?.trim();
  const sourceType = body.sourceType?.trim() || 'url';

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
        sendSSE(controller, {
          stage: 'init',
          progress: 5,
          message: 'Initializing AutoClip-style processing...',
        });

        const isBilibili = videoUrl.includes('bilibili.com') || videoUrl.includes('b23.tv');
        sendSSE(controller, {
          stage: 'ai_analysis',
          progress: 20,
          message: isBilibili
            ? 'Analyzing Bilibili video metadata and timeline...'
            : 'Analyzing subtitles and timeline to find highlight moments...',
        });

        const analysis = await videoClipper.analyzeVideo(videoUrl);
        const highlights = analysis.highlights as Highlight[];

        sendSSE(controller, {
          stage: 'analysis_complete',
          progress: 45,
          message: `Found ${highlights.length} highlight moments in "${analysis.title}".`,
          data: {
            highlights,
            estimatedDuration: analysis.duration,
          },
        });

        const clips: ClipResult[] = [];
        let sourceInputPath = '';

        sendSSE(controller, {
          stage: 'generating_clip',
          progress: 48,
          message: 'Downloading source video for clip generation...',
        });

        try {
          sourceInputPath = await videoClipper.downloadSourceVideo(videoUrl);
        } catch (error) {
          throw new Error(
            error instanceof Error
              ? `Failed to prepare source video: ${error.message}`
              : 'Failed to prepare source video.'
          );
        }

        if (!sourceInputPath) {
          throw new Error('Failed to prepare source video: no file path returned.');
        }

        for (let index = 0; index < highlights.length; index += 1) {
          const highlight = highlights[index];
          const draftClip: ClipResult = {
            id: `clip-${Date.now()}-${index}`,
            title: highlight.title,
            startTime: highlight.start_time,
            endTime: highlight.end_time,
            duration: highlight.end_time - highlight.start_time,
            summary: highlight.summary,
            engagementScore: highlight.engagement_score,
            thumbnailUrl: '',
            videoUrl: null,
            status: 'processing',
          };

          sendSSE(controller, {
            stage: 'generating_clip',
            progress: 50 + Math.floor((index / highlights.length) * 35),
            message: `Generating clip ${index + 1}/${highlights.length}: "${highlight.title}"`,
            data: { clip: draftClip, clipIndex: index },
          });

          try {
            const result = await videoClipper.createLocalClip({
              inputPath: sourceInputPath,
              startTime: highlight.start_time,
              endTime: highlight.end_time,
              title: highlight.title,
            });

            draftClip.videoUrl = result.publicUrl;
            draftClip.thumbnailUrl = result.thumbnailUrl || '';
            draftClip.status = 'completed';
          } catch (error) {
            console.warn(`Clip generation failed for "${highlight.title}":`, error);
            draftClip.status = 'failed';
            draftClip.videoUrl = null;
          }

          clips.push(draftClip);

          sendSSE(controller, {
            stage: 'clip_ready',
            progress: 55 + Math.floor(((index + 1) / highlights.length) * 35),
            message:
              draftClip.status === 'completed'
                ? `Clip ready: "${highlight.title}"`
                : `Clip failed: "${highlight.title}"`,
            data: { clip: draftClip, clipIndex: index },
          });
        }

        const completedClips = clips.filter(hasPlayableUrl);
        if (completedClips.length === 0) {
          throw new Error('All highlight clip generation failed. Please retry or try a different video.');
        }

        sendSSE(controller, {
          stage: 'saving',
          progress: 93,
          message: 'Saving generated clips...',
        });

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
                duration: analysis.duration,
                status: completedClips.length === clips.length ? 'completed' : 'partial',
                highlights: JSON.stringify(highlights),
              })
              .select()
              .single();

            if (video) {
              for (const clip of completedClips) {
                await client.from('short_videos').insert({
                  video_id: video.id,
                  user_id: userId,
                  url: clip.videoUrl,
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
        console.error('Video processing failed:', error);
        sendSSE(controller, {
          stage: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : 'Unexpected processing error',
          data: { error: true },
        });
      } finally {
        controller.close();
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
