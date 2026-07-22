/**
 * /api/yt-clip-download — Edge Runtime YouTube clip downloader
 *
 * WHY: CF Worker /stream returns 502 (YouTube blocked SJC colo for all clients).
 * But CF Worker /resolve still works (returns streamUrl). The streamUrl can be
 * downloaded directly from Vercel Edge Runtime (runs on Vercel's Edge Network,
 * not AWS datacenter IPs that YouTube blocks).
 *
 * Flow:
 * 1. Browser calls /api/yt-clip-download?videoId=<id>&startTime=<s>&endTime=<s>
 * 2. This Edge Function calls CF Worker /resolve to get streamUrl
 * 3. Downloads video bytes from googlevideo.com (Edge IPs not blocked)
 * 4. Streams the bytes back to browser with CORS headers + Content-Disposition
 *
 * Returns: video/mp4 stream (downloadable)
 */

export const runtime = 'edge';
// Force dynamic — prevents Next.js from trying to statically generate this API route at build time.
export const dynamic = 'force-dynamic';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId');
  const startTime = parseFloat(url.searchParams.get('startTime') || '0');
  const endTime = parseFloat(url.searchParams.get('endTime') || '0');
  const clipTitle = url.searchParams.get('title') || 'clip';

  if (!videoId || !/^[a-zA-Z0-9_-]{7,15}$/.test(videoId)) {
    return new Response(JSON.stringify({ error: 'Invalid videoId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const cfWorkerUrl = process.env.CF_WORKER_URL?.replace(/\/$/, '');
  if (!cfWorkerUrl) {
    return new Response(JSON.stringify({ error: 'CF_WORKER_URL not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  try {
    // Step 1: Resolve streamUrl via CF Worker (InnerTube API — works on all colos)
    const resolveUrl = `${cfWorkerUrl}/resolve?videoId=${videoId}&maxHeight=360`;
    const resolveRes = await fetch(resolveUrl, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!resolveRes.ok) {
      return new Response(JSON.stringify({
        error: 'resolve_failed',
        status: resolveRes.status,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const resolved = await resolveRes.json() as {
      streamUrl?: string;
      userAgent?: string;
      visitorData?: string;
      xClientName?: string;
      clientVersion?: string;
      client?: string;
    };

    if (!resolved.streamUrl) {
      return new Response(JSON.stringify({ error: 'no_stream_url' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Step 2: Build fetch URL with begin parameter for seeking to startTime
    // The `begin` parameter (in milliseconds) makes YouTube return a byte stream
    // starting from the video position. The returned data is a valid MP4 file.
    let fetchUrl = resolved.streamUrl;
    const duration = Math.max(1, endTime - startTime);
    const beginMs = Math.max(0, Math.floor(startTime * 1000));

    try {
      const u = new URL(fetchUrl);
      if (beginMs > 0 && u.hostname.includes('googlevideo.com')) {
        u.searchParams.set('begin', String(beginMs));
      }
      // Strip ip binding to avoid 403 when edge node IP differs from resolve IP
      u.searchParams.delete('ip');
      u.searchParams.set('ipbits', '0');
      fetchUrl = u.toString();
    } catch {
      // If URL parsing fails, use the original streamUrl
    }

    // Step 3: Fetch video bytes from googlevideo.com
    // Edge Runtime runs on Vercel's Edge Network (non-datacenter IPs)
    const range = request.headers.get('Range');
    const headers: Record<string, string> = {
      'User-Agent': resolved.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/',
    };
    if (resolved.visitorData) headers['X-Goog-Visitor-Id'] = resolved.visitorData;
    if (resolved.xClientName) headers['X-Youtube-Client-Name'] = resolved.xClientName;
    if (resolved.clientVersion) headers['X-Youtube-Client-Version'] = resolved.clientVersion;
    if (range) headers['Range'] = range;

    const videoRes = await fetch(fetchUrl, {
      headers,
      signal: AbortSignal.timeout(55_000),
    });

    if (!videoRes.ok && videoRes.status !== 206) {
      const errBody = await videoRes.text().catch(() => '');
      return new Response(JSON.stringify({
        error: 'video_fetch_failed',
        status: videoRes.status,
        details: errBody.slice(0, 200),
        debug: url.searchParams.get('debug') === '1' ? {
          fetchUrlPrefix: fetchUrl.slice(0, 100),
          hasVisitorData: !!resolved.visitorData,
          client: resolved.client,
          xClientName: resolved.xClientName,
        } : undefined,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Step 4: Stream video bytes back to browser with download headers
    const responseHeaders: Record<string, string> = {
      ...CORS_HEADERS,
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${clipTitle.replace(/[^a-zA-Z0-9]/g, '_')}.mp4"`,
      'Cache-Control': 'no-store',
    };

    // Forward content-length and content-range if present
    const contentLength = videoRes.headers.get('content-length');
    const contentRange = videoRes.headers.get('content-range');
    if (contentLength) responseHeaders['Content-Length'] = contentLength;
    if (contentRange) {
      responseHeaders['Content-Range'] = contentRange;
      responseHeaders['Accept-Ranges'] = 'bytes';
    }

    if (!videoRes.body) {
      return new Response(JSON.stringify({ error: 'no_video_body' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Stream the video body directly
    return new Response(videoRes.body, {
      status: videoRes.status,
      headers: responseHeaders,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({
      error: 'download_failed',
      message: message.slice(0, 200),
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}
