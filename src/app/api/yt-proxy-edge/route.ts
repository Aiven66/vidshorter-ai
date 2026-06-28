/**
 * /api/yt-proxy-edge — Edge Runtime YouTube stream proxy
 *
 * WHY: Vercel serverless (Node.js) IPs are blocked by googlevideo.com.
 * Edge Runtime runs on Vercel's Edge Network (different IPs, not blocked).
 * This route resolves the stream URL via InnerTube API AND proxies the
 * actual video bytes back to the Node.js function for ffmpeg processing.
 *
 * GET /api/yt-proxy-edge?videoId=<id>&audio=0&maxHeight=360
 * → Streaming response (video/mp4 bytes from googlevideo.com)
 * → Supports HTTP Range requests for ffmpeg seeking
 */

export const runtime = 'edge';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': 'Range',
};

const MAX_HEIGHT = parseInt(process.env.YOUTUBE_MAX_HEIGHT || '1080', 10) || 1080;

// In-memory cache for stream URLs (survives across requests on the same edge node)
interface CachedStream {
  streamUrl: string;
  audioUrl?: string;
  expiresAt: number;
}
const streamCache = new Map<string, CachedStream>();

// ── Player JS cache for cipher decryption ──────────────────────────────────────
let playerJsCache: { url: string; code: string; expiresAt: number } = { url: '', code: '', expiresAt: 0 };

