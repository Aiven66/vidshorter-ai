import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils, VideoEditClient, FrameExtractorClient } from 'coze-coding-dev-sdk';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

// Helper to send SSE messages
function sendMessage(controller: ReadableStreamDefaultController, data: object) {
  const encoder = new TextEncoder();
  const message = `data: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(encoder.encode(message));
}

export async function POST(request: NextRequest) {
  const { videoUrl, userId, sourceType, videoFile, aiConfig } = await request.json();

  if (!videoUrl && !videoFile) {
    return new Response(JSON.stringify({ error: 'Missing video URL or file' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Missing userId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

      // Build Config: admin-configured key takes priority over env vars
      const config = new Config(
        (aiConfig?.enabled && aiConfig?.apiKey)
          ? {
              apiKey: aiConfig.apiKey,
              baseUrl: aiConfig.baseUrl || process.env.COZE_INTEGRATION_BASE_URL,
              modelBaseUrl: aiConfig.modelBaseUrl || process.env.COZE_INTEGRATION_MODEL_BASE_URL,
            }
          : {
              apiKey: process.env.COZE_WORKLOAD_IDENTITY_API_KEY,
              baseUrl: process.env.COZE_INTEGRATION_BASE_URL,
              modelBaseUrl: process.env.COZE_INTEGRATION_MODEL_BASE_URL,
            }
      );

      // Determine which model to use
      const llmModel = (aiConfig?.enabled && aiConfig?.model)
        ? aiConfig.model
        : 'doubao-seed-1-8-251228';

      try {
        // Stage 1: Initialize
        sendMessage(controller, {
          stage: 'init',
          progress: 5,
          message: 'Initializing video processing...'
        });

        // Validate video URL
        const finalVideoUrl = videoUrl || videoFile;
        if (!finalVideoUrl) {
          throw new Error('No valid video source provided');
        }

        // Stage 2: Extract frames
        sendMessage(controller, {
          stage: 'extract_frames',
          progress: 10,
          message: 'Extracting video frames for analysis...'
        });

        let frames: Array<{ index: number; screenshot: string; timestamp_ms: number }> = [];
        let videoDuration = 300; // Default 5 minutes

        try {
          const frameClient = new FrameExtractorClient(config, customHeaders);
          const frameResponse = await frameClient.extractByCount(finalVideoUrl, 20);
          frames = frameResponse.data?.chunks || [];
          
          // Estimate duration from frames
          if (frames.length > 0) {
            const lastFrame = frames[frames.length - 1];
            videoDuration = Math.ceil(lastFrame.timestamp_ms / 1000) + 30;
          }

          sendMessage(controller, {
            stage: 'frames_extracted',
            progress: 25,
            message: `Extracted ${frames.length} frames for analysis`,
            frames: frames.length
          });
        } catch (frameError) {
          console.warn('Frame extraction failed, using default analysis:', frameError);
          sendMessage(controller, {
            stage: 'frames_fallback',
            progress: 25,
            message: 'Using default analysis (frame extraction unavailable)'
          });
        }

        // Stage 3: AI Analysis
        sendMessage(controller, {
          stage: 'ai_analysis',
          progress: 30,
          message: 'AI is analyzing video content...'
        });

        const llmClient = new LLMClient(config, customHeaders);
        
        // Build the analysis prompt
        const analysisPrompt = `You are an expert video content analyst. Analyze this video and identify the 3 most engaging highlights that would make great 30-60 second short video clips.

Video Information:
- URL: ${finalVideoUrl}
- Estimated Duration: ${videoDuration} seconds
- Frames Extracted: ${frames.length}

${frames.length > 0 ? `
Frame timestamps available at: ${frames.map(f => `${Math.floor(f.timestamp_ms/1000)}s`).join(', ')}
` : ''}

For each highlight, provide:
1. A catchy title (max 8 words)
2. Start time in seconds (must be >= 0)
3. End time in seconds (must be <= ${videoDuration} and at least 30 seconds after start)
4. A brief summary of why this moment is engaging (max 20 words)
5. An engagement score from 1-10

Guidelines:
- Each clip should be 30-60 seconds long
- Focus on moments with high emotional impact, key information, or visual interest
- Avoid overlapping segments
- Prefer moments that work as standalone clips

Respond with ONLY valid JSON in this exact format:
{
  "highlights": [
    {
      "title": "Highlight Title",
      "start_time": 15,
      "end_time": 45,
      "summary": "Brief description",
      "engagement_score": 8
    }
  ]
}`;

        let highlights: Array<{
          title: string;
          start_time: number;
          end_time: number;
          summary: string;
          engagement_score: number;
        }> = [];

        try {
          const llmResponse = await llmClient.invoke([
            { role: 'system', content: 'You are an expert video content analyst. Always respond with valid JSON only, no markdown formatting.' },
            { role: 'user', content: analysisPrompt },
          ], {
            model: llmModel,
            temperature: 0.7,
          });

          // Parse LLM response
          const content = llmResponse.content;
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            highlights = parsed.highlights || [];
          }

          sendMessage(controller, {
            stage: 'ai_complete',
            progress: 50,
            message: `AI identified ${highlights.length} highlights`,
            highlights: highlights.length
          });
        } catch (llmError) {
          console.error('LLM analysis error:', llmError);
          
          // Generate default highlights based on video duration
          const segmentDuration = Math.min(30, videoDuration / 4);
          highlights = [
            { 
              title: 'Opening Hook', 
              start_time: 0, 
              end_time: Math.min(30, videoDuration), 
              summary: 'The opening moments that set the tone',
              engagement_score: 7 
            },
            { 
              title: 'Key Moment', 
              start_time: Math.min(60, videoDuration / 3), 
              end_time: Math.min(90, videoDuration / 3 + 30), 
              summary: 'Important content in the middle section',
              engagement_score: 8 
            },
            { 
              title: 'Memorable Ending', 
              start_time: Math.max(0, videoDuration - 60), 
              end_time: videoDuration, 
              summary: 'The impactful conclusion',
              engagement_score: 7 
            },
          ];

          sendMessage(controller, {
            stage: 'ai_fallback',
            progress: 50,
            message: 'Using default highlight selection',
            highlights: highlights.length
          });
        }

        // Stage 4: Generate clips
        sendMessage(controller, {
          stage: 'generating_clips',
          progress: 60,
          message: 'Generating short video clips...'
        });

        const videoEditClient = new VideoEditClient(config, customHeaders);
        const clips: Array<{
          id: string;
          title: string;
          startTime: number;
          endTime: number;
          duration: number;
          summary: string;
          engagementScore: number;
          thumbnailUrl: string;
          videoUrl: string | null;
          status: string;
        }> = [];

        for (let i = 0; i < highlights.length; i++) {
          const highlight = highlights[i];
          const clipProgress = 60 + (i + 1) * 10;
          
          sendMessage(controller, {
            stage: 'processing_clip',
            progress: clipProgress,
            message: `Processing clip ${i + 1}/${highlights.length}: ${highlight.title}`,
            clipIndex: i
          });

          // Find closest frame for thumbnail
          const thumbnailFrame = frames.find(f => 
            Math.abs(f.timestamp_ms / 1000 - highlight.start_time) < 15
          ) || frames[i * Math.floor(frames.length / highlights.length)];

          let clipUrl: string | null = null;
          let clipStatus = 'pending';

          try {
            // Actually trim the video
            const trimResponse = await videoEditClient.videoTrim(finalVideoUrl, {
              startTime: highlight.start_time,
              endTime: highlight.end_time,
            });
            
            clipUrl = trimResponse.url;
            clipStatus = 'completed';
          } catch (trimError) {
            console.warn(`Failed to trim clip ${i + 1}:`, trimError);
            clipStatus = 'error';
          }

          clips.push({
            id: `clip-${Date.now()}-${i}`,
            title: highlight.title,
            startTime: highlight.start_time,
            endTime: highlight.end_time,
            duration: highlight.end_time - highlight.start_time,
            summary: highlight.summary,
            engagementScore: highlight.engagement_score,
            thumbnailUrl: thumbnailFrame?.screenshot || `https://picsum.photos/320/180?random=${i + 1}`,
            videoUrl: clipUrl,
            status: clipStatus
          });
        }

        // Stage 5: Save to database (if configured)
        sendMessage(controller, {
          stage: 'saving',
          progress: 95,
          message: 'Saving results...'
        });

        // Try to save to Supabase if configured
        if (isSupabaseConfigured() && !userId.startsWith('demo-')) {
          try {
            const { getSupabaseClient } = await import('@/storage/database/supabase-client');
            const client = getSupabaseClient(userId);

            // Create video record
            const { data: video } = await client
              .from('videos')
              .insert({
                user_id: userId,
                original_url: finalVideoUrl,
                source_type: sourceType || 'url',
                status: 'completed',
                highlights: JSON.stringify(highlights),
              })
              .select()
              .single();

            if (video) {
              // Save short videos
              for (const clip of clips) {
                await client.from('short_videos').insert({
                  video_id: video.id,
                  user_id: userId,
                  url: clip.videoUrl || finalVideoUrl,
                  start_time: clip.startTime,
                  end_time: clip.endTime,
                  highlight_title: clip.title,
                  highlight_summary: clip.summary,
                  thumbnail_url: clip.thumbnailUrl,
                });
              }
            }
          } catch (dbError) {
            console.warn('Failed to save to database:', dbError);
          }
        }

        // Stage 6: Complete
        sendMessage(controller, {
          stage: 'complete',
          progress: 100,
          message: 'Processing complete!',
          clips: clips
        });

      } catch (error) {
        console.error('Video processing error:', error);
        sendMessage(controller, {
          stage: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : 'An error occurred during processing',
          error: true
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
