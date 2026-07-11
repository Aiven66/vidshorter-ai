import { NextRequest, NextResponse } from 'next/server';
import { readFile, unlink } from 'fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Vercel Serverless Function response payload limits:
// Hobby ~4.5 MB, Pro ~6 MB. Stay well under that to avoid 413/502.
const API_MAX_CLIP_BYTES = 4 * 1024 * 1024;
const API_MAX_CLIP_DURATION = 90; // seconds

/**
 * /api/download-youtube-clip
 *
 * Server-side YouTube clip downloader + ffmpeg cutter.
 *
 * WHY this exists:
 *   Browser-side recording (captureStream, canvas, Web Audio) is fragile:
 *   cross-origin video taints canvas, audio elements output zeroes due to
 *   CORS taint, autoplay policies block playback, and seek may fail silently.
 *   The result is clips with no audio and/or all clips starting at 0:00.
 *
 * HOW it works:
 *   1. Receives videoId, startTime, endTime, title
 *   2. Uses video-clipper.downloadYouTubeClip() (yt-dlp/CF Worker → streamUrl+audioUrl)
 *   3. ffmpeg merges video+audio and cuts [startTime, endTime]
 *   4. Returns the MP4 as a base64 data URL
 *
 * On Vercel the output is inlined as base64 so the file survives across
 * Lambda invocations. The output size is capped to ~4 MB.
 */
export async function GET(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId');
  const startTime = parseFloat(url.searchParams.get('startTime') || '0');
  const endTime = parseFloat(url.searchParams.get('endTime') || '0');
  const title = url.searchParams.get('title') || 'clip';

  if (!videoId || !/^[a-zA-Z0-9_-]{7,15}$/.test(videoId)) {
    return NextResponse.json(
      { error: 'Invalid or missing videoId' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return NextResponse.json(
      { error: 'Invalid startTime/endTime' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const duration = endTime - startTime;
  if (duration > API_MAX_CLIP_DURATION) {
    return NextResponse.json(
      { error: `Clip duration too long: ${duration.toFixed(1)}s (max ${API_MAX_CLIP_DURATION}s)` },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  let outputPathToClean: string | undefined;
  try {
    const videoClipper = (await import('@/lib/server/video-clipper')).default;

    console.log(`[download-youtube-clip] videoId=${videoId} start=${startTime} end=${endTime} duration=${duration.toFixed(1)}s`);

    const result = await videoClipper.downloadYouTubeClip({
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title,
      startTime,
      endTime,
      maxInlineBytes: API_MAX_CLIP_BYTES,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Clip generation returned empty result' },
        { status: 502, headers: CORS_HEADERS },
      );
    }

    // Prefer dataUrl (base64 inline) — already size-capped by maxInlineBytes
    if (result.dataUrl && result.dataUrl.startsWith('data:')) {
      return NextResponse.json(
        {
          success: true,
          dataUrl: result.dataUrl,
          thumbnailUrl: result.thumbnailUrl || '',
          title,
        },
        { headers: CORS_HEADERS },
      );
    }

    // Fallback: read outputPath and return as data URL if it fits
    if (result.outputPath) {
      outputPathToClean = result.outputPath;
      try {
        const clipBuffer = await readFile(result.outputPath);
        if (clipBuffer.length <= API_MAX_CLIP_BYTES) {
          const dataUrl = `data:video/mp4;base64,${clipBuffer.toString('base64')}`;
          return NextResponse.json(
            {
              success: true,
              dataUrl,
              thumbnailUrl: result.thumbnailUrl || '',
              title,
            },
            { headers: CORS_HEADERS },
          );
        }
      } catch (readErr) {
        console.error('[download-youtube-clip] Failed to read outputPath:', readErr);
      }
    }

    return NextResponse.json(
      { error: 'No usable clip output (file too large or generation failed)', result },
      { status: 502, headers: CORS_HEADERS },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[download-youtube-clip] failed:', message);
    return NextResponse.json(
      { error: 'Clip generation failed', details: message.slice(0, 500) },
      { status: 502, headers: CORS_HEADERS },
    );
  } finally {
    if (outputPathToClean) {
      try { await unlink(outputPathToClean); } catch {}
    }
  }
}
