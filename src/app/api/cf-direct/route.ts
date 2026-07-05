export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId') || 'v1wZwxY3CMg';
  const cfWorkerUrl = process.env.CF_WORKER_URL?.replace(/\/$/, '') || '';

  if (!cfWorkerUrl) {
    return Response.json({ ok: false, error: 'CF_WORKER_URL not set' }, { status: 200 });
  }

  const start = Date.now();
  try {
    const resolveU = new URL(cfWorkerUrl);
    resolveU.pathname = `${resolveU.pathname.replace(/\/$/, '')}/resolve`;
    resolveU.searchParams.set('videoId', videoId);
    resolveU.searchParams.set('maxHeight', '360');
    const resolveRes = await fetch(resolveU.toString(), { signal: AbortSignal.timeout(30_000) });
    const resolved = await resolveRes.json() as { streamUrl?: string };
    if (!resolved.streamUrl) {
      return Response.json({ ok: false, step: 'resolve', error: 'no streamUrl', elapsedMs: Date.now() - start });
    }

    // Strip ip and set ipbits=0
    const directUrl = (() => {
      try {
        const u = new URL(resolved.streamUrl);
        u.searchParams.delete('ip');
        u.searchParams.set('ipbits', '0');
        return u.toString();
      } catch {
        return resolved.streamUrl;
      }
    })();

    const res = await fetch(directUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(55_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Referer': 'https://www.youtube.com/',
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
      downloadedBytes: downloaded,
      elapsedMs: Date.now() - start,
      contentType: res.headers.get('content-type'),
    });
  } catch (err) {
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - start,
    });
  }
}