function parseQuality(value?: string) {
  const m = value?.match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

const CLIENTS = [
  {
    name: 'TV',
    clientName: 'TVHTML5',
    clientVersion: '7.20250623.16.00',
    userAgent: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/24.0.0',
    xClientName: '7',
    extra: { clientScreen: 'TV' },
    extraHeaders: {} as Record<string, string>,
  },
  {
    name: 'TV_EMBEDDED',
    clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    clientVersion: '2.20250623.00.00',
    userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/7.0 TV Safari/538.1',
    xClientName: '85',
    extra: {},
    extraHeaders: { 'Referer': 'https://www.youtube.com/', 'Origin': 'https://www.youtube.com' },
  },
  {
    name: 'ANDROID_VR',
    clientName: 'ANDROID_VR',
    clientVersion: '1.57.29',
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.57.29 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    xClientName: '28',
    extra: { androidSdkVersion: 32 },
    extraHeaders: {},
  },
  {
    name: 'IOS_v20',
    clientName: 'IOS',
    clientVersion: '20.10.4',
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_5_0 like Mac OS X;)',
    xClientName: '5',
    extra: { deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.5.0.22F75' },
    extraHeaders: {},
  },
  {
    name: 'ANDROID_v20',
    clientName: 'ANDROID',
    clientVersion: '20.10.4',
    userAgent: 'com.google.android.youtube/20.10.4 (Linux; U; Android 14) gzip',
    xClientName: '3',
    extra: { androidSdkVersion: 34 },
    extraHeaders: {},
  },
  {
    name: 'WEB_EMBEDDED',
    clientName: 'WEB_EMBEDDED_PLAYER',
    clientVersion: '2.20250623.01.00',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    xClientName: '56',
    extra: {},
    extraHeaders: { 'Referer': 'https://www.youtube.com/', 'Origin': 'https://www.youtube.com' },
  },
  {
    name: 'ANDROID_TESTSUITE',
    clientName: 'ANDROID_TESTSUITE',
    clientVersion: '1.9',
    userAgent: 'com.google.android.youtube/1.9 (Linux; U; Android 11) gzip',
    xClientName: '30',
    extra: { androidSdkVersion: 30 },
    extraHeaders: {},
  },
];

interface Format {
  url?: string;
  signatureCipher?: string;
  mimeType?: string;
  qualityLabel?: string;
  quality?: string;
  audioQuality?: string;
  audioChannels?: number;
  bitrate?: string;
  fps?: number;
}

interface InnerTubeResponse {
  videoDetails?: { title?: string; lengthSeconds?: string };
  streamingData?: {
    formats?: Format[];
    adaptiveFormats?: Format[];
  };
  playabilityStatus?: { status?: string; reason?: string };
}

async function fetchPlayerJs(): Promise<string> {
  const now = Date.now();
  if (playerJsCache.code && now < playerJsCache.expiresAt) return playerJsCache.code;

  try {
    const baseRes = await fetch('https://www.youtube.com/', {
      signal: AbortSignal.timeout(8000),
    });
    const html = await baseRes.text();
    const playerUrlMatch = html.match(/"PLAYER_JS_URL":"([^"]+)"/);
    if (!playerUrlMatch) return '';
    const playerUrl = playerUrlMatch[1].replace(/\\u002f/g, '/').replace(/\\\//g, '/');
    const fullUrl = playerUrl.startsWith('http') ? playerUrl : `https://www.youtube.com${playerUrl}`;

    const jsRes = await fetch(fullUrl, { signal: AbortSignal.timeout(8000) });
    const code = await jsRes.text();
    playerJsCache = { url: fullUrl, code, expiresAt: now + 6 * 3600 * 1000 };
    return code;
  } catch {
    return '';
  }
}

function extractDecipherFunc(playerJs: string): ((sig: string) => string) | null {
  try {
    const extractBody = (name: string, body: string): string | null => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = body.match(new RegExp(`${escaped}\\s*=\\s*function\\s*\\(([^)]*)\\)\\s*\\{([\\s\\S]*?)\\};`));
      if (!m) return null;
      return m[2];
    };

    const decipherNameMatch = playerJs.match(/"signature"\s*,\s*([a-zA-Z0-9_$]+)\s*\(/);
    if (!decipherNameMatch) return null;
    const decipherName = decipherNameMatch[1];
    const decipherBody = extractBody(decipherName, playerJs);
    if (!decipherBody) return null;

    const stepsMatch = decipherBody.match(/([a-zA-Z0-9_$]+)\.([a-zA-Z0-9_$]+)\(([^,]+),(\d+)\)/g);
    if (!stepsMatch || !stepsMatch.length) return null;

    const objNameMatch = decipherBody.match(/([a-zA-Z0-9_$]+)\./);
    if (!objNameMatch) return null;
    const objName = objNameMatch[1];

    const objBodyMatch = playerJs.match(new RegExp(`var\\s+${objName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*\\{([\\s\\S]*?)\\};`));
    if (!objBodyMatch) return null;
    const objBody = objBodyMatch[1];

    const operations: ((arr: string[], arg: number) => void)[] = [];
    for (const step of stepsMatch) {
      const parts = step.match(/\.([a-zA-Z0-9_$]+)\(([^,]+),(\d+)\)/);
      if (!parts) continue;
      const methodName = parts[1];
      const arg = parseInt(parts[3], 10);

      const methodMatch = objBody.match(new RegExp(`${methodName}\\s*:\\s*function\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\}`));
      if (!methodMatch) continue;
      const methodBody = methodMatch[1];

      if (methodBody.includes('reverse')) {
        operations.push((arr) => arr.reverse());
      } else if (methodBody.includes('splice')) {
        operations.push((arr, a) => { arr.splice(0, a); });
      } else {
        operations.push((arr, a) => {
          const temp = arr[0];
          arr[0] = arr[a % arr.length];
          arr[a % arr.length] = temp;
        });
      }
    }

    return (sig: string) => {
      const arr = sig.split('');
      for (const op of operations) op(arr, 0);
      return arr.join('');
    };
  } catch {
    return null;
  }
}

function decipherUrl(format: Format, playerJs: string): string | null {
  if (format.url) return format.url;
  if (!format.signatureCipher) return null;

  const params = new URLSearchParams(format.signatureCipher);
  const s = params.get('s');
  const sp = params.get('sp') || 'signature';
  const url = params.get('url');
  if (!s || !url) return null;

  const decipher = extractDecipherFunc(playerJs);
  if (!decipher) return null;

  const signature = decipher(s);
  const finalUrl = new URL(url);
  finalUrl.searchParams.set(sp, signature);
  return finalUrl.toString();
}

async function tryClient(
  videoId: string,
  client: typeof CLIENTS[0],
  maxHeight: number,
): Promise<{ streamUrl: string; audioUrl?: string; title: string; duration: number; quality: string } | null> {
  const body = {
    videoId,
    context: {
      client: {
        clientName: client.clientName,
        clientVersion: client.clientVersion,
        hl: 'en',
        gl: 'US',
        ...client.extra,
      },
    },
    playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
  };

  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': client.userAgent,
      ...client.extraHeaders,
      ...(client.xClientName ? { 'X-Youtube-Client-Name': client.xClientName } : {}),
      'X-Youtube-Client-Version': client.clientVersion,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) return null;

  const data = await res.json() as InnerTubeResponse;
  const ps = data.playabilityStatus?.status;
  if (ps && ps !== 'OK') return null;

  const formats: Format[] = [
    ...(data.streamingData?.formats ?? []),
    ...(data.streamingData?.adaptiveFormats ?? []),
  ];
  if (!formats.length) return null;

  // Get player JS for cipher decryption if needed
  const needsCipher = formats.some(f => !f.url && f.signatureCipher);
  const playerJs = needsCipher ? await fetchPlayerJs() : '';

  const combined = formats.filter(f =>
    (f.url || f.signatureCipher) && f.mimeType?.startsWith('video/mp4') && (f.audioQuality || f.audioChannels)
  );

  const resolveUrl = (f: Format): string | null => {
    if (f.url) return f.url;
    if (f.signatureCipher && playerJs) return decipherUrl(f, playerJs);
    return null;
  };

  const combinedResolved = combined.map(f => ({ f, url: resolveUrl(f) })).filter(x => x.url);
  const combinedBest =
    combinedResolved
      .map(x => ({ ...x, q: parseQuality(x.f.qualityLabel ?? x.f.quality) }))
      .filter(x => x.q > 0 && x.q <= maxHeight)
      .sort((a, b) => b.q - a.q)[0]
    || combinedResolved
      .map(x => ({ ...x, q: parseQuality(x.f.qualityLabel ?? x.f.quality) }))
      .sort((a, b) => b.q - a.q)[0]
    || combinedResolved[0];

  const combinedHeight = combinedBest ? parseQuality(combinedBest.f.qualityLabel ?? combinedBest.f.quality) : 0;

  let format = combinedBest?.f;
  let audioUrl: string | undefined;
  let streamUrl = combinedBest?.url;

  // Try adaptive formats for HD if combined is low quality
  if (combinedHeight < 720 || !streamUrl) {
    const videoOnly = formats.filter(f =>
      (f.url || f.signatureCipher) && f.mimeType?.startsWith('video/mp4') && !(f.audioQuality || f.audioChannels)
    );
    const audioOnly = formats.filter(f =>
      (f.url || f.signatureCipher) && (f.mimeType?.startsWith('audio/mp4') || f.mimeType?.includes('audio/'))
    );

    const videoResolved = videoOnly.map(f => ({ f, url: resolveUrl(f) })).filter(x => x.url);
    const bestVideo =
      videoResolved
        .map(x => ({ ...x, q: parseQuality(x.f.qualityLabel ?? x.f.quality) }))
        .filter(x => x.q > 0 && x.q <= maxHeight)
        .sort((a, b) => b.q - a.q)[0]
      || videoResolved
        .map(x => ({ ...x, q: parseQuality(x.f.qualityLabel ?? x.f.quality) }))
        .sort((a, b) => b.q - a.q)[0];

    if (bestVideo && (!streamUrl || parseQuality(bestVideo.f.qualityLabel ?? bestVideo.f.quality) > combinedHeight)) {
      format = bestVideo.f;
      streamUrl = bestVideo.url;

      const audioResolved = audioOnly.map(f => ({ f, url: resolveUrl(f) })).filter(x => x.url);
      const bestAudio = audioResolved
        .sort((a, b) => parseQuality(b.f.quality) - parseQuality(a.f.quality))[0];
      if (bestAudio?.url) audioUrl = bestAudio.url;
    }
  }

  if (!streamUrl) return null;

  return {
    streamUrl,
    audioUrl,
    title: data.videoDetails?.title ?? 'YouTube Video',
    duration: parseInt(data.videoDetails?.lengthSeconds ?? '300', 10) || 300,
    quality: format?.qualityLabel ?? format?.quality ?? 'unknown',
  };
}

