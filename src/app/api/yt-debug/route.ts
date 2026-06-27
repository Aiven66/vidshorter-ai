/**
 * Temporary debug endpoint: calls /api/yt-stream from inside Vercel
 * to inspect what formats are actually returned.
 * DELETE after debugging is complete.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId') || 'v1wZwxY3CMg';

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || '';

  if (!baseUrl) {
    return Response.json({ error: 'No base URL available' }, { status: 500 });
  }

  const endpoint = `${baseUrl}/api/yt-stream?videoId=${encodeURIComponent(videoId)}&debug=1`;
  const startedAt = Date.now();

  try {
    const res = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(50_000),
    });
    const elapsed = Date.now() - startedAt;
    const data = await res.json();

    return Response.json({
      ok: res.ok,
      status: res.status,
      elapsedMs: elapsed,
      endpoint,
      result: data,
    }, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    return Response.json({
      ok: false,
      elapsedMs: elapsed,
      endpoint,
      error: err instanceof Error ? err.message : String(err),
    }, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
