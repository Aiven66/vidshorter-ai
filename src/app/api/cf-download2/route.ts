export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 240;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId') || 'v1wZwxY3CMg';
  const cfWorkerUrl = process.env.CF_WORKER_URL?.replace(/\/$/, '') || '';

  if (!cfWorkerUrl) {
    return Response.json({ ok: false, error: 'CF_WORKER_URL not set' }, { status: 200 });
  }

  const start = Date.now();
  let step = 'resolve';
  let downloaded = 0;
  try {
    // /resolve
    const resolveU = new URL(cfWorkerUrl);
    resolveU.pathname = `${resolveU.pathname.replace(/\/$/, '')}/resolve`;
    resolveU.searchParams.set('videoId', videoId);
    resolveU.searchParams.set('maxHeight', '360');
    const resolveRes = await fetch(resolveU.toString(), { signal: AbortSignal.timeout(30_000) });
    const resolved = await resolveRes.json() as { streamUrl?: string; userAgent?: string; visitorData?: string; xClientName?: number; clientVersion?: string; client?: string };
    if (!resolved.streamUrl) {
      return Response.json({ ok: false, step: 'resolve', error: 'no streamUrl', status: resolveRes.status, elapsedMs: Date.now() - start });
    }

    // Build /stream?streamUrl=...
    step = 'build';
    const strippedStreamUrl = (() => {
      try {
        const u = new URL(resolved.streamUrl);
        u.searchParams.delete('ip');
        u.searchParams.set('ipbits', '0');
        return u.toString();
      } catch {
        return resolved.streamUrl;
      }
    })();

    const u = new URL(cfWorkerUrl);
    u.pathname = `${u.pathname.replace(/\/$/, '')}/stream`;
    u.searchParams.set('videoId', videoId);
    u.searchParams.set('maxHeight', '360');
    u.searchParams.set('streamUrl', strippedStreamUrl);
    if (resolved.userAgent) u.searchParams.set('userAgent', resolved.userAgent);
    if (resolved.visitorData) u.searchParams.set('visitorData', resolved.visitorData);
    if (resolved.xClientName !== undefined) u.searchParams.set('xClientName', String(resolved.xClientName));
    if (resolved.clientVersion) u.searchParams.set('clientVersion', resolved.clientVersion);
    if (resolved.client) u.searchParams.set('clientName', resolved.client);
    const streamUrl = u.toString();
    step = 'download';

    const res = await fetch(streamUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(200_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      },
    });
    if (!res.ok) {
      return Response.json({ ok: false, step, status: res.status, elapsedMs: Date.now() - start });
    }
    if (!res.body) return Response.json({ ok: false, step, error: 'empty body' });
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.length;
      if (downloaded >= 100 * 1024 * 1024) break;
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
      step,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - start,
      downloadedBytes: downloaded,
    });
  }
}
