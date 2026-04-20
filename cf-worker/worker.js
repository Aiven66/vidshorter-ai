/**
 * YouTube Stream Proxy - Cloudflare Worker
 *
 * This worker calls YouTube's InnerTube API from Cloudflare's IP space.
 * Cloudflare IPs are NOT blocked by YouTube, making this the most reliable
 * solution for Vercel deployments where AWS datacenter IPs are blocked.
 *
 * Deploy:
 *   cd cf-worker && npx wrangler deploy
 *
 * Usage (from Vercel):
 *   Set CF_WORKER_URL = https://youtube-proxy.<your-subdomain>.workers.dev
 *   GET ?videoId=dQw4w9WgXcQ
 *   Returns: { title, duration, streamUrl, quality, client }
 *
 * Optional security:
 *   Set CF_SECRET_KEY in wrangler.toml [vars] and CF_WORKER_SECRET in Vercel env vars.
 *   The worker will require ?key=<secret> in requests.
 */

// YouTube InnerTube clients that return direct (non-cipher) stream URLs
const CLIENTS = [
  {
    name: 'IOS',
    clientName: 'IOS',
    clientVersion: '19.29.1',
    userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
    xClientName: '5',
  },
  {
    name: 'ANDROID',
    clientName: 'ANDROID',
    clientVersion: '19.30.37',
    userAgent: 'com.google.android.youtube/19.30.37(Linux; U; Android 11) gzip',
    xClientName: '3',
  },
  {
    name: 'TV_EMBEDDED',
    clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    clientVersion: '2.0',
    userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
    xClientName: '85',
  },
  {
    name: 'TV',
    clientName: 'TVHTML5',
    clientVersion: '7.20240724.13.00',
    userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
    xClientName: '7',
  },
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const videoId = url.searchParams.get('videoId');

    // Optional secret key protection (prevents unauthorized use of your worker)
    const secretKey = env.CF_SECRET_KEY;
    if (secretKey && url.searchParams.get('key') !== secretKey) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return jsonResponse({ error: 'Invalid or missing videoId (must be 11-char YouTube video ID)' }, 400);
    }

    const errors = [];

    for (const client of CLIENTS) {
      try {
        const result = await fetchYouTubeStream(videoId, client);
        if (result) {
          return jsonResponse({ ...result, client: client.name }, 200);
        }
        errors.push(`${client.name}: no stream URL found`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${client.name}: ${msg.slice(0, 120)}`);
        console.error(`[yt-proxy] ${client.name} failed:`, msg.slice(0, 200));
      }
    }

    return jsonResponse({
      error: `All YouTube clients failed. Errors:\n${errors.join('\n')}`,
    }, 502);
  },
};

async function fetchYouTubeStream(videoId, client) {
  const body = {
    videoId,
    context: {
      client: {
        clientName: client.clientName,
        clientVersion: client.clientVersion,
        hl: 'en',
        gl: 'US',
        utcOffsetMinutes: 0,
      },
    },
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: 'HTML5_PREF_WANTS',
      },
    },
  };

  const resp = await fetch('https://www.youtube.com/youtubei/v1/player', {
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
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} from YouTube InnerTube API`);
  }

  const data = await resp.json();

  // Check playability
  const playStatus = data.playabilityStatus?.status;
  if (playStatus && playStatus !== 'OK') {
    throw new Error(`playabilityStatus=${playStatus}: ${data.playabilityStatus?.reason ?? ''}`);
  }

  const formats = [
    ...(data.streamingData?.formats ?? []),
    ...(data.streamingData?.adaptiveFormats ?? []),
  ];

  if (!formats.length) {
    throw new Error('No formats in InnerTube response');
  }

  // Find a format with a direct URL (not signatureCipher) and audio+video
  const combined = formats.filter(f =>
    f.url && // Direct URL (no cipher needed)
    f.mimeType?.startsWith('video/mp4') &&
    (f.audioQuality || f.audioChannels) // Has audio
  );

  const format =
    combined.find(f => f.qualityLabel?.includes('360')) ??
    combined.find(f => f.qualityLabel?.includes('480')) ??
    combined.find(f => f.qualityLabel?.includes('240')) ??
    combined.find(f => f.qualityLabel?.includes('144')) ??
    combined[0] ??
    formats.find(f => f.url); // Any format with a direct URL

  if (!format?.url) {
    const hasCipher = formats.some(f => f.signatureCipher || f.cipher);
    throw new Error(`No direct URL${hasCipher ? ' (cipher-protected, try another client)' : ''}`);
  }

  const title = data.videoDetails?.title ?? 'YouTube Video';
  const duration = parseInt(data.videoDetails?.lengthSeconds ?? '300', 10);

  return {
    title,
    duration: Number.isFinite(duration) ? duration : 300,
    streamUrl: format.url,
    quality: format.qualityLabel ?? format.quality ?? 'unknown',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      'Cache-Control': 'no-store',
    },
  });
}
