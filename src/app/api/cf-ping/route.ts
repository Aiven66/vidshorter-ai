export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId') || 'v1wZwxY3CMg';
  const beginMs = url.searchParams.get('begin') || '60000';
  const cfWorkerUrl = process.env.CF_WORKER_URL?.replace(/\/$/, '') || '';

  if (!cfWorkerUrl) {
    return Response.json({ ok: false, error: 'CF_WORKER_URL not set' }, { status: 200 });
  }

  const streamUrl = `${cfWorkerUrl}/stream?videoId=${encodeURIComponent(videoId)}&maxHeight=360&begin=${beginMs}`;
  const start = Date.now();
  try {
    const res = await fetch(streamUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      },
    });
    let downloaded = 0;
    if (res.body) {
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        downloaded += value.length;
        if (downloaded >= 5 * 1024 * 1024) break;
      }
    }
    return Response.json({
      ok: res.ok,
      status: res.status,
      elapsedMs: Date.now() - start,
      downloadedBytes: downloaded,
      cfWorkerUrlPrefix: cfWorkerUrl.slice(0, 40),
    });
  } catch (err) {
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - start,
      cfWorkerUrlPrefix: cfWorkerUrl.slice(0, 40),
    });
  }
}
