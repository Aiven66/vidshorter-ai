export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId') || 'v1wZwxY3CMg';
  const maxBytes = Number(url.searchParams.get('maxBytes')) || 50 * 1024 * 1024;
  const cfWorkerUrl = process.env.CF_WORKER_URL?.replace(/\/$/, '') || '';

  if (!cfWorkerUrl) {
    return Response.json({ ok: false, error: 'CF_WORKER_URL not set' }, { status: 200 });
  }

  const streamUrl = `${cfWorkerUrl}/stream?videoId=${encodeURIComponent(videoId)}&maxHeight=360`;
  const start = Date.now();
  let downloaded = 0;
  try {
    const res = await fetch(streamUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(55_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      },
    });
    if (!res.ok) {
      return Response.json({ ok: false, status: res.status, elapsedMs: Date.now() - start });
    }
    if (!res.body) return Response.json({ ok: false, error: 'empty body' });
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.length;
      if (downloaded >= maxBytes) break;
    }
    return Response.json({
      ok: true,
      status: res.status,
      downloadedBytes: downloaded,
      elapsedMs: Date.now() - start,
      contentLength: res.headers.get('content-length'),
      contentRange: res.headers.get('content-range'),
    });
  } catch (err) {
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - start,
      downloadedBytes: downloaded,
    });
  }
}
