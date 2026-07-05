export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId') || 'v1wZwxY3CMg';
  const cfWorkerUrl = process.env.CF_WORKER_URL?.replace(/\/$/, '') || '';

  if (!cfWorkerUrl) {
    return Response.json({ ok: false, error: 'CF_WORKER_URL not set' }, { status: 200 });
  }

  const resolveUrl = `${cfWorkerUrl}/resolve?videoId=${encodeURIComponent(videoId)}&maxHeight=360`;
  const start = Date.now();
  try {
    const res = await fetch(resolveUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });
    const elapsed = Date.now() - start;
    const text = await res.text().catch(() => '');
    return Response.json({
      ok: res.ok,
      status: res.status,
      elapsedMs: elapsed,
      preview: text.slice(0, 200),
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
