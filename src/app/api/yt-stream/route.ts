/**
 * /api/yt-stream — Edge Runtime YouTube stream URL resolver
 *
 * WHY edge runtime?
 * Vercel serverless functions run on AWS Lambda (hkg1 datacenter) whose IPs
 * are blocked by YouTube.  Vercel Edge Functions run on Vercel's Edge Network
 * (distributed CDN nodes with non-AWS, non-datacenter IPs) that YouTube
 * does NOT block.  By making the InnerTube API call here we reliably get
 * stream URLs, then pass them back to the serverless function for ffmpeg.
 *
 * GET /api/yt-stream?videoId=<id>
 * → { title, duration, streamUrl, quality, client }  (200)
 * → { error }  (400 / 502)
 */

export const runtime = 'edge';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Client configurations — ordered by success rate and age-restriction bypass capability
const CLIENTS = [
  // ANDROID_VR (Quest/Oculus) — bypasses age restrictions without auth on most content
  {
    name: 'ANDROID_VR',
    clientName: 'ANDROID_VR',
    clientVersion: '1.57.29',
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.57.29 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    xClientName: '28',
    extra: { androidSdkVersion: 32 },
    extraHeaders: {},
  },
  // IOS v20 — returns direct un-ciphered stream URLs for most videos
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
  // ANDROID v20 — broad compatibility
  {
    name: 'ANDROID_v20',
    clientName: 'ANDROID',
    clientVersion: '20.03.03',
    userAgent: 'com.google.android.youtube/20.03.03 (Linux; U; Android 14) gzip',
    xClientName: '3',
    extra: { androidSdkVersion: 34, clientFormFactor: 'SMALL_FORM_FACTOR' },
    extraHeaders: {},
  },
  // WEB_EMBEDDED_PLAYER — bypass age restrictions via embed context
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
  // ANDROID_TESTSUITE — minimal client, sometimes avoids bot detection
  {
    name: 'ANDROID_TESTSUITE',
    clientName: 'ANDROID_TESTSUITE',
    clientVersion: '1.9',
    userAgent: 'com.google.android.youtube/1.9 (Linux; U; Android 11) gzip',
    xClientName: '30',
    extra: { androidSdkVersion: 30 },
    extraHeaders: {},
  },
  // IOS v19 — legacy fallback
  {
    name: 'IOS_v19',
    clientName: 'IOS',
    clientVersion: '19.29.1',
    userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
    xClientName: '5',
    extra: {
      deviceMake: 'Apple', deviceModel: 'iPhone16,2',
      osName: 'iPhone', osVersion: '17.5.1.21F90',
    },
    extraHeaders: {},
  },
] as const;

type Client = (typeof CLIENTS)[number];

interface Format {
  url?: string;
  signatureCipher?: string;
  cipher?: string;
  mimeType?: string;
  qualityLabel?: string;
  quality?: string;
  audioQuality?: string;
  audioChannels?: number;
}

interface InnerTubeResponse {
  videoDetails?: { title?: string; lengthSeconds?: string };
  playabilityStatus?: { status?: string; reason?: string };
  streamingData?: {
    formats?: Format[];
    adaptiveFormats?: Format[];
  };
}

