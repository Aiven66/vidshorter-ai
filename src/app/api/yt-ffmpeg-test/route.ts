import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 290;

/**
 * Minimal test: run createLocalClip directly with CF Worker /stream URL.
 * Captures the exact ffmpeg error message.
 *
 * GET /api/yt-ffmpeg-test?videoId=v1wZwxY3CMg&startTime=60&endTime=90
 */

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId') || 'v1wZwxY3CMg';
  const startTime = Number(url.searchParams.get('startTime') || '60');
  const endTime = Number(url.searchParams.get('endTime') || '90');

  const cfWorkerUrl = String(process.env['CF_WORKER_URL'] || '').trim().replace(/\/$/, '');
  if (!cfWorkerUrl) {
    return NextResponse.json({ error: 'CF_WORKER_URL not set' }, { status: 500 });
  }

  // Build CF Worker /stream slow path URL (no streamUrl param)
  const streamUrl = `${cfWorkerUrl}/stream?videoId=${encodeURIComponent(videoId)}&maxHeight=360`;

  const t0 = Date.now();
  try {
    const videoClipper = (await import('@/lib/server/video-clipper')).default as unknown as {
      createLocalClip: (params: {
        inputPath: string;
        inputHeaders?: string;
        startTime: number;
        endTime: number;
        title: string;
      }) => Promise<{ outputPath?: string; publicUrl?: string; dataUrl?: string; thumbnailUrl?: string }>;
    };

    const result = await videoClipper.createLocalClip({
      inputPath: streamUrl,
      inputHeaders: 'Accept: */*\r\nAccept-Encoding: identity\r\n',
      startTime,
      endTime,
      title: 'FFmpeg Test',
    });

    const isJpeg = result.dataUrl?.startsWith('data:image/jpeg');
    return NextResponse.json({
      ok: !!result && (!!result.dataUrl || !!result.publicUrl) && !isJpeg,
      isJpegThumbnail: isJpeg,
      durationMs: Date.now() - t0,
      streamUrl: streamUrl.slice(0, 100),
      result: {
        hasOutputPath: !!result.outputPath,
        hasPublicUrl: !!result.publicUrl,
        hasDataUrl: !!result.dataUrl,
        dataUrlPrefix: result.dataUrl?.slice(0, 60),
        dataUrlLength: result.dataUrl?.length,
        hasThumbnail: !!result.thumbnailUrl,
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      error: errMsg.slice(0, 3000),
      durationMs: Date.now() - t0,
      streamUrl: streamUrl.slice(0, 100),
    }, { status: 200 }); // Return 200 so we can see the error in the response body
  }
}
