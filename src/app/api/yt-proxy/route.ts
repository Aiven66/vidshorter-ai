export const runtime = 'edge';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const MAX_HEIGHT = parseInt(process.env.YOUTUBE_MAX_HEIGHT || '720', 10) || 720;

function parseQuality(value?: string) {
  const m = value?.match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

function netscapeCookiesToHeader(text: string) {
  const pairs: string[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split('\t');
    if (parts.length < 7) continue;
    const name = parts[5]?.trim();
    const value = parts[6]?.trim();
    if (!name) continue;
    pairs.push(`${name}=${value ?? ''}`);
  }
  return pairs.join('; ');
}

function extractVideoId(input: string) {
  if (/^[a-zA-Z0-9_-]{7,15}$/.test(input)) return input;
  try {
    const u = new URL(input);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '').trim();
      return /^[a-zA-Z0-9_-]{7,15}$/.test(id) ? id : null;
    }
    const v = u.searchParams.get('v');
    return v && /^[a-zA-Z0-9_-]{7,15}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

const CLIENTS = [
  {
    name: 'TV',
    clientName: 'TVHTML5',
    clientVersion: '7.20250312.16.00',
    userAgent: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/24.0.0',
    xClientName: '7',
    extra: { clientScreen: 'TV' },
    extraHeaders: {},
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
    clientVersion: '20.03.03',
    userAgent: 'com.google.ios.youtube/20.03.03 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    xClientName: '5',
    extra: {
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.3.2.22D82',
      clientFormFactor: 'SMALL_FORM_FACTOR',
    },
    extraHeaders: {},
  },
  {
    name: 'ANDROID_v20',
    clientName: 'ANDROID',
    clientVersion: '20.03.03',
    userAgent: 'com.google.android.youtube/20.03.03 (Linux; U; Android 14) gzip',
    xClientName: '3',
    extra: { androidSdkVersion: 34, clientFormFactor: 'SMALL_FORM_FACTOR' },
    extraHeaders: {},
  },
  {
    name: 'WEB_EMBEDDED',
    clientName: 'WEB_EMBEDDED_PLAYER',
    clientVersion: '2.20240101.00.00',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    xClientName: '56',
    extra: { clientScreen: 'EMBED' },
    extraHeaders: {
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com',
    },
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
] as const;

type Client = (typeof CLIENTS)[number];

interface Format {
  url?: string;
  mimeType?: string;
  qualityLabel?: string;
  quality?: string;
  audioQuality?: string;
  audioChannels?: number;
}

interface InnerTubeResponse {
  playabilityStatus?: { status?: string; reason?: string };
  responseContext?: { visitorData?: string };
  streamingData?: {
    formats?: Format[];
    adaptiveFormats?: Format[];
  };
}

async function resolveStreamUrl(videoId: string, client: Client) {
  const isEmbedClient = client.clientName === 'TVHTML5_SIMPLY_EMBEDDED_PLAYER' || client.clientName === 'WEB_EMBEDDED_PLAYER';
  const body: Record<string, unknown> = {
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
    context: {
      client: {
        clientName: client.clientName,
        clientVersion: client.clientVersion,
        hl: 'en',
        gl: 'US',
        ...client.extra,
      },
      ...(isEmbedClient ? { thirdParty: { embedUrl: 'https://www.youtube.com/' } } : {}),
    },
    playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
  };

  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': client.userAgent,
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/',
      'X-Youtube-Client-Name': client.xClientName,
      'X-Youtube-Client-Version': client.clientVersion,
      ...client.extraHeaders,
      ...(process.env.YOUTUBE_COOKIES ? { Cookie: netscapeCookiesToHeader(process.env.YOUTUBE_COOKIES) } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as InnerTubeResponse;
  const ps = data.playabilityStatus?.status;
  if (ps && ps !== 'OK') throw new Error(`${ps}: ${data.playabilityStatus?.reason ?? ''}`);

  const formats: Format[] = [
    ...(data.streamingData?.formats ?? []),
    ...(data.streamingData?.adaptiveFormats ?? []),
  ];
  if (!formats.length) throw new Error('No formats in response');

  const combined = formats.filter(f =>
    f.url && f.mimeType?.startsWith('video/mp4') && (f.audioQuality || f.audioChannels)
  );

  const pick =
    combined
      .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
      .filter(item => item.q > 0 && item.q <= MAX_HEIGHT)
      .sort((a, b) => b.q - a.q)[0]?.f
    || combined
      .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
      .sort((a, b) => b.q - a.q)[0]?.f
    || combined[0]
    || formats.find(f => f.url);

  if (!pick?.url) throw new Error('No direct URL');
  return {
    url: pick.url,
    userAgent: client.userAgent,
    visitorData: data.responseContext?.visitorData || '',
    xClientName: client.xClientName,
    clientVersion: client.clientVersion,
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const videoId = extractVideoId(reqUrl.searchParams.get('videoId') || reqUrl.searchParams.get('url') || '');

  if (!videoId) {
    return Response.json({ error: 'Missing or invalid videoId/url' }, { status: 400, headers: CORS });
  }

  const range = request.headers.get('range') || request.headers.get('Range') || 'bytes=0-';
  const cookieHeader = process.env.YOUTUBE_COOKIES ? netscapeCookiesToHeader(process.env.YOUTUBE_COOKIES) : '';

  let lastErr = '';
  let upstream: Response | null = null;

  for (const c of CLIENTS) {
    try {
      const stream = await resolveStreamUrl(videoId, c);
      const res = await fetch(stream.url, {
        headers: {
          Range: range,
          'User-Agent': stream.userAgent,
          'Accept': '*/*',
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(stream.visitorData ? { 'X-Goog-Visitor-Id': stream.visitorData } : {}),
          'X-Youtube-Client-Name': stream.xClientName,
          'X-Youtube-Client-Version': stream.clientVersion,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      });

      if (res.status === 200 || res.status === 206) {
        upstream = res;
        break;
      }

      lastErr = `${c.name}: upstream HTTP ${res.status}`;
    } catch (e) {
      lastErr = `${c.name}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  if (!upstream) {
    return Response.json({ error: `Failed to fetch upstream stream. ${lastErr}` }, { status: 502, headers: CORS });
  }

  const headers = new Headers();
  headers.set('Cache-Control', 'no-store');
  headers.set('Access-Control-Allow-Origin', '*');

  const passthrough = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
  ];
  for (const key of passthrough) {
    const v = upstream.headers.get(key);
    if (v) headers.set(key, v);
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
