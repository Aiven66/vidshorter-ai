/**
 * Temporary debug endpoint: tests the full YouTube stream URL resolution
 * pipeline (same path used by process-video) and reports which getter
 * succeeded, what quality was returned, and whether audio is separate.
 * DELETE after debugging is complete.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId') || 'v1wZwxY3CMg';
  const forceRefresh = url.searchParams.get('force') === '1';

  // Dynamically import video-clipper to access internal getters
  const videoClipper = await import('@/lib/server/video-clipper');

  const startedAt = Date.now();
  const logs: string[] = [];

  // Capture console.log to trace which getter succeeded
  const origLog = console.log;
  const origWarn = console.warn;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    captured.push(msg);
    origLog(...args);
  };
  console.warn = (...args: unknown[]) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    captured.push(`[WARN] ${msg}`);
    origWarn(...args);
  };

  try {
    // Call the internal downloadSourceVideo (which calls getYouTubeStreamUrlWithFallbacks)
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    logs.push(`Calling downloadSourceVideo for ${videoUrl} (forceRefresh=${forceRefresh})`);

    const source = await videoClipper.default.downloadSourceVideo(videoUrl, { forceRefresh });
    const elapsed = Date.now() - startedAt;

    logs.push(`Success in ${elapsed}ms`);
    logs.push(`inputPath: ${source.inputPath.slice(0, 150)}`);
    logs.push(`audioInputPath: ${source.audioInputPath || '(none)'}`);
    logs.push(`ffmpegHeaders: ${source.ffmpegHeaders ? '(set)' : '(none)'}`);

    // If inputPath is a URL, do a HEAD request to check content-length
    if (source.inputPath.startsWith('http')) {
      try {
        const headRes = await fetch(source.inputPath, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
        logs.push(`HEAD video: ${headRes.status}, content-length: ${headRes.headers.get('content-length') || '?'}, content-type: ${headRes.headers.get('content-type') || '?'}`);
      } catch (e) {
        logs.push(`HEAD video failed: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
      }
    }
    if (source.audioInputPath && source.audioInputPath.startsWith('http')) {
      try {
        const headRes = await fetch(source.audioInputPath, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
        logs.push(`HEAD audio: ${headRes.status}, content-length: ${headRes.headers.get('content-length') || '?'}, content-type: ${headRes.headers.get('content-type') || '?'}`);
      } catch (e) {
        logs.push(`HEAD audio failed: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
      }
    }

    // If inputPath is a local file, check its size
    if (!source.inputPath.startsWith('http')) {
      try {
        const { stat } = await import('node:fs/promises');
        const stats = await stat(source.inputPath);
        logs.push(`Local file size: ${Math.round(stats.size / 1024 / 1024)}MB (${stats.size} bytes)`);
      } catch (e) {
        logs.push(`stat failed: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
      }
    }

    return Response.json({
      ok: true,
      elapsedMs: elapsed,
      videoId,
      source: {
        inputPath: source.inputPath.slice(0, 200),
        audioInputPath: source.audioInputPath || null,
        hasHeaders: !!source.ffmpegHeaders,
      },
      logs,
      consoleLogs: captured.slice(-20),
    }, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    logs.push(`Failed after ${elapsed}ms`);
    return Response.json({
      ok: false,
      elapsedMs: elapsed,
      videoId,
      error: err instanceof Error ? err.message : String(err),
      logs,
      consoleLogs: captured.slice(-20),
    }, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
}
