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

const MAX_HEIGHT = parseInt(process.env.YOUTUBE_MAX_HEIGHT || '1080', 10) || 1080;
let playerCache: { jsUrl: string; expiresAt: number; decipher: ((sig: string) => string) | null } = { jsUrl: '', expiresAt: 0, decipher: null };

function parseQuality(value?: string) {
  const m = value?.match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

// Client configurations — ordered by success rate and age-restriction bypass capability
// Updated 2026-06 to latest known working versions. YouTube's bot detection is primarily
// IP-based (datacenter IPs get LOGIN_REQUIRED), so client version alone won't fix Vercel
// Edge blocks — but newer versions improve compatibility and reduce false positives.
const CLIENTS = [
  // TVHTML5 — Cobalt/TV client, often bypasses bot detection on residential IPs
  {
    name: 'TV',
    clientName: 'TVHTML5',
    clientVersion: '7.20250623.16.00',
    userAgent: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/24.0.0',
    xClientName: '7',
    extra: { clientScreen: 'TV' },
    extraHeaders: {},
  },
  // TVHTML5_SIMPLY_EMBEDDED_PLAYER — strongest age-restriction bypass via embed context
  {
    name: 'TV_EMBEDDED',
    clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    clientVersion: '2.20250623.00.00',
    userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/7.0 TV Safari/538.1',
    xClientName: '85',
    extra: {},
    extraHeaders: {
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com',
    },
  },
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
  // IOS v20.10 — returns direct un-ciphered stream URLs for most videos
  {
    name: 'IOS_v20',
    clientName: 'IOS',
    clientVersion: '20.10.4',
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_5_0 like Mac OS X;)',
    xClientName: '5',
    extra: {
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.5.0.22F75',
      clientFormFactor: 'SMALL_FORM_FACTOR',
    },
    extraHeaders: {},
  },
  // ANDROID v20.10 — broad compatibility
  {
    name: 'ANDROID_v20',
    clientName: 'ANDROID',
    clientVersion: '20.10.4',
    userAgent: 'com.google.android.youtube/20.10.4 (Linux; U; Android 14) gzip',
    xClientName: '3',
    extra: { androidSdkVersion: 34, clientFormFactor: 'SMALL_FORM_FACTOR' },
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

async function tryClient(videoId: string, client: Client, debug = false): Promise<{
  title: string; duration: number; streamUrl: string; quality: string;
  audioUrl?: string;
  debug?: unknown;
} | null> {
  // Build the InnerTube request body. For WEB_EMBEDDED, include thirdParty to bypass age checks.
  const isEmbedClient = client.clientName === 'TVHTML5_SIMPLY_EMBEDDED_PLAYER' ||
                        client.clientName === 'WEB_EMBEDDED_PLAYER';
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
      ...(process.env.YOUTUBE_COOKIES ? { Cookie: netscapeCookiesToHeader(process.env.YOUTUBE_COOKIES) } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000), // 8s per client — keeps total under 25s for analysis
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

  // Debug info: summarize all available formats
  const debugFormats = debug ? formats.map(f => ({
    mimeType: f.mimeType?.split(';')[0] || 'unknown',
    quality: f.qualityLabel || f.quality || 'unknown',
    hasUrl: !!f.url,
    hasCipher: !!(f.signatureCipher || f.cipher),
    audio: !!(f.audioQuality || f.audioChannels),
  })) : undefined;

  // Prefer combined audio+video MP4 with a direct URL (not ciphered)
  const combined = formats.filter(f =>
    f.url && f.mimeType?.startsWith('video/mp4') && (f.audioQuality || f.audioChannels)
  );

  const combinedBest =
    combined
      .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
      .filter(item => item.q > 0 && item.q <= MAX_HEIGHT)
      .sort((a, b) => b.q - a.q)[0]?.f
    || combined
      .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
      .sort((a, b) => b.q - a.q)[0]?.f
    || combined[0]
    || formats.find(f => f.url);

  const cookieHeader = (process.env.YOUTUBE_COOKIES || '').trim();

  // If the best combined format is low quality (<=480p), try adaptive formats
  // for a higher-resolution video-only stream + an audio-only stream.
  // YouTube's combined formats are often limited to 360p without auth,
  // but adaptiveFormats include 720p/1080p video-only streams.
  // NOTE: adaptiveFormats are often ciphered (signatureCipher) without a direct `url`,
  // so we must NOT filter by `f.url` — instead, use resolveFormatUrl() which can
  // decipher the signature using the player.js.
  const combinedHeight = combinedBest ? parseQuality(combinedBest.qualityLabel ?? combinedBest.quality) : 0;
  let format = combinedBest;
  let audioUrl: string | undefined;

  if (combinedHeight < 720) {
    // Include all video-only MP4 streams (both direct-URL and ciphered)
    const videoOnly = formats.filter(f =>
      (f.url || f.signatureCipher || f.cipher) &&
      f.mimeType?.startsWith('video/mp4') && !(f.audioQuality || f.audioChannels)
    );
    // Include all audio-only streams (both direct-URL and ciphered)
    const audioOnly = formats.filter(f =>
      (f.url || f.signatureCipher || f.cipher) &&
      (f.mimeType?.startsWith('audio/mp4') || f.mimeType?.includes('audio/'))
    );

    // Sort video-only streams by quality (highest first, capped at MAX_HEIGHT)
    const videoCandidates = videoOnly
      .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
      .filter(item => item.q > 0 && item.q <= MAX_HEIGHT)
      .sort((a, b) => b.q - a.q);

    // Try the best video-only stream first; if its URL cannot be resolved
    // (e.g. decipher fails), fall back to the next candidate.
    for (const candidate of videoCandidates) {
      if (candidate.q <= combinedHeight) break; // no improvement over combined
      const videoResolvedUrl = await resolveFormatUrl(candidate.f, videoId, cookieHeader);
      if (!videoResolvedUrl) continue;

      // Try to find a resolvable audio stream
      let resolvedAudioUrl = '';
      for (const a of audioOnly) {
        resolvedAudioUrl = await resolveFormatUrl(a, videoId, cookieHeader);
        if (resolvedAudioUrl) break;
      }

      format = candidate.f;
      if (resolvedAudioUrl) audioUrl = resolvedAudioUrl;
      break;
    }
  }

  const resolvedUrl = await resolveFormatUrl(format, videoId, cookieHeader);
  if (!resolvedUrl) {
    const hasCipher = formats.some(f => f.signatureCipher || f.cipher);
    throw new Error(`No direct URL${hasCipher ? ' (cipher-protected)' : ''}`);
  }

  return {
    title: data.videoDetails?.title ?? 'YouTube Video',
    duration: parseInt(data.videoDetails?.lengthSeconds ?? '300', 10) || 300,
    streamUrl: resolvedUrl,
    quality: format.qualityLabel ?? format.quality ?? 'unknown',
    ...(audioUrl ? { audioUrl } : {}),
    ...(debugFormats ? { debug: {
      formatsCount: formats.length,
      combinedHeight,
      selectedQuality: format.qualityLabel ?? format.quality,
      hasAudioUrl: !!audioUrl,
      formats: debugFormats,
    } } : {}),
  };
}

async function resolveFormatUrl(format: Format | undefined, videoId: string, rawCookies: string) {
  if (!format) return '';
  if (format.url) return format.url;
  const cipher = format.signatureCipher || format.cipher;
  if (!cipher) return '';
  const parsed = parseCipher(cipher);
  if (!parsed.url) return '';
  if (!parsed.s) return parsed.url;
  const cookieHeader = rawCookies.includes('\t') ? netscapeCookiesToHeader(rawCookies) : rawCookies;
  const decipher = await getDecipher(videoId, cookieHeader);
  if (!decipher) return '';
  const signature = decipher(parsed.s);
  const u = new URL(parsed.url);
  u.searchParams.set(parsed.sp || 'signature', signature);
  return u.toString();
}

function parseCipher(cipher: string) {
  const params = new URLSearchParams(String(cipher || ''));
  const url = params.get('url') || '';
  const s = params.get('s') || '';
  const sp = params.get('sp') || 'signature';
  return { url, s, sp };
}

async function getDecipher(videoId: string, cookieHeader: string) {
  if (playerCache.decipher && playerCache.expiresAt > Date.now()) return playerCache.decipher;
  const jsUrl = await getPlayerJsUrl(videoId, cookieHeader);
  if (!jsUrl) return null;
  const js = await fetchText(jsUrl, cookieHeader);
  const decipher = buildDecipher(js);
  if (!decipher) return null;
  playerCache = { jsUrl, decipher, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
  return decipher;
}

async function getPlayerJsUrl(videoId: string, cookieHeader: string) {
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

async function fetchText(url: string, cookieHeader: string) {
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

function buildDecipher(playerJs: string) {
  const fnMatch =
    playerJs.match(/([a-zA-Z0-9$]{2})=function\(\w\)\{\w=\w\.split\(\"\"\);[\s\S]*?return \w\.join\(\"\"\)\}/) ||
    playerJs.match(/function\s+([a-zA-Z0-9$]{2})\(\w\)\{\w=\w\.split\(\"\"\);[\s\S]*?return \w\.join\(\"\"\)\}/);
  if (!fnMatch) return null;

  const fnText = fnMatch[0];
  const helperNameMatch =
    fnText.match(/;([a-zA-Z0-9$]{2})\.[a-zA-Z0-9$]{2}\(\w,\d+\)/) ||
    fnText.match(/;([a-zA-Z0-9$]{2})\.[a-zA-Z0-9$]{2}\(\w,\w\)/) ||
    fnText.match(/;([a-zA-Z0-9$]{2})\.[a-zA-Z0-9$]{2}\(\w\)/);
  const helperName = helperNameMatch?.[1] || '';
  if (!helperName) return null;

  const helperRe = new RegExp(`var\\s+${helperName}=\\{([\\s\\S]*?)\\};`);
  const helperMatch = playerJs.match(helperRe);
  const helperBody = helperMatch?.[1] || '';
  if (!helperBody) return null;

  type OpType = 'reverse' | 'slice' | 'splice' | 'swap';
  const opForMethod = new Map<string, OpType>();
  const methodRe = /([a-zA-Z0-9$]+):function\(\w,(?:\w)?\)\{([\s\S]*?)\}/g;
  for (const m of helperBody.matchAll(methodRe)) {
    const name = m[1];
    const body = m[2] || '';
    if (body.includes('.reverse(')) opForMethod.set(name, 'reverse');
    else if (body.includes('.splice(')) opForMethod.set(name, 'splice');
    else if (body.includes('.slice(')) opForMethod.set(name, 'slice');
    else if (/\[0\]=\w\[\w%?\w?\.length\]/.test(body) || /var\s+\w=\w\[0\]/.test(body)) opForMethod.set(name, 'swap');
  }

  const callsRe = new RegExp(`${helperName}\\.([a-zA-Z0-9$]+)\\(\\w,(\\d+)\\)`, 'g');
  const ops: Array<{ t: OpType; n: number }> = [];
  for (const m of fnText.matchAll(callsRe)) {
    const method = m[1];
    const n = parseInt(m[2], 10);
    const t = opForMethod.get(method);
    if (!t || !Number.isFinite(n)) continue;
    ops.push({ t, n });
  }
  if (!ops.length) return null;

  return (sig: string) => {
    let a = String(sig).split('');
    for (const op of ops) {
      if (!a.length) break;
      if (op.t === 'reverse') a.reverse();
      else if (op.t === 'slice') a = a.slice(op.n);
      else if (op.t === 'splice') a.splice(0, op.n);
      else if (op.t === 'swap') {
        const i = op.n % a.length;
        const tmp = a[0];
        a[0] = a[i];
        a[i] = tmp;
      }
    }
    return a.join('');
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function resolveStream(videoId: string, debug: boolean, isAudio: boolean): Promise<{
  title: string;
  duration: number;
  streamUrl: string;
  audioUrl?: string;
  quality: string;
  client: string;
} | null> {
  const errors: string[] = [];

  const ytCookies = (process.env.YOUTUBE_COOKIES || '').trim();
  if (ytCookies) {
    let cookieHeader = ytCookies;
    if (ytCookies.includes('\t')) {
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
          signal: AbortSignal.timeout(8_000),
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
            const combinedBest =
              combined
                .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
                .filter(item => item.q > 0 && item.q <= MAX_HEIGHT)
                .sort((a, b) => b.q - a.q)[0]?.f
              || combined
                .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
                .sort((a, b) => b.q - a.q)[0]?.f
              || combined[0]
              || formats.find(f => f.url);

            const combinedHeight = combinedBest ? parseQuality(combinedBest.qualityLabel ?? combinedBest.quality) : 0;
            let format = combinedBest;
            let audioUrl: string | undefined;

            if (combinedHeight < 720) {
              const videoOnly = formats.filter(f =>
                f.url && f.mimeType?.startsWith('video/mp4') && !(f.audioQuality || f.audioChannels)
              );
              const audioOnly = formats.filter(f =>
                f.url && (f.mimeType?.startsWith('audio/mp4') || f.mimeType?.includes('audio/'))
              );
              const bestVideo =
                videoOnly
                  .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
                  .filter(item => item.q > 0 && item.q <= MAX_HEIGHT)
                  .sort((a, b) => b.q - a.q)[0]?.f
                || videoOnly
                  .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
                  .sort((a, b) => b.q - a.q)[0]?.f;
              if (bestVideo && parseQuality(bestVideo.qualityLabel ?? bestVideo.quality) > combinedHeight) {
                format = bestVideo;
                if (audioOnly[0]?.url) audioUrl = audioOnly[0].url;
              }
            }

            if (format?.url) {
              return {
                title: data.videoDetails?.title ?? 'YouTube Video',
                duration: parseInt(data.videoDetails?.lengthSeconds ?? '300', 10) || 300,
                streamUrl: format.url,
                quality: format.qualityLabel ?? format.quality ?? 'unknown',
                ...(audioUrl ? { audioUrl } : {}),
                client: 'WEB_COOKIES',
              };
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
      const result = await tryClient(videoId, client, debug);
      if (result) {
        return { ...result, client: client.name };
      }
      errors.push(`${client.name}: no stream URL`);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 150);
      errors.push(`${client.name}: ${msg}`);
    }
  }

  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId');
  const debug = url.searchParams.get('debug') === '1';
  const proxy = url.searchParams.get('proxy') === '1';
  const isAudio = url.searchParams.get('audio') === '1';
  const maxHeight = Math.min(parseInt(url.searchParams.get('maxHeight') || String(MAX_HEIGHT), 10) || MAX_HEIGHT, MAX_HEIGHT);

  if (!videoId || !/^[a-zA-Z0-9_-]{7,15}$/.test(videoId)) {
    return Response.json({ error: 'Missing or invalid videoId' }, { status: 400, headers: CORS });
  }

  // Proxy mode: resolve stream URL + proxy video bytes in one request (same Edge colo = no IP mismatch)
  if (proxy) {
    const result = await resolveStream(videoId, false, isAudio);
    if (!result) {
      return Response.json({ error: 'Failed to resolve stream URL' }, { status: 502, headers: CORS });
    }

    const streamUrl = isAudio && result.audioUrl ? result.audioUrl : result.streamUrl;

    const rangeHeader = request.headers.get('Range');
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com',
    };
    if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

    try {
      const streamRes = await fetch(streamUrl, {
        headers: fetchHeaders,
        signal: AbortSignal.timeout(30_000),
      });

      if (!streamRes.ok && streamRes.status !== 206) {
        return Response.json(
          { error: `Stream fetch failed: HTTP ${streamRes.status}` },
          { status: 502, headers: CORS },
        );
      }

      const responseHeaders: Record<string, string> = { ...CORS };
      const ct = streamRes.headers.get('Content-Type');
      responseHeaders['Content-Type'] = ct || (isAudio ? 'audio/mp4' : 'video/mp4');
      responseHeaders['Accept-Ranges'] = 'bytes';

      const cl = streamRes.headers.get('Content-Length');
      if (cl) responseHeaders['Content-Length'] = cl;

      const cr = streamRes.headers.get('Content-Range');
      if (cr) responseHeaders['Content-Range'] = cr;

      return new Response(streamRes.body, {
        status: streamRes.status,
        headers: responseHeaders,
      });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message.slice(0, 200) : String(e) },
        { status: 502, headers: CORS },
      );
    }
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
          signal: AbortSignal.timeout(8_000),
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
            const combinedBest =
              combined
                .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
                .filter(item => item.q > 0 && item.q <= MAX_HEIGHT)
                .sort((a, b) => b.q - a.q)[0]?.f
              || combined
                .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
                .sort((a, b) => b.q - a.q)[0]?.f
              || combined[0]
              || formats.find(f => f.url);

            // Use adaptive formats if combined is low quality
            const combinedHeight = combinedBest ? parseQuality(combinedBest.qualityLabel ?? combinedBest.quality) : 0;
            let format = combinedBest;
            let audioUrl: string | undefined;

            if (combinedHeight < 720) {
              const videoOnly = formats.filter(f =>
                f.url && f.mimeType?.startsWith('video/mp4') && !(f.audioQuality || f.audioChannels)
              );
              const audioOnly = formats.filter(f =>
                f.url && (f.mimeType?.startsWith('audio/mp4') || f.mimeType?.includes('audio/'))
              );
              const bestVideo =
                videoOnly
                  .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
                  .filter(item => item.q > 0 && item.q <= MAX_HEIGHT)
                  .sort((a, b) => b.q - a.q)[0]?.f
                || videoOnly
                  .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
                  .sort((a, b) => b.q - a.q)[0]?.f;
              if (bestVideo && parseQuality(bestVideo.qualityLabel ?? bestVideo.quality) > combinedHeight) {
                format = bestVideo;
                if (audioOnly[0]?.url) audioUrl = audioOnly[0].url;
              }
            }

            if (format?.url) {
              return Response.json({
                title: data.videoDetails?.title ?? 'YouTube Video',
                duration: parseInt(data.videoDetails?.lengthSeconds ?? '300', 10) || 300,
                streamUrl: format.url,
                quality: format.qualityLabel ?? format.quality ?? 'unknown',
                client: 'WEB_COOKIES',
                ...(audioUrl ? { audioUrl } : {}),
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
      const result = await tryClient(videoId, client, debug);
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
