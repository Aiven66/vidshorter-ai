import { NextRequest, NextResponse } from 'next/server';

/**
 * Video Proxy API
 *
 * Proxies video URLs to bypass CORS restrictions and enable
 * in-browser playback + download of clipped videos.
 *
 * GET /api/video-proxy?url=<encoded_url>&title=<title>&download=true
 *
 * Supports Range requests for video seeking.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');

  if (!videoUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Build fetch headers — forward the Range header for seeking support
    const fetchHeaders: Record<string, string> = {
      'Accept': 'video/*, */*',
      'User-Agent': 'VidShorterAI/1.0',
    };

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    const upstream = await fetch(videoUrl, { headers: fetchHeaders });

    if (!upstream.ok && upstream.status !== 206) {
      console.error(`[video-proxy] upstream ${upstream.status} for ${videoUrl.substring(0, 120)}`);
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: upstream.status }
      );
    }

    // Prepare response headers
    const respHeaders = new Headers();

    // Content type
    const ct = upstream.headers.get('content-type');
    respHeaders.set('Content-Type', ct || 'video/mp4');

    // CORS
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', 'Range');
    respHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type, Accept-Ranges');

    // Range support
    respHeaders.set('Accept-Ranges', 'bytes');
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) {
      respHeaders.set('Content-Range', contentRange);
    }

    // Content length
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) {
      respHeaders.set('Content-Length', contentLength);
    }

    // Cache
    respHeaders.set('Cache-Control', 'public, max-age=3600');

    // Download disposition
    if (searchParams.get('download') === 'true') {
      const title = searchParams.get('title') || 'video_clip';
      const safeName = title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
      respHeaders.set('Content-Disposition', `attachment; filename="${safeName}.mp4"`);
    }

    const status = upstream.status; // 200 or 206
    return new NextResponse(upstream.body, { status, headers: respHeaders });
  } catch (error) {
    console.error('[video-proxy] Error:', error);
    return NextResponse.json({ error: 'Proxy fetch failed' }, { status: 502 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Accept-Ranges',
      'Access-Control-Max-Age': '86400',
    },
  });
}
