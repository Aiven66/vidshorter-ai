import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/**
 * Diagnostic endpoint — runs createClipFromYouTubeStream step-by-step and
 * returns intermediate values so we can see exactly where it fails on Vercel.
 *
 * GET /api/yt-debug-clip?videoId=v1wZwxY3CMg&startTime=60&endTime=120
 */

interface DebugStep {
  step: string;
  ok: boolean;
  error?: string;
  data?: unknown;
  durationMs?: number;
}

function getCfWorkerUrl() {
  const raw = String(process.env['CF_WORKER_URL'] || process.env.CF_WORKER_URL || '').trim();
  return raw ? raw.replace(/\/$/, '') : '';
}

function getAppBaseUrl() {
  const raw = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();
  const value = raw || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!value) return '';
  const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProto.replace(/\/$/, '');
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId') || 'v1wZwxY3CMg';
  const startTime = Number(url.searchParams.get('startTime') || '60');
  const endTime = Number(url.searchParams.get('endTime') || '120');
  // skipResolve=1: skip Step 2 (/resolve) to avoid consuming YouTube rate limit.
  // Step 2 calls tryClient which rate-limits the CF Worker colo, causing
  // CFWorkerSlowPath in Step 5 to fail. Skipping Step 2 simulates the real
  // flow where Vercel doesn't call /resolve separately.
  const skipResolve = url.searchParams.get('skipResolve') === '1';
  // streamUrl + streamMetadata: simulate the frontend pre-resolve flow.
  // The frontend calls CF Worker /resolve from the user's browser (not rate-limited
  // by YouTube), gets a streamUrl, and sends it to /api/process-video. This debug
  // endpoint accepts the same params to test createClipFromYouTubeStream with a
  // real pre-resolved streamUrl without going through the frontend.
  const preResolvedStreamUrl = (url.searchParams.get('streamUrl') || '').trim();
  const preResolvedMetadata: {
    userAgent?: string; visitorData?: string; xClientName?: number;
    clientVersion?: string; client?: string; audioUrl?: string;
  } = {};
  if (url.searchParams.get('userAgent')) preResolvedMetadata.userAgent = url.searchParams.get('userAgent')!;
  if (url.searchParams.get('visitorData')) preResolvedMetadata.visitorData = url.searchParams.get('visitorData')!;
  const xClientNameRaw = url.searchParams.get('xClientName');
  if (xClientNameRaw !== null) {
    const n = Number(xClientNameRaw);
    if (!Number.isNaN(n)) preResolvedMetadata.xClientName = n;
  }
  if (url.searchParams.get('clientVersion')) preResolvedMetadata.clientVersion = url.searchParams.get('clientVersion')!;
  if (url.searchParams.get('clientName')) preResolvedMetadata.client = url.searchParams.get('clientName')!;
  if (url.searchParams.get('audioUrl')) preResolvedMetadata.audioUrl = url.searchParams.get('audioUrl')!;

  const steps: DebugStep[] = [];
  const pushStep = (s: DebugStep) => steps.push(s);

  // Step 1: Check environment
  const t0 = Date.now();
  const cfWorkerUrl = getCfWorkerUrl();
  const appBaseUrl = getAppBaseUrl();
  pushStep({
    step: '1. env-check',
    ok: !!cfWorkerUrl,
    durationMs: Date.now() - t0,
    data: {
      cfWorkerUrl: cfWorkerUrl ? cfWorkerUrl.slice(0, 80) + '...' : null,
      cfWorkerHost: cfWorkerUrl ? (() => { try { return new URL(cfWorkerUrl).host; } catch { return 'parse-error'; } })() : null,
      appBaseUrl: appBaseUrl || null,
      vercelUrl: process.env.VERCEL_URL || null,
      nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL || null,
      appBaseUrlEnv: process.env.APP_BASE_URL || null,
      isVercel: !!process.env.VERCEL,
    },
  });

  // Step 2: Call CF Worker /resolve directly (skipped when skipResolve=1)
  const t1 = Date.now();
  let resolvedStreamUrl: string | null = null;
  let resolvedMetadata: Record<string, unknown> = {};
  try {
    if (skipResolve) {
      pushStep({ step: '2. cf-worker-resolve', ok: true, durationMs: 0, data: { skipped: true } });
    } else if (!cfWorkerUrl) {
      pushStep({ step: '2. cf-worker-resolve', ok: false, error: 'CF_WORKER_URL not set', durationMs: Date.now() - t1 });
    } else {
      const resolveUrl = new URL(cfWorkerUrl);
      resolveUrl.pathname = `${resolveUrl.pathname.replace(/\/$/, '')}/resolve`;
      resolveUrl.searchParams.set('videoId', videoId);
      resolveUrl.searchParams.set('maxHeight', '360');
      const r = await fetch(resolveUrl.toString(), { signal: AbortSignal.timeout(90_000) });
      const data = await r.json() as { streamUrl?: string; title?: string; quality?: string; error?: string; client?: string; audioUrl?: string; userAgent?: string; visitorData?: string; xClientName?: number; clientVersion?: string };
      resolvedStreamUrl = data.streamUrl || null;
      resolvedMetadata = {
        title: data.title,
        quality: data.quality,
        client: data.client,
        hasAudioUrl: !!data.audioUrl,
        audioUrl: data.audioUrl || null,
        userAgent: data.userAgent || null,
        visitorData: data.visitorData || null,
        xClientName: data.xClientName,
        clientVersion: data.clientVersion || null,
        streamUrlPrefix: data.streamUrl?.slice(0, 100),
      };
      pushStep({
        step: '2. cf-worker-resolve',
        ok: r.ok && !!data.streamUrl,
        error: !r.ok ? `HTTP ${r.status}` : (data.error || (!data.streamUrl ? 'no streamUrl' : undefined)),
        durationMs: Date.now() - t1,
        data: { httpStatus: r.status, ...resolvedMetadata },
      });
    }
  } catch (err) {
    pushStep({ step: '2. cf-worker-resolve', ok: false, error: String(err).slice(0, 300), durationMs: Date.now() - t1 });
  }

  // Step 3: Build /stream proxy URL (skipped when skipResolve=1)
  const t2 = Date.now();
  let streamProxyUrl: string | null = null;
  try {
    if (skipResolve) {
      pushStep({ step: '3. build-stream-proxy-url', ok: true, durationMs: 0, data: { skipped: true } });
    } else if (!cfWorkerUrl || !resolvedStreamUrl) {
      pushStep({ step: '3. build-stream-proxy-url', ok: false, error: !cfWorkerUrl ? 'CF_WORKER_URL not set' : 'no resolvedStreamUrl', durationMs: Date.now() - t2 });
    } else {
      const endpoint = new URL(cfWorkerUrl);
      endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/stream`;
      endpoint.searchParams.set('videoId', videoId);
      endpoint.searchParams.set('maxHeight', '360');
      endpoint.searchParams.set('streamUrl', resolvedStreamUrl);
      const meta = resolvedMetadata as { userAgent?: string | null; visitorData?: string | null; xClientName?: number; clientVersion?: string | null; client?: string };
      if (meta.userAgent) endpoint.searchParams.set('userAgent', meta.userAgent);
      if (meta.visitorData) endpoint.searchParams.set('visitorData', meta.visitorData);
      if (meta.xClientName !== undefined && meta.xClientName !== null) endpoint.searchParams.set('xClientName', String(meta.xClientName));
      if (meta.clientVersion) endpoint.searchParams.set('clientVersion', meta.clientVersion);
      if (meta.client) endpoint.searchParams.set('clientName', meta.client);
      streamProxyUrl = endpoint.toString();
      pushStep({
        step: '3. build-stream-proxy-url',
        ok: true,
        durationMs: Date.now() - t2,
        data: {
          proxyUrlLength: streamProxyUrl.length,
          proxyUrlPrefix: streamProxyUrl.slice(0, 120),
        },
      });
    }
  } catch (err) {
    pushStep({ step: '3. build-stream-proxy-url', ok: false, error: String(err).slice(0, 300), durationMs: Date.now() - t2 });
  }

  // Step 4: Test the /stream proxy URL with a Range request (simulates ffmpeg)
  if (streamProxyUrl) {
    const t3 = Date.now();
    try {
      const r = await fetch(streamProxyUrl, {
        headers: { Range: 'bytes=0-1048575' },
        signal: AbortSignal.timeout(15_000),
      });
      const buf = await r.arrayBuffer();
      pushStep({
        step: '4. stream-proxy-fetch',
        ok: r.status === 200 || r.status === 206,
        error: r.status !== 200 && r.status !== 206 ? `HTTP ${r.status}` : undefined,
        durationMs: Date.now() - t3,
        data: {
          httpStatus: r.status,
          bytesReceived: buf.byteLength,
          contentType: r.headers.get('content-type'),
          contentRange: r.headers.get('content-range'),
        },
      });
    } catch (err) {
      pushStep({ step: '4. stream-proxy-fetch', ok: false, error: String(err).slice(0, 300), durationMs: Date.now() - t3 });
    }
  }

  // Step 4.5: When preResolved streamUrl is provided (frontend pre-resolve flow),
  // test the CF Worker /stream fast path directly from Vercel. This catches
  // colo-mismatch issues: /resolve was made from the user's browser (CF colo A),
  // but /stream from Vercel may route to CF colo B — different egress IP causes 403.
  if (preResolvedStreamUrl && cfWorkerUrl) {
    const t35 = Date.now();
    try {
      const endpoint = new URL(cfWorkerUrl);
      endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/stream`;
      endpoint.searchParams.set('videoId', videoId);
      endpoint.searchParams.set('maxHeight', '360');
      endpoint.searchParams.set('streamUrl', preResolvedStreamUrl);
      endpoint.searchParams.set('quickCheck', '1');
      if (preResolvedMetadata.userAgent) endpoint.searchParams.set('userAgent', preResolvedMetadata.userAgent);
      if (preResolvedMetadata.visitorData) endpoint.searchParams.set('visitorData', preResolvedMetadata.visitorData);
      if (preResolvedMetadata.xClientName !== undefined) endpoint.searchParams.set('xClientName', String(preResolvedMetadata.xClientName));
      if (preResolvedMetadata.clientVersion) endpoint.searchParams.set('clientVersion', preResolvedMetadata.clientVersion);
      if (preResolvedMetadata.client) endpoint.searchParams.set('clientName', preResolvedMetadata.client);
      const fastPathUrl = endpoint.toString();
      const r = await fetch(fastPathUrl, {
        headers: { Range: 'bytes=0-1048575' },
        signal: AbortSignal.timeout(30_000),
      });
      const buf = await r.arrayBuffer();
      const cfRay = r.headers.get('cf-ray') || '';
      const errBody = (r.status !== 200 && r.status !== 206) ? new TextDecoder().decode(buf).slice(0, 300) : '';
      pushStep({
        step: '4.5. pre-resolved-stream-fetch',
        ok: r.status === 200 || r.status === 206,
        error: r.status !== 200 && r.status !== 206 ? `HTTP ${r.status} ${errBody}` : undefined,
        durationMs: Date.now() - t35,
        data: {
          httpStatus: r.status,
          bytesReceived: buf.byteLength,
          contentType: r.headers.get('content-type'),
          contentRange: r.headers.get('content-range'),
          cfRay,
          cfColo: cfRay.split('-').pop() || '',
        },
      });
    } catch (err) {
      pushStep({ step: '4.5. pre-resolved-stream-fetch', ok: false, error: String(err).slice(0, 300), durationMs: Date.now() - t35 });
    }
  }

  // Step 5: Try createClipFromYouTubeStream (the real function)
  // When streamUrl + metadata query params are provided, they simulate the
  // frontend pre-resolve flow: the user's browser called CF Worker /resolve,
  // got a streamUrl, and sent it to /api/process-video. We pass it through to
  // test the PreResolvedFastPath candidate.
  const t4 = Date.now();
  try {
    const videoClipper = (await import('@/lib/server/video-clipper')).default;
    const hasPreResolved = !!preResolvedStreamUrl;
    const clip = await videoClipper.createClipFromYouTubeStream({
      videoId,
      title: 'Debug Test Clip',
      summary: 'Diagnostic test',
      startTime,
      endTime,
      ...(hasPreResolved ? { preResolvedStreamUrl, preResolvedMetadata } : {}),
    });
    const isJpegThumbnail = clip?.videoUrl?.startsWith('data:image/jpeg');
    pushStep({
      step: '5. createClipFromYouTubeStream',
      ok: !!clip && !!clip.videoUrl && !isJpegThumbnail,
      error: !clip ? 'returned null (all candidates failed)' : (!clip.videoUrl ? 'no videoUrl' : (isJpegThumbnail ? 'got thumbnail video (JPEG data URL) — real video generation failed' : undefined)),
      durationMs: Date.now() - t4,
      data: clip ? {
        id: clip.id,
        title: clip.title,
        status: clip.status,
        videoUrlPrefix: clip.videoUrl?.slice(0, 60),
        videoUrlLength: clip.videoUrl?.length,
        thumbnailUrlPrefix: clip.thumbnailUrl?.slice(0, 40),
        isDataUrl: clip.videoUrl?.startsWith('data:'),
        usedPreResolved: hasPreResolved,
      } : { usedPreResolved: hasPreResolved },
    });
  } catch (err) {
    pushStep({ step: '5. createClipFromYouTubeStream', ok: false, error: String(err).slice(0, 500), durationMs: Date.now() - t4 });
  }

  // Step 6: Directly test createLocalClip with the /stream proxy URL.
  // This bypasses getYouTubeStreamUrlWithFallbacks and tests ffmpeg directly,
  // capturing the exact ffmpeg error message.
  // Skipped when skipResolve=1 (no streamProxyUrl available).
  if (streamProxyUrl && !skipResolve) {
    const t5 = Date.now();
    try {
      const videoClipper = (await import('@/lib/server/video-clipper')).default as unknown as {
        createLocalClip: (params: {
          inputPath: string;
          inputHeaders?: string;
          startTime: number;
          endTime: number;
          title: string;
        }) => Promise<{ outputPath?: string; publicUrl?: string; dataUrl?: string; thumbnailUrl?: string }>;
      };
      const result = await videoClipper.createLocalClip({
        inputPath: streamProxyUrl,
        inputHeaders: 'Accept: */*\r\nAccept-Encoding: identity\r\n',
        startTime,
        endTime,
        title: 'Debug Direct Clip',
      });
      const isJpeg = result.dataUrl?.startsWith('data:image/jpeg');
      pushStep({
        step: '6. createLocalClip-direct',
        ok: !!result && (!!result.dataUrl || !!result.publicUrl) && !isJpeg,
        error: !result ? 'no result' : (isJpeg ? 'got JPEG (not a real video)' : (!result.dataUrl && !result.publicUrl ? 'no output URL' : undefined)),
        durationMs: Date.now() - t5,
        data: {
          hasOutputPath: !!result.outputPath,
          hasPublicUrl: !!result.publicUrl,
          hasDataUrl: !!result.dataUrl,
          dataUrlPrefix: result.dataUrl?.slice(0, 60),
          dataUrlLength: result.dataUrl?.length,
          hasThumbnail: !!result.thumbnailUrl,
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      pushStep({ step: '6. createLocalClip-direct', ok: false, error: errMsg.slice(0, 1500), durationMs: Date.now() - t5 });
    }
  }

  return NextResponse.json({
    videoId,
    startTime,
    endTime,
    timestamp: new Date().toISOString(),
    steps,
    summary: {
      totalSteps: steps.length,
      allOk: steps.every(s => s.ok),
      failedSteps: steps.filter(s => !s.ok).map(s => s.step),
    },
  });
}
