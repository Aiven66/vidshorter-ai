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
  {
    name: 'IOS_v19',
    clientName: 'IOS',
    clientVersion: '19.29.1',
    userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
    xClientName: '5',
    extra: { deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '17.5.1.21F90' },
    extraHeaders: {},
  },
  {
    name: 'TV_EMBEDDED',
    clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    clientVersion: '2.0',
    userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
    xClientName: '85',
    extra: {},
    extraHeaders: {},
    thirdParty: { embedUrl: 'https://www.youtube.com/' },
  },
];

function netscapeCookiesToHeader(text) {
  const pairs = [];
  for (const line of String(text || '').split('\n')) {
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const MAX_HEIGHT = 1080;
const cache = new Map();
let playerCache = { jsUrl: '', expiresAt: 0, decipher: null };

const COBALT_INSTANCES = [
  'https://cobalt.ggtyler.dev/',
  'https://cobalt.api.timelessnesses.me/',
];

function resolveCacheRequest(videoId, maxHeight) {
  const u = new URL('https://cache.youtube-proxy.local/resolve');
  u.searchParams.set('videoId', videoId);
  u.searchParams.set('maxHeight', String(maxHeight || MAX_HEIGHT));
  return new Request(u.toString(), { method: 'GET' });
}

async function cacheGetResolved(videoId, maxHeight) {
  try {
    const req = resolveCacheRequest(videoId, maxHeight);
    const hit = await caches.default.match(req);
    if (!hit) return null;
    return await hit.json();
  } catch {
    return null;
  }
}

async function cachePutResolved(videoId, maxHeight, resolved) {
  try {
    const req = resolveCacheRequest(videoId, maxHeight);
    const resp = new Response(JSON.stringify(resolved), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' },
    });
    await caches.default.put(req, resp);
  } catch {}
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const videoId = url.searchParams.get('videoId');
    const mode = url.pathname.endsWith('/stream') ? 'stream' : 'resolve';
    const maxHeight = normalizeMaxHeight(url.searchParams.get('maxHeight'));
    const ytCookiesRaw = typeof env?.YOUTUBE_COOKIES === 'string' ? env.YOUTUBE_COOKIES.trim() : '';
    const cookieHeader =
      ytCookiesRaw && ytCookiesRaw.includes('\t') ? netscapeCookiesToHeader(ytCookiesRaw) : ytCookiesRaw;

    const secretKey = env.CF_SECRET_KEY;
    if (secretKey && url.searchParams.get('key') !== secretKey) {
      return json({ error: 'Unauthorized' }, 401);
    }

    if (!videoId || !/^[a-zA-Z0-9_-]{7,15}$/.test(videoId)) {
      return json({ error: 'Invalid or missing videoId' }, 400);
    }

    if (mode === 'stream') {
      try {
        const effectiveMaxHeight = maxHeight || MAX_HEIGHT;
        const range = request.headers.get('Range') || request.headers.get('range') || 'bytes=0-';

        const doFetch = (resolved) => {
          const isCobalt = resolved?.client === 'cobalt';
          return fetch(resolved.streamUrl, {
            headers: {
              Range: range,
              'User-Agent': resolved.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
              'Accept': '*/*',
              'Accept-Encoding': 'identity',
              ...(!isCobalt ? {
                'Origin': 'https://www.youtube.com',
                'Referer': 'https://www.youtube.com/',
                ...(resolved.visitorData ? { 'X-Goog-Visitor-Id': resolved.visitorData } : {}),
                'X-Youtube-Client-Name': resolved.xClientName,
                'X-Youtube-Client-Version': resolved.clientVersion,
                ...(cookieHeader ? { Cookie: cookieHeader } : {}),
              } : {}),
            },
          });
        };

        const errors = [];
        const heights = Array.from(new Set([effectiveMaxHeight, 720, 480, 360, 240, 144].filter(Boolean)));

        for (const h of heights) {
          const cacheKey = `${videoId}|${String(h)}`;

          const cachedLocal = cache.get(cacheKey);
          const localResolved = cachedLocal && cachedLocal.expiresAt > Date.now() && cachedLocal.value?.streamUrl ? cachedLocal.value : null;
          const globalResolved = localResolved ? null : await cacheGetResolved(videoId, h);
          const cachedResolved = localResolved || globalResolved;

          if (cachedResolved?.streamUrl) {
            const resolved = cachedResolved;
            const upstream = await doFetch(resolved);
            if (upstream.status === 200 || upstream.status === 206) {
              if (!localResolved) cache.set(cacheKey, { value: resolved, expiresAt: Date.now() + 10 * 60 * 1000 });
              return passthroughStream(upstream);
            }
            const body = await upstream.text().catch(() => '');
            errors.push(`cached@${h}: HTTP ${upstream.status} ${body.slice(0, 120)}`);
            cache.delete(cacheKey);
            try { await caches.default.delete(resolveCacheRequest(videoId, h)); } catch {}
          }

          for (const client of CLIENTS) {
            try {
              const info = await tryClient(videoId, client, h, cookieHeader);
              const resolved = {
                streamUrl: info.streamUrl,
                userAgent: info.userAgent,
                visitorData: info.visitorData,
                xClientName: info.xClientName,
                clientVersion: info.clientVersion,
                title: info.title,
                duration: info.duration,
                quality: info.quality,
                client: client.name,
              };
              const upstream = await doFetch(resolved);
              if (upstream.status === 200 || upstream.status === 206) {
                cache.set(cacheKey, { value: resolved, expiresAt: Date.now() + 10 * 60 * 1000 });
                await cachePutResolved(videoId, h, resolved);
                return passthroughStream(upstream);
              }
              const body = await upstream.text().catch(() => '');
              errors.push(`${client.name}@${h}: HTTP ${upstream.status} ${body.slice(0, 120)}`);
            } catch (e) {
              errors.push(`${client.name}@${h}: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
            }
          }

          try {
            const cobaltUrl = await getYouTubeStreamViaCobalt(videoId, h);
            const resolved = {
              streamUrl: cobaltUrl,
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
              visitorData: '',
              xClientName: '1',
              clientVersion: '2.20240101.00.00',
              title: 'YouTube Video',
              duration: 300,
              quality: 'cobalt',
              client: 'cobalt',
            };
            const upstream = await doFetch(resolved);
            if (upstream.status === 200 || upstream.status === 206) {
              cache.set(cacheKey, { value: resolved, expiresAt: Date.now() + 10 * 60 * 1000 });
              await cachePutResolved(videoId, h, resolved);
              return passthroughStream(upstream);
            }
            const body = await upstream.text().catch(() => '');
            errors.push(`cobalt@${h}: HTTP ${upstream.status} ${body.slice(0, 120)}`);
          } catch (e) {
            errors.push(`cobalt@${h}: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
          }
        }

        return json({ error: 'All clients failed to stream', details: errors.slice(0, 12).join(' | ') }, 502);

      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    const errors = [];
    const cached = await cacheGetResolved(videoId, maxHeight || MAX_HEIGHT);
    if (cached?.streamUrl) {
      return json({
        title: cached.title || 'YouTube Video',
        duration: cached.duration || 300,
        streamUrl: cached.streamUrl,
        quality: cached.quality || 'cached',
        userAgent: cached.userAgent,
        visitorData: cached.visitorData,
        xClientName: cached.xClientName,
        clientVersion: cached.clientVersion,
        client: cached.client || 'cached',
      });
    }
    for (const client of CLIENTS) {
      try {
        const result = await tryClient(videoId, client, maxHeight, cookieHeader);
        if (result) {
          await cachePutResolved(videoId, maxHeight, { ...result, client: client.name });
          return json({ ...result, client: client.name });
        }
        errors.push(`${client.name}: no stream URL`);
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 150);
        errors.push(`${client.name}: ${msg}`);
      }
    }

    try {
      const cobaltUrl = await getYouTubeStreamViaCobalt(videoId, maxHeight || MAX_HEIGHT);
      const result = {
        title: 'YouTube Video',
        duration: 300,
        streamUrl: cobaltUrl,
        quality: 'cobalt',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        visitorData: '',
        xClientName: '1',
        clientVersion: '2.20240101.00.00',
        client: 'cobalt',
      };
      await cachePutResolved(videoId, maxHeight, result);
      return json(result);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 150);
      errors.push(`cobalt: ${msg}`);
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

async function tryClient(videoId, client, maxHeight, cookieHeader) {
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
      ...(client.extraHeaders || {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
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

  const chosen = format || videoFormats[0] || formats[0];
  const resolvedUrl = await resolveFormatUrl(chosen, videoId, cookieHeader);
  if (!resolvedUrl) {
    const hasCipher = formats.some((f) => f.signatureCipher || f.cipher);
    throw new Error(`No direct URL${hasCipher ? ' (cipher)' : ''}`);
  }

  return {
    title: data.videoDetails?.title ?? 'YouTube Video',
    duration: parseInt(data.videoDetails?.lengthSeconds ?? '300', 10) || 300,
    streamUrl: resolvedUrl,
    quality: chosen?.qualityLabel ?? chosen?.quality ?? 'unknown',
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

async function resolveFormatUrl(format, videoId, cookieHeader) {
  if (!format) return '';
  if (format.url) return format.url;
  const cipher = format.signatureCipher || format.cipher;
  if (!cipher) return '';
  const parsed = parseCipher(cipher);
  if (!parsed?.url || !parsed?.s) return parsed?.url || '';
  const decipher = await getDecipher(videoId, cookieHeader);
  if (!decipher) return '';
  const signature = decipher(parsed.s);
  const u = new URL(parsed.url);
  u.searchParams.set(parsed.sp || 'signature', signature);
  return u.toString();
}

function parseCipher(cipher) {
  const params = new URLSearchParams(String(cipher || ''));
  const url = params.get('url') || '';
  const s = params.get('s') || '';
  const sp = params.get('sp') || 'signature';
  return { url, s, sp };
}

async function getDecipher(videoId, cookieHeader) {
  if (playerCache.decipher && playerCache.expiresAt > Date.now()) return playerCache.decipher;
  const jsUrl = await getPlayerJsUrl(videoId, cookieHeader);
  if (!jsUrl) return null;
  const js = await fetchText(jsUrl, cookieHeader);
  const decipher = buildDecipher(js);
  if (!decipher) return null;
  playerCache = { jsUrl, decipher, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
  return decipher;
}

async function getPlayerJsUrl(videoId, cookieHeader) {
  if (playerCache.jsUrl && playerCache.expiresAt > Date.now()) return playerCache.jsUrl;
  const html = await fetchText(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, cookieHeader);
  const m = html.match(/\"jsUrl\":\"([^\"]+)\"/);
  const raw = m?.[1] ? m[1].replace(/\\u0026/g, '&') : '';
  if (!raw) return '';
  const url = raw.startsWith('http') ? raw : `https://www.youtube.com${raw}`;
  playerCache.jsUrl = url;
  playerCache.expiresAt = Date.now() + 60 * 60 * 1000;
  return url;
}

async function fetchText(url, cookieHeader) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.text();
}

function buildDecipher(playerJs) {
  const fnMatch =
    playerJs.match(/([a-zA-Z0-9$]{2})=function\(\w\)\{\w=\w\.split\(\"\"\);[\s\S]*?return \w\.join\(\"\"\)\}/) ||
    playerJs.match(/function\s+([a-zA-Z0-9$]{2})\(\w\)\{\w=\w\.split\(\"\"\);[\s\S]*?return \w\.join\(\"\"\)\}/);
  if (!fnMatch) return null;

  const fnName = fnMatch[1];
  const fnBody = fnMatch[0].startsWith('function') ? fnMatch[0] : `var ${fnMatch[0]};`;
  const helperNameMatch = fnMatch[0].match(/;([a-zA-Z0-9$]{2})\.[a-zA-Z0-9$]{2}\(\w,\d+\)/) ||
    fnMatch[0].match(/;([a-zA-Z0-9$]{2})\.[a-zA-Z0-9$]{2}\(\w,\w\)/) ||
    fnMatch[0].match(/;([a-zA-Z0-9$]{2})\.[a-zA-Z0-9$]{2}\(\w\)/);
  const helperName = helperNameMatch?.[1] || '';
  if (!helperName) return null;
  const helperRe = new RegExp(`var ${helperName}=\\{[\\s\\S]*?\\};`);
  const helperMatch = playerJs.match(helperRe);
  if (!helperMatch) return null;
  const helperBody = helperMatch[0];

  try {
    const f = new Function(`${helperBody}\n${fnBody}\nreturn ${fnName};`)();
    return (sig) => String(f(String(sig)));
  } catch {
    return null;
  }
}

async function resolveCached(videoId, maxHeight, cookieHeader) {
  const cacheKey = `${videoId}|${String(maxHeight || MAX_HEIGHT)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const errors = [];
  for (const client of CLIENTS) {
    try {
      const result = await tryClient(videoId, client, maxHeight, cookieHeader);
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

function passthroughStream(upstream) {
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

async function getYouTubeStreamViaCobalt(videoId, maxHeight) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const body = JSON.stringify({
    url: videoUrl,
    videoQuality: String(Math.min(parseInt(String(maxHeight || 720), 10) || 720, 1080)),
    youtubeVideoCodec: 'h264',
    audioBitrate: '128',
  });

  let lastError = 'no instances tried';
  for (const instance of COBALT_INSTANCES) {
    try {
      const res = await fetch(instance, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) { lastError = `${instance}: HTTP ${res.status}`; continue; }
      const data = await res.json();
      if (data?.status === 'error' || !data?.url) {
        lastError = `${instance}: ${data?.error?.code || data?.status || 'no url'}`;
        continue;
      }
      return data.url;
    } catch (e) {
      lastError = `${instance}: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`;
    }
  }
  throw new Error(`All cobalt instances failed. Last: ${lastError}`);
}
