export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId') || 'v1wZwxY3CMg';
  const beginMs = url.searchParams.get('begin') || '60000';
  const cfWorkerUrl = process.env.CF_WORKER_URL?.replace(/\/$/, '') || '';

  if (!cfWorkerUrl) {
    return Response.json({ ok: false, error: 'CF_WORKER_URL not set' }, { status: 200 });
  }

  const results: Record<string, unknown> = {
    cfWorkerUrlPrefix: cfWorkerUrl.slice(0, 40),
    videoId,
  };

  // Test 1: /resolve — returns JSON with streamUrl or error details
  const resolveUrl = `${cfWorkerUrl}/resolve?videoId=${encodeURIComponent(videoId)}&maxHeight=360`;
  const t1 = Date.now();
  try {
    const res = await fetch(resolveUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(45_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });
    const text = await res.text().catch(() => '');
    let json: unknown = null;
    try { json = JSON.parse(text); } catch {}
    results.resolve = {
      ok: res.ok,
      status: res.status,
      elapsedMs: Date.now() - t1,
      bodyText: text.slice(0, 2000),
      bodyJson: json,
    };
  } catch (err) {
    results.resolve = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - t1,
    };
  }

  // Test 2: /stream with begin param — returns binary stream or 502 error
  const streamUrl = `${cfWorkerUrl}/stream?videoId=${encodeURIComponent(videoId)}&maxHeight=360&begin=${beginMs}`;
  const t2 = Date.now();
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
    const text = await res.text().catch(() => '');
    results.stream = {
      ok: res.ok,
      status: res.status,
      elapsedMs: Date.now() - t2,
      contentType: res.headers.get('content-type'),
      bodyText: text.slice(0, 2000),
      bodyBytes: text.length,
    };
  } catch (err) {
    results.stream = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - t2,
    };
  }

  return Response.json(results);
}
