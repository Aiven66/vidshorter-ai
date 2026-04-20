/**
 * YouTube Stream Proxy - Cloudflare Worker
 *
 * Calls YouTube InnerTube API from Cloudflare IP space (not blocked by YouTube).
 * Vercel's AWS datacenter IPs are blocked; CF IPs are not.
 *
 * Deploy:
 *   cd cf-worker
 *   npx wrangler deploy
 *
 * Then set CF_WORKER_URL in Vercel env vars.
 * GET ?videoId=dQw4w9WgXcQ → { title, duration, streamUrl, quality, client }
 */

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
    name: 'ANDROID_TESTSUITE',
    clientName: 'ANDROID_TESTSUITE',
    clientVersion: '1.9',
    userAgent: 'com.google.android.youtube/1.9 (Linux; U; Android 11) gzip',
    xClientName: '30',
    extra: { androidSdkVersion: 30 },
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
    name: 'IOS_v19',
    clientName: 'IOS',
    clientVersion: '19.29.1',
    userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
    xClientName: '5',
    extra: { deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '17.5.1.21F90' },
  },
  {
    name: 'TV_EMBEDDED',
    clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    clientVersion: '2.0',
    userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
    xClientName: '85',
    extra: {},
    thirdParty: { embedUrl: 'https://www.youtube.com/' },
  },
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const videoId = url.searchParams.get('videoId');

    const secretKey = env.CF_SECRET_KEY;
    if (secretKey && url.searchParams.get('key') !== secretKey) {
      return json({ error: 'Unauthorized' }, 401);
    }

    if (!videoId || !/^[a-zA-Z0-9_-]{7,15}$/.test(videoId)) {
      return json({ error: 'Invalid or missing videoId' }, 400);
    }

    const errors = [];
    for (const client of CLIENTS) {
      try {
        const result = await tryClient(videoId, client);
        if (result) return json({ ...result, client: client.name });
        errors.push(`${client.name}: no stream URL`);
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 150);
        errors.push(`${client.name}: ${msg}`);
      }
    }

    return json({ error: `All clients failed: ${errors.join(' | ')}` }, 502);
  },
};

async function tryClient(videoId, client) {
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
      ...(client.thirdParty ? { thirdParty: client.thirdParty } : {}),
    },
    playbackContext: {
      contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' },
    },
  };

  const resp = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
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

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const data = await resp.json();
  const ps = data.playabilityStatus?.status;
  if (ps && ps !== 'OK') throw new Error(`${ps}: ${data.playabilityStatus?.reason ?? ''}`);

  const formats = [
    ...(data.streamingData?.formats ?? []),
    ...(data.streamingData?.adaptiveFormats ?? []),
  ];

  if (!formats.length) throw new Error('No formats in response');

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
    throw new Error(`No direct URL${hasCipher ? ' (cipher)' : ''}`);
  }

  return {
    title: data.videoDetails?.title ?? 'YouTube Video',
    duration: parseInt(data.videoDetails?.lengthSeconds ?? '300', 10) || 300,
    streamUrl: format.url,
    quality: format.qualityLabel ?? format.quality ?? 'unknown',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, 'Cache-Control': 'no-store' },
  });
}
