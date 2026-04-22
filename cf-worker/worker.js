//**
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

const MAX_HEIGHT = 1080;
const cache = new Map();

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const videoId = url.searchParams.get('videoId');
    const mode = url.pathname.endsWith('/stream') ? 'stream' : 'resolve';
    const maxHeight = normalizeMaxHeight(url.searchParams.get('maxHeight'));

    const secretKey = env.CF_SECRET_KEY;
    if (secretKey && url.searchParams.get('key') !== secretKey) {
      return json({ error: 'Unauthorized' }, 401);
    }

    if (!videoId || !/^[a-zA-Z0-9_-]{7,15}$/.test(videoId)) {
      return json({ error: 'Invalid or missing videoId' }, 400);
    }

    if (mode === 'stream') {
      try {
        const resolved = await resolveCached(videoId, maxHeight);
        const range = request.headers.get('Range') || request.headers.get('range') || 'bytes=0-';
        const upstream = await fetch(resolved.streamUrl, {
          headers: {
            Range: range,
            'User-Agent': resolved.userAgent,
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/',
            ...(resolved.visitorData ? { 'X-Goog-Visitor-Id': resolved.visitorData } : {}),
            'X-Youtube-Client-Name': resolved.xClientName,
            'X-Youtube-Client-Version': resolved.clientVersion,
          },
        });

        if (upstream.status !== 200 && upstream.status !== 206) {
          const body = await upstream.text().catch(() => '');
          return json({ error: `Upstream HTTP ${upstream.status}`, details: body.slice(0, 200) }, 502);
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
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    const errors = [];
    for (const client of CLIENTS) {
      try {
        const result = await tryClient(videoId, client, maxHeight);
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

function normalizeMaxHeight(value) {
  const n = parseInt(String(value || ''), 10);
  if (!Number.isFinite(n)) return MAX_HEIGHT;
  if (n < 144) return 144;
  if (n > MAX_HEIGHT) return MAX_HEIGHT;
  return n;
}

async function tryClient(videoId, client, maxHeight) {
  const body = {
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

  const visitorData = data.responseContext?.visitorData || '';

  const formats = [
    ...(data.streamingData?.formats ?? []),
    ...(data.streamingData?.adaptiveFormats ?? []),
  ];

  if (!formats.length) throw new Error('No formats in response');

  const videoFormats = formats.filter((f) =>
    f?.url && typeof f.mimeType === 'string' && f.mimeType.startsWith('video/')
  );
  const muxed = videoFormats.filter((f) => f.audioQuality || f.audioChannels || f.audioBitrate);
  const format = pickBest(muxed.length ? muxed : videoFormats, maxHeight);

  if (!format?.url) {
    const hasCipher = formats.some(f => f.signatureCipher || f.cipher);
    throw new Error(`No direct URL${hasCipher ? ' (cipher)' : ''}`);
  }

  return {
    title: data.videoDetails?.title ?? 'YouTube Video',
    duration: parseInt(data.videoDetails?.lengthSeconds ?? '300', 10) || 300,
    streamUrl: format.url,
    quality: format.qualityLabel ?? format.quality ?? 'unknown',
    userAgent: client.userAgent,
    visitorData,
    xClientName: client.xClientName,
    clientVersion: client.clientVersion,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, 'Cache-Control': 'no-store' },
  });
}

function parseQuality(value) {
  const m = String(value || '').match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

function formatHeight(format) {
  if (format && typeof format.height === 'number' && Number.isFinite(format.height)) {
    return format.height;
  }
  return parseQuality(format?.qualityLabel || format?.quality);
}

function pickBest(formats, maxHeight) {
  const withQ = (formats || [])
    .map((f) => ({
      f,
      q: formatHeight(f),
      muxed: !!(f && (f.audioQuality || f.audioChannels || f.audioBitrate)),
    }))
    .filter((x) => x.f?.url);
  const limit = typeof maxHeight === 'number' && Number.isFinite(maxHeight) ? maxHeight : MAX_HEIGHT;
  const sortFn = (a, b) => (Number(b.muxed) - Number(a.muxed)) || (b.q - a.q);
  const under = withQ.filter((x) => x.q > 0 && x.q <= limit).sort(sortFn)[0]?.f;
  const any = withQ.sort(sortFn)[0]?.f;
  return under || any || (formats || []).find((f) => f?.url);
}

async function resolveCached(videoId, maxHeight) {
  const cacheKey = `${videoId}|${String(maxHeight || MAX_HEIGHT)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const errors = [];
  for (const client of CLIENTS) {
    try {
      const result = await tryClient(videoId, client, maxHeight);
      if (result?.streamUrl) {
        const value = {
          streamUrl: result.streamUrl,
          userAgent: result.userAgent,
          visitorData: result.visitorData,
          xClientName: result.xClientName,
          clientVersion: result.clientVersion,
        };
        cache.set(cacheKey, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
        return value;
      }
      errors.push(`${client.name}: no stream URL`);
    } catch (e) {
      errors.push(`${client.name}: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
    }
  }
  throw new Error(`All clients failed: ${errors.join(' | ')}`);
}
**
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

const MAX_HEIGHT = 1080;
const cache = new Map();

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const videoId = url.searchParams.get('videoId');
    const mode = url.pathname.endsWith('/stream') ? 'stream' : 'resolve';
    const maxHeight = normalizeMaxHeight(url.searchParams.get('maxHeight'));

    const secretKey = env.CF_SECRET_KEY;
    if (secretKey && url.searchParams.get('key') !== secretKey) {
      return json({ error: 'Unauthorized' }, 401);
    }

    if (!videoId || !/^[a-zA-Z0-9_-]{7,15}$/.test(videoId)) {
      return json({ error: 'Invalid or missing videoId' }, 400);
    }

    if (mode === 'stream') {
      try {
        const resolved = await resolveCached(videoId, maxHeight);
        const range = request.headers.get('Range') || request.headers.get('range') || 'bytes=0-';
        const upstream = await fetch(resolved.streamUrl, {
          headers: {
            Range: range,
            'User-Agent': resolved.userAgent,
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/',
            ...(resolved.visitorData ? { 'X-Goog-Visitor-Id': resolved.visitorData } : {}),
            'X-Youtube-Client-Name': resolved.xClientName,
            'X-Youtube-Client-Version': resolved.clientVersion,
          },
        });

        if (upstream.status !== 200 && upstream.status !== 206) {
          const body = await upstream.text().catch(() => '');
          return json({ error: `Upstream HTTP ${upstream.status}`, details: body.slice(0, 200) }, 502);
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
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    const errors = [];
    for (const client of CLIENTS) {
      try {
        const result = await tryClient(videoId, client, maxHeight);
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

function normalizeMaxHeight(value) {
  const n = parseInt(String(value || ''), 10);
  if (!Number.isFinite(n)) return MAX_HEIGHT;
  if (n < 144) return 144;
  if (n > MAX_HEIGHT) return MAX_HEIGHT;
  return n;
}

async function tryClient(videoId, client, maxHeight) {
  const body = {
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

  const visitorData = data.responseContext?.visitorData || '';

  const formats = [
    ...(data.streamingData?.formats ?? []),
    ...(data.streamingData?.adaptiveFormats ?? []),
  ];

  if (!formats.length) throw new Error('No formats in response');

  const combined = formats.filter(f =>
    f.url && f.mimeType?.startsWith('video/mp4') && (f.audioQuality || f.audioChannels)
  );

  const format = pickBest(combined.length ? combined : formats, maxHeight);

  if (!format?.url) {
    const hasCipher = formats.some(f => f.signatureCipher || f.cipher);
    throw new Error(`No direct URL${hasCipher ? ' (cipher)' : ''}`);
  }

  return {
    title: data.videoDetails?.title ?? 'YouTube Video',
    duration: parseInt(data.videoDetails?.lengthSeconds ?? '300', 10) || 300,
    streamUrl: format.url,
    quality: format.qualityLabel ?? format.quality ?? 'unknown',
    userAgent: client.userAgent,
    visitorData,
    xClientName: client.xClientName,
    clientVersion: client.clientVersion,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, 'Cache-Control': 'no-store' },
  });
}

function parseQuality(value) {
  const m = String(value || '').match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

function pickBest(formats, maxHeight) {
  const withQ = (formats || []).map(f => ({ f, q: parseQuality(f.qualityLabel || f.quality) })).filter(x => x.f?.url);
  const limit = typeof maxHeight === 'number' && Number.isFinite(maxHeight) ? maxHeight : MAX_HEIGHT;
  const under = withQ.filter(x => x.q > 0 && x.q <= limit).sort((a, b) => b.q - a.q)[0]?.f;
  const any = withQ.sort((a, b) => b.q - a.q)[0]?.f;
  return under || any || (formats || []).find(f => f?.url);
}

async function resolveCached(videoId, maxHeight) {
  const cacheKey = `${videoId}|${String(maxHeight || MAX_HEIGHT)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const errors = [];
  for (const client of CLIENTS) {
    try {
      const result = await tryClient(videoId, client, maxHeight);
      if (result?.streamUrl) {
        const value = {
          streamUrl: result.streamUrl,
          userAgent: result.userAgent,
          visitorData: result.visitorData,
          xClientName: result.xClientName,
          clientVersion: result.clientVersion,
        };
        cache.set(cacheKey, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
        return value;
      }
      errors.push(`${client.name}: no stream URL`);
    } catch (e) {
      errors.push(`${client.name}: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
    }
  }
  throw new Error(`All clients failed: ${errors.join(' | ')}`);
}