async function resolveStreamUrl(videoId: string, maxHeight: number, audioOnly: boolean): Promise<{ streamUrl: string; title: string }> {
  // Check cache first
  const cacheKey = `${videoId}_${maxHeight}`;
  const cached = streamCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { streamUrl: audioOnly && cached.audioUrl ? cached.audioUrl : cached.streamUrl, title: 'YouTube Video' };
  }

  const errors: string[] = [];
  for (const client of CLIENTS) {
    try {
      const result = await tryClient(videoId, client, maxHeight);
      if (result) {
        streamCache.set(cacheKey, {
          streamUrl: result.streamUrl,
          audioUrl: result.audioUrl,
          expiresAt: Date.now() + 30 * 60 * 1000, // 30 min cache
        });
        return { streamUrl: audioOnly && result.audioUrl ? result.audioUrl : result.streamUrl, title: result.title };
      }
      errors.push(`${client.name}: no stream`);
    } catch (e) {
      errors.push(`${client.name}: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`);
    }
  }

  throw new Error(`All clients failed: ${errors.join(' | ')}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId');
  const audio = url.searchParams.get('audio') === '1';
  const maxHeight = Math.min(parseInt(url.searchParams.get('maxHeight') || '360', 10) || 360, MAX_HEIGHT);

  if (!videoId || !/^[a-zA-Z0-9_-]{7,15}$/.test(videoId)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing videoId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  try {
    const { streamUrl } = await resolveStreamUrl(videoId, maxHeight, audio);

    // Build fetch headers — pass Range through for ffmpeg seeking
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com',
    };

    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    // Fetch from googlevideo.com through Edge Runtime (not blocked)
    const streamRes = await fetch(streamUrl, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(25_000),
    });

    if (!streamRes.ok && streamRes.status !== 206) {
      return new Response(JSON.stringify({
        error: `Stream fetch failed: HTTP ${streamRes.status}`,
        streamUrl: streamUrl.slice(0, 100),
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // Build response headers — pass through content-type, content-length, content-range
    const responseHeaders: Record<string, string> = {
      ...CORS,
      'Content-Type': streamRes.headers.get('Content-Type') || (audio ? 'audio/mp4' : 'video/mp4'),
      'Accept-Ranges': 'bytes',
    };

    const contentLength = streamRes.headers.get('Content-Length');
    if (contentLength) responseHeaders['Content-Length'] = contentLength;

    const contentRange = streamRes.headers.get('Content-Range');
    if (contentRange) responseHeaders['Content-Range'] = contentRange;

    // Stream the response body back
    return new Response(streamRes.body, {
      status: streamRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function HEAD(request: Request) {
  return GET(request);
}
