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

// Current mobile client versions — must stay up-to-date to avoid HTTP 400
const CLIENTS = [
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
  },
  {
    name: 'ANDROID_v20',
    clientName: 'ANDROID',
    clientVersion: '20.03.03',
    userAgent: 'com.google.android.youtube/20.03.03 (Linux; U; Android 14) gzip',
    xClientName: '3',
    extra: { androidSdkVersion: 34, clientFormFactor: 'SMALL_FORM_FACTOR' },
  },
  {
    name: 'ANDROID_TESTSUITE',
    clientName: 'ANDROID_TESTSUITE',
    clientVersion: '1.9',
    userAgent: 'com.google.android.youtube/1.9 (Linux; U; Android 11) gzip',
    xClientName: '30',
    extra: { androidSdkVersion: 30 },
  },
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
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
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
