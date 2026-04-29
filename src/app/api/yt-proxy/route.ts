export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

export async function GET(request: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  const reqUrl = new URL(request.url);
  const videoId = (() => {
    const raw = (reqUrl.searchParams.get('videoId') || reqUrl.searchParams.get('url') || '').trim();
    if (/^[a-zA-Z0-9_-]{7,15}$/.test(raw)) return raw;
    try {
      const u = new URL(raw);
      if (u.hostname.includes('youtu.be')) {
        const id = u.pathname.replace('/', '').trim();
        return /^[a-zA-Z0-9_-]{7,15}$/.test(id) ? id : null;
      }
      const v = u.searchParams.get('v');
      return v && /^[a-zA-Z0-9_-]{7,15}$/.test(v) ? v : null;
    } catch {
      return null;
    }
  })();

  if (!videoId) {
    return Response.json({ error: 'Missing or invalid videoId/url' }, { status: 400, headers: corsHeaders });
  }

  const maxHeight = (() => {
    const maxEnv = parseInt(process.env.YOUTUBE_MAX_HEIGHT || '1080', 10) || 1080;
    const n = parseInt(String(reqUrl.searchParams.get('maxHeight') || ''), 10);
    const v = Number.isFinite(n) ? n : maxEnv;
    return Math.max(144, Math.min(maxEnv, v));
  })();

  const cfWorkerUrl = String(process.env.CF_WORKER_URL || '').trim().replace(/\/$/, '');
  if (!cfWorkerUrl) {
    return Response.json({ error: 'CF_WORKER_URL not configured' }, { status: 500, headers: corsHeaders });
  }

  const key = String(process.env.CF_WORKER_KEY || process.env.CF_SECRET_KEY || '').trim();
  const range = request.headers.get('range') || request.headers.get('Range') || 'bytes=0-';
  const streamEndpoint = new URL(cfWorkerUrl);
  streamEndpoint.pathname = `${streamEndpoint.pathname.replace(/\/$/, '')}/stream`;
  streamEndpoint.searchParams.set('videoId', videoId);
  streamEndpoint.searchParams.set('maxHeight', String(maxHeight));
  if (key) streamEndpoint.searchParams.set('key', key);

  const upstream = await fetch(streamEndpoint.toString(), {
    headers: {
      Range: range,
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
    },
  });

  if (upstream.status !== 200 && upstream.status !== 206) {
    let details = '';
    try { details = (await upstream.text()).slice(0, 220); } catch {}
    return Response.json(
      { error: `Worker stream failed. HTTP ${upstream.status}${details ? `: ${details}` : ''}` },
      { status: 502, headers: corsHeaders },
    );
  }

  const headers = new Headers();
  headers.set('Cache-Control', 'no-store');
  headers.set('Access-Control-Allow-Origin', '*');

  const passthrough = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
  for (const k of passthrough) {
    const v = upstream.headers.get(k);
    if (v) headers.set(k, v);
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