async function tryClient(videoId: string, client: Client): Promise<{
  title: string; duration: number; streamUrl: string; quality: string;
} | null> {
  // Build the InnerTube request body. For WEB_EMBEDDED, include thirdParty to bypass age checks.
  const isEmbedClient = client.clientName === 'TVHTML5_SIMPLY_EMBEDDED_PLAYER' ||
                        client.clientName === 'WEB_EMBEDDED_PLAYER';
  const body: Record<string, unknown> = {
    videoId,
    context: {
      client: {
        clientName: client.clientName,
        clientVersion: client.clientVersion,
        hl: 'en',
        gl: 'US',
        ...client.extra,
      },
      ...(isEmbedClient ? {
        thirdParty: { embedUrl: 'https://www.youtube.com/' },
      } : {}),
    },
    playbackContext: {
      contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' },
    },
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
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000), // 12s per client × 6 clients = 72s max
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

  // Prefer combined audio+video MP4 with a direct URL (not ciphered)
  const combined = formats.filter(f =>
    f.url && f.mimeType?.startsWith('video/mp4') && (f.audioQuality || f.audioChannels)
  );

  const format =
    combined.find(f => f.qualityLabel?.includes('360')) ??
    combined.find(f => f.qualityLabel?.includes('480')) ??
    combined.find(f => f.qualityLabel?.includes('240')) ??
    combined[0] ??
    formats.find(f => f.url);

  if (!format?.url) {
    const hasCipher = formats.some(f => f.signatureCipher || f.cipher);
    throw new Error(`No direct URL${hasCipher ? ' (cipher-protected)' : ''}`);
  }

  return {
    title: data.videoDetails?.title ?? 'YouTube Video',
    duration: parseInt(data.videoDetails?.lengthSeconds ?? '300', 10) || 300,
    streamUrl: format.url,
    quality: format.qualityLabel ?? format.quality ?? 'unknown',
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId');

  if (!videoId || !/^[a-zA-Z0-9_-]{7,15}$/.test(videoId)) {
    return Response.json({ error: 'Missing or invalid videoId' }, { status: 400, headers: CORS });
  }

  const errors: string[] = [];

  // If YOUTUBE_COOKIES is set, try a cookie-authenticated WEB client first.
  // This reliably handles age-restricted videos and reduces bot-detection false positives.
  // To set: Vercel Dashboard → Settings → Environment Variables → YOUTUBE_COOKIES
  // Cookie format: Netscape/cookies.txt string exported from your browser.
  const ytCookies = (process.env.YOUTUBE_COOKIES || '').trim();
  if (ytCookies) {
    // Convert Netscape cookie file format to a "Cookie: name=value; ..." header string if needed
    let cookieHeader = ytCookies;
    if (ytCookies.includes('\t')) {
      // Netscape format: one cookie per line with tab-separated fields
      cookieHeader = ytCookies
        .split('\n')
        .filter(l => !l.startsWith('#') && l.trim())
        .map(l => { const p = l.split('\t'); return p.length >= 7 ? `${p[5]}=${p[6]}` : ''; })
        .filter(Boolean)
        .join('; ');
    }

    if (cookieHeader) {
      try {
        const body: Record<string, unknown> = {
          videoId,
          context: {
            client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US' },
          },
          playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
        };
        const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/',
            'X-Youtube-Client-Name': '1',
            'X-Youtube-Client-Version': '2.20240101.00.00',
            'Cookie': cookieHeader,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(12_000),
        });
        if (res.ok) {
          const data = await res.json() as InnerTubeResponse;
          const ps = data.playabilityStatus?.status;
          if (ps === 'OK') {
            const formats: Format[] = [
              ...(data.streamingData?.formats ?? []),
              ...(data.streamingData?.adaptiveFormats ?? []),
            ];
            const combined = formats.filter(f =>
              f.url && f.mimeType?.startsWith('video/mp4') && (f.audioQuality || f.audioChannels)
            );
            const format =
              combined.find(f => f.qualityLabel?.includes('360')) ??
              combined.find(f => f.qualityLabel?.includes('480')) ??
              combined.find(f => f.qualityLabel?.includes('240')) ??
              combined[0] ?? formats.find(f => f.url);
            if (format?.url) {
              return Response.json({
                title: data.videoDetails?.title ?? 'YouTube Video',
                duration: parseInt(data.videoDetails?.lengthSeconds ?? '300', 10) || 300,
                streamUrl: format.url,
                quality: format.qualityLabel ?? format.quality ?? 'unknown',
                client: 'WEB_COOKIES',
              }, { status: 200, headers: { ...CORS, 'Cache-Control': 'no-store' } });
            }
          }
          errors.push(`WEB_COOKIES: ${ps ?? 'no stream'}: ${data.playabilityStatus?.reason ?? ''}`);
        } else {
          errors.push(`WEB_COOKIES: HTTP ${res.status}`);
        }
      } catch (e) {
        errors.push(`WEB_COOKIES: ${e instanceof Error ? e.message.slice(0, 100) : String(e)}`);
      }
    }
  }

  for (const client of CLIENTS) {
    try {
      const result = await tryClient(videoId, client);
      if (result) {
        return Response.json(
          { ...result, client: client.name },
          { status: 200, headers: { ...CORS, 'Cache-Control': 'no-store' } }
        );
      }
      errors.push(`${client.name}: no stream URL`);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 150);
      errors.push(`${client.name}: ${msg}`);
    }
  }

  return Response.json(
    { error: `All clients failed: ${errors.join(' | ')}` },
    { status: 502, headers: CORS }
  );
}
