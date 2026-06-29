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

// Convert Netscape cookies.txt format to a "name=value; name2=value2" header string.
// Format: one cookie per line, tab-separated fields:
//   domain  flag  path  secure  expiration  name  value
// Lines starting with # are comments.
function netscapeCookiesToHeader(netscapeCookies: string): string {
  return netscapeCookies
    .split('\n')
    .filter(l => !l.startsWith('#') && l.trim())
    .map(l => { const p = l.split('\t'); return p.length >= 7 ? `${p[5]}=${p[6]}` : ''; })
    .filter(Boolean)
    .join('; ');
}

// Client configurations — ordered by PO Token requirement and bypass capability.
// Updated 2026-01 to match yt-dlp master (https://github.com/yt-dlp/yt-dlp).
//
// YouTube now requires a PO Token (Proof of Origin) for most web/mobile clients
// to return streaming URLs. Without a PO Token, these clients get LOGIN_REQUIRED.
// The PO Token is bound to visitor_data / session and is normally fetched by
// yt-dlp's PO Token Director plugin (a Node.js/Python helper process) — which
// we cannot run in a Vercel Edge Function.
//
// Strategy: try clients that do NOT require a PO Token first, then fall back to
// clients that may work without one on some videos.
//
// References:
//   - yt-dlp/yt_dlp/extractor/youtube/_base.py (INNERTUBE_CLIENTS)
//   - _DEFAULT_CLIENTS = ('android_vr', 'web_safari')  # unauthenticated
//   - _DEFAULT_JSLESS_CLIENTS = ('android_vr',)         # no JS runtime
//   - GvsPoTokenPolicy.required=False for: android_vr, tv, web_embedded
const CLIENTS = [
  // 1. ANDROID_VR (Quest 3) — yt-dlp's primary unauthenticated client.
  //    Does NOT require a PO Token (GVS policy defaults to required=False).
  //    Bypasses age restrictions and bot detection on most content.
  {
    name: 'ANDROID_VR',
    clientName: 'ANDROID_VR',
    clientVersion: '1.65.10',
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    xClientName: '28',
    extra: {
      androidSdkVersion: 32,
      deviceMake: 'Oculus',
      deviceModel: 'Quest 3',
      osName: 'Android',
      osVersion: '12L',
    },
    extraHeaders: {},
  },
  // 2. TVHTML5 (Cobalt/TV) — does NOT require a PO Token.
  //    yt-dlp uses this as a fallback for unauthenticated requests.
  //    Note: yt-dlp fetches https://www.youtube.com/tv to get the real ytcfg,
  //    but we can call the API directly with the correct version + UA.
  {
    name: 'TV',
    clientName: 'TVHTML5',
    clientVersion: '7.20260114.12.00',
    userAgent: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)',
    xClientName: '7',
    extra: {},
    extraHeaders: {},
  },
  // 3. WEB_EMBEDDED_PLAYER — does NOT require a PO Token, supports cookies.
  //    yt-dlp sets thirdParty.embedUrl = 'https://www.reddit.com/' for embedded clients.
  {
    name: 'WEB_EMBEDDED',
    clientName: 'WEB_EMBEDDED_PLAYER',
    clientVersion: '1.20260115.01.00',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    xClientName: '56',
    extra: {},
    extraHeaders: {
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com',
    },
  },
  // 4. WEB (Safari UA) — yt-dlp's secondary unauthenticated client.
  //    Safari UA returns pre-merged video+audio HLS formats (144p-1080p).
  //    May require PO Token, but Safari UA sometimes bypasses the check.
  {
    name: 'WEB_SAFARI',
    clientName: 'WEB',
    clientVersion: '2.20260114.08.00',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15,gzip(gfe)',
    xClientName: '1',
    extra: {},
    extraHeaders: {},
  },
  // 5. MWEB (iPad UA) — yt-dlp uses iPad UA which historically did not require PO Token.
  //    Now requires PO Token (GVS policy: required=True), but may work on some videos.
  {
    name: 'MWEB',
    clientName: 'MWEB',
    clientVersion: '2.20260115.01.00',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1,gzip(gfe)',
    xClientName: '2',
    extra: {},
    extraHeaders: {},
  },
  // 6. WEB (Chrome UA) — standard web client, requires PO Token.
  {
    name: 'WEB',
    clientName: 'WEB',
    clientVersion: '2.20260114.08.00',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    xClientName: '1',
    extra: {},
    extraHeaders: {},
  },
  // 7. IOS — returns direct un-ciphered stream URLs for most videos.
  //    Requires PO Token (GVS policy: required=True), but worth trying as fallback.
  {
    name: 'IOS',
    clientName: 'IOS',
    clientVersion: '21.02.3',
    userAgent: 'com.google.ios.youtube/21.02.3 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    xClientName: '5',
    extra: {
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.3.2.22D82',
    },
    extraHeaders: {},
  },
  // 8. ANDROID — broad compatibility, requires PO Token.
  {
    name: 'ANDROID',
    clientName: 'ANDROID',
    clientVersion: '21.02.35',
    userAgent: 'com.google.android.youtube/21.02.35 (Linux; U; Android 11) gzip',
    xClientName: '3',
    extra: {
      androidSdkVersion: 30,
      osName: 'Android',
      osVersion: '11',
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

async function tryClient(videoId: string, client: Client, debug = false, maxHeightOverride?: number): Promise<{
  title: string; duration: number; streamUrl: string; quality: string;
  audioUrl?: string;
  debug?: unknown;
} | null> {
  const effectiveMaxHeight = maxHeightOverride || MAX_HEIGHT;
  // Build the InnerTube request body. For embedded clients, include thirdParty.embedUrl
  // (must be a non-YouTube URL per yt-dlp's _fix_embedded_ytcfg).
  const isEmbedClient = client.clientName === 'WEB_EMBEDDED_PLAYER';
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
        thirdParty: { embedUrl: 'https://www.reddit.com/' },
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
      .filter(item => item.q > 0 && item.q <= effectiveMaxHeight)
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
      .filter(item => item.q > 0 && item.q <= effectiveMaxHeight)
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

// Resolve stream URL by scraping the watch page HTML.
// YouTube's bot detection primarily targets direct InnerTube API calls
// (/youtubei/v1/player), but the public watch page (/watch?v=...) is served
// to every browser visitor and contains the full ytInitialPlayerResponse
// JSON with streamingData. This is the most reliable fallback when all
// InnerTube clients return LOGIN_REQUIRED.
//
// This mirrors yt-dlp's approach: it first downloads the watch page to get
// ytcfg, then uses the embedded player response. We skip the ytcfg step and
// use ytInitialPlayerResponse directly.
async function resolveStreamViaWatchPage(videoId: string, maxHeightOverride?: number): Promise<{
  title: string;
  duration: number;
  streamUrl: string;
  audioUrl?: string;
  quality: string;
  client: string;
} | null> {
  const effectiveMaxHeight = maxHeightOverride || MAX_HEIGHT;
  const cookieHeader = (process.env.YOUTUBE_COOKIES || '').trim();
  const parsedCookieHeader = cookieHeader.includes('\t') ? netscapeCookiesToHeader(cookieHeader) : cookieHeader;

  try {
    const html = await fetchText(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en&gl=US`,
      parsedCookieHeader,
    );

    // Find ytInitialPlayerResponse in the HTML.
    // The JSON object is large (~130KB for typical videos) and is assigned as:
    //   ytInitialPlayerResponse = {...};
    // We use indexOf to locate the start, then find the matching closing brace
    // by counting brace depth. This is more reliable than a regex which may
    // fail on large JSON or JSON containing regex special characters.
    const marker = 'ytInitialPlayerResponse';
    const markerIdx = html.indexOf(marker);
    if (markerIdx === -1) {
      throw new Error('ytInitialPlayerResponse not found in HTML');
    }

    // Find the opening brace after the marker
    const assignIdx = html.indexOf('=', markerIdx);
    if (assignIdx === -1) {
      throw new Error('No assignment after ytInitialPlayerResponse marker');
    }
    const braceIdx = html.indexOf('{', assignIdx);
    if (braceIdx === -1) {
      throw new Error('No opening brace after ytInitialPlayerResponse =');
    }

    // Count brace depth to find the matching closing brace
    let depth = 0;
    let endIdx = -1;
    let inString = false;
    let escapeNext = false;
    for (let i = braceIdx; i < html.length; i++) {
      const ch = html[i];
      if (escapeNext) { escapeNext = false; continue; }
      if (ch === '\\') { escapeNext = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    if (endIdx === -1) {
      throw new Error('Could not find matching closing brace for ytInitialPlayerResponse');
    }

    const jsonStr = html.slice(braceIdx, endIdx + 1);
    let data: InnerTubeResponse;
    try {
      data = JSON.parse(jsonStr) as InnerTubeResponse;
    } catch (e) {
      throw new Error(`JSON parse failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const ps = data.playabilityStatus?.status;
    if (ps && ps !== 'OK') {
      throw new Error(`WatchPage: ${ps}: ${data.playabilityStatus?.reason ?? ''}`);
    }

    const formats: Format[] = [
      ...(data.streamingData?.formats ?? []),
      ...(data.streamingData?.adaptiveFormats ?? []),
    ];
    if (!formats.length) throw new Error('WatchPage: No formats');

    // Prefer combined audio+video MP4 with a direct URL
    const combined = formats.filter(f =>
      f.url && f.mimeType?.startsWith('video/mp4') && (f.audioQuality || f.audioChannels)
    );

    const combinedBest =
      combined
        .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
        .filter(item => item.q > 0 && item.q <= effectiveMaxHeight)
        .sort((a, b) => b.q - a.q)[0]?.f
      || combined
        .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
        .sort((a, b) => b.q - a.q)[0]?.f
      || combined[0]
      || formats.find(f => f.url);

    const combinedHeight = combinedBest ? parseQuality(combinedBest.qualityLabel ?? combinedBest.quality) : 0;
    let format = combinedBest;
    let audioUrl: string | undefined;

    // Try adaptive formats for higher quality if combined is low
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
          .filter(item => item.q > 0 && item.q <= effectiveMaxHeight)
          .sort((a, b) => b.q - a.q)[0]?.f
        || videoOnly
          .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
          .sort((a, b) => b.q - a.q)[0]?.f;
      if (bestVideo && parseQuality(bestVideo.qualityLabel ?? bestVideo.quality) > combinedHeight) {
        format = bestVideo;
        if (audioOnly[0]?.url) audioUrl = audioOnly[0].url;
      }
    }

    // Try to resolve ciphered URLs via player.js decipher
    const resolvedUrl = await resolveFormatUrl(format, videoId, parsedCookieHeader);
    if (!resolvedUrl) {
      throw new Error('WatchPage: No direct URL (cipher-protected and decipher failed)');
    }

    let resolvedAudioUrl: string | undefined;
    if (audioUrl) {
      const audioFormat = formats.find(f => f.url === audioUrl);
      resolvedAudioUrl = audioFormat
        ? await resolveFormatUrl(audioFormat, videoId, parsedCookieHeader)
        : audioUrl;
    }

    return {
      title: data.videoDetails?.title ?? 'YouTube Video',
      duration: parseInt(data.videoDetails?.lengthSeconds ?? '300', 10) || 300,
      streamUrl: resolvedUrl,
      quality: format?.qualityLabel ?? format?.quality ?? 'unknown',
      ...(resolvedAudioUrl ? { audioUrl: resolvedAudioUrl } : {}),
      client: 'WATCH_PAGE',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`WatchPage: ${msg.slice(0, 150)}`);
  }
}

async function resolveStream(videoId: string, debug: boolean, isAudio: boolean, maxHeightOverride?: number): Promise<{
  title: string;
  duration: number;
  streamUrl: string;
  audioUrl?: string;
  quality: string;
  client: string;
} | null> {
  const errors: string[] = [];
  const effectiveMaxHeight = maxHeightOverride || MAX_HEIGHT;

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
                .filter(item => item.q > 0 && item.q <= effectiveMaxHeight)
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
                  .filter(item => item.q > 0 && item.q <= effectiveMaxHeight)
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
      const result = await tryClient(videoId, client, debug, maxHeightOverride);
      if (result) {
        return { ...result, client: client.name };
      }
      errors.push(`${client.name}: no stream URL`);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 150);
      errors.push(`${client.name}: ${msg}`);
    }
  }

  // Fallback: scrape the watch page HTML for ytInitialPlayerResponse.
  // This bypasses InnerTube API bot detection (LOGIN_REQUIRED) because the
  // watch page is served to every browser visitor and contains the full
  // player response JSON with streamingData. This is the same approach
  // yt-dlp uses as its first step (download watch page → extract ytcfg →
  // call InnerTube API with the page's client config).
  try {
    const result = await resolveStreamViaWatchPage(videoId, maxHeightOverride);
    if (result) {
      return result;
    }
    errors.push('WATCH_PAGE: no stream URL');
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 150);
    errors.push(msg);
  }

  // All methods failed — throw with the collected errors so callers can
  // return a meaningful error message to the client.
  throw new Error(`All methods failed: ${errors.join(' | ')}`);
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
    let result;
    try {
      result = await resolveStream(videoId, false, isAudio, maxHeight);
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message.slice(0, 300) : String(e) },
        { status: 502, headers: CORS },
      );
    }
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
        signal: AbortSignal.timeout(60_000),
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

  // Non-proxy mode: resolve stream URL and return it as JSON.
  // resolveStream tries: YOUTUBE_COOKIES → CLIENTS (android_vr, tv, web_embedded, ...)
  // → watch page HTML scrape (bypasses LOGIN_REQUIRED bot detection).
  try {
    const result = await resolveStream(videoId, debug, isAudio, maxHeight);
    if (result) {
      return Response.json(
        result,
        { status: 200, headers: { ...CORS, 'Cache-Control': 'no-store' } }
      );
    }
    return Response.json(
      { error: 'Failed to resolve stream URL (all methods returned null)' },
      { status: 502, headers: CORS }
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message.slice(0, 2000) : String(e) },
      { status: 502, headers: CORS }
    );
  }
}
