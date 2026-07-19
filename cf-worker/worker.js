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
  // IOS v20.10 — returns direct un-ciphered stream URLs for most videos.
  // First priority: no signature decryption needed, fastest HD path, works on most CF colos.
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
  // TVHTML5 — Cobalt/TV client, often bypasses bot detection on residential/CF IPs
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
    extraHeaders: {},
    thirdParty: { embedUrl: 'https://www.youtube.com/' },
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
  // WEB_EMBEDDED_PLAYER — bypass age restrictions via embed context
  {
    name: 'WEB_EMBEDDED',
    clientName: 'WEB_EMBEDDED_PLAYER',
    clientVersion: '2.20250623.00.00',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
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
  // MWEB — mobile web client, sometimes bypasses bot detection that blocks
  // desktop WEB client. Lower priority but worth trying as extra fallback.
  {
    name: 'MWEB',
    clientName: 'MWEB',
    clientVersion: '2.20250623.01.00',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
    xClientName: '4',
    extra: {},
    extraHeaders: {
      'Referer': 'https://m.youtube.com/',
      'Origin': 'https://m.youtube.com',
    },
  },
  // WEB (regular) — desktop web client with cookies. Often triggers bot detection
  // on datacenter IPs but CF Worker IPs are residential-like, so it may work.
  // Last resort before giving up.
  {
    name: 'WEB',
    clientName: 'WEB',
    clientVersion: '2.20250623.00.00',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    xClientName: '1',
    extra: {},
    extraHeaders: {
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com',
    },
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
// HD preference threshold. Heights loop tries HD heights first (>= MIN_HD_HEIGHT),
// then falls back to SD if ALLOW_SD_FALLBACK is enabled (default: true).
// Set ALLOW_SD_FALLBACK=false (env) or hdOnly=1 (query param) to reject SD and
// return 502 when HD is unavailable — use this only when SD is unacceptable.
// B-plan rollback: set ALLOW_SD_FALLBACK=true (default) to always produce a
// playable stream, even if only 360p combined is available.
const MIN_HD_HEIGHT = 720;
const cache = new Map();
let playerCache = { jsUrl: '', expiresAt: 0, decipher: null };
const BUILD_ID = '2026-06-28-watch-page-scrape';

const COBALT_INSTANCES = [
  'https://cobalt-api.meowing.de/',
  'https://cobalt-backend.canine.tools/',
  'https://capi.3kh0.net/',
  'https://kityune.imput.net/',
  'https://nachos.imput.net/',
  'https://sunny.imput.net/',
  'https://blossom.imput.net/',
  'https://cobalt.ggtyler.dev/',
  'https://cobalt.api.timelessnesses.me/',
];

// Invidious & Piped instances — fallback when InnerTube API is rate-limited.
// These return googlevideo.com direct URLs which CF Workers can fetch directly
// (CF IPs are not blocked by googlevideo.com, unlike Vercel/AWS IPs).
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://iv.datura.network',
  'https://invidious.lunar.icu',
  'https://invidious.privacyredirect.com',
  'https://yt.artemislena.eu',
];

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.garudalinux.org',
  'https://api.piped.yt',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.mha.fi',
  'https://watchapi.whatever.social',
  'https://api.piped.projectsegfau.lt',
  'https://piped-api.privacy.com.de',
];

function resolveCacheRequest(videoId, maxHeight, wantMuxed = false) {
  const u = new URL('https://cache.youtube-proxy.local/resolve');
  u.searchParams.set('videoId', videoId);
  u.searchParams.set('maxHeight', String(maxHeight || MAX_HEIGHT));
  if (wantMuxed) u.searchParams.set('muxed', '1');
  return new Request(u.toString(), { method: 'GET' });
}

async function cacheGetResolved(videoId, maxHeight, includeStale = false, wantMuxed = false) {
  try {
    const req = resolveCacheRequest(videoId, maxHeight, wantMuxed);
    const hit = await caches.default.match(req);
    if (!hit) return null;
    const data = await hit.json();
    // caches.default respects Cache-Control max-age. When includeStale is true,
    // we also accept entries whose internal expiresAt has passed (up to 2 hours old).
    // This is the stale-while-revalidate pattern: return stale data when fresh
    // resolution fails (YouTube rate-limiting), so Vercel always gets a usable streamUrl.
    if (includeStale && data.expiresAt) {
      const ageMs = Date.now() - data.expiresAt;
      if (ageMs > 2 * 60 * 60 * 1000) return null; // too stale (>2h)
    }
    return data;
  } catch {
    return null;
  }
}

async function cachePutResolved(videoId, maxHeight, resolved, wantMuxed = false) {
  try {
    const req = resolveCacheRequest(videoId, maxHeight, wantMuxed);
    // Extend cache TTL to 30 minutes (was 10). YouTube stream URLs expire in 6 hours,
    // but /stream has IP-binding bypass (strips ip= param), so stale streamUrls
    // remain usable even after the original IP-bound expiry.
    const resp = new Response(JSON.stringify({
      ...resolved,
      expiresAt: Date.now() + 30 * 60 * 1000, // internal expiry for stale check
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' },
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
        const range = request.headers.get('Range') || request.headers.get('range') || '';
        // quickCheck=1: only try the fast path (streamUrl param) + cache.
        // Skip tryClient/HD re-resolve. Used by Vercel preflight to quickly
        // detect colo-mismatch failures before committing to ffmpeg input.
        const quickCheck = url.searchParams.get('quickCheck') === '1';
        // audio=1: fetch resolved.audioUrl instead of resolved.streamUrl.
        // Used when /resolve returns adaptiveFormats (video-only + audio) and
        // Vercel's ffmpeg needs separate audio input.
        const wantAudio = url.searchParams.get('audio') === '1';
        // muxed=1: force tryClient to return muxed (combined video+audio) format
        // instead of adaptiveFormats (video-only DASH + separate audio).
        // Used by browser-side captureStream recording which needs a single
        // stream with both video and audio tracks.
        const wantMuxed = url.searchParams.get('muxed') === '1';
        // hdOnly=1: reject SD streams, return 502 if HD unavailable.
        // Overrides ALLOW_SD_FALLBACK env. Used by Vercel first attempt to
        // pursue HD quality; Vercel retries without hdOnly on failure.
        // B-plan: env ALLOW_SD_FALLBACK=false forces hdOnly globally.
        const allowSdFallback = env?.ALLOW_SD_FALLBACK !== 'false' && url.searchParams.get('hdOnly') !== '1';

        const doFetch = async (resolved) => {
          const isCobalt = resolved?.client === 'cobalt';
          // When audio=1, fetch audioUrl (falls back to streamUrl if no audioUrl)
          let fetchUrl = (wantAudio && resolved.audioUrl) ? resolved.audioUrl : resolved.streamUrl;

          // begin parameter: YouTube googlevideo.com URLs support a `begin` query
          // param (in MILLISECONDS). Setting begin=60000 makes YouTube return a
          // byte stream starting from video position 60s. The returned data starts
          // with `ftyp` box (valid MP4 header) — it's a COMPLETE, SELF-DECODABLE
          // MP4 file, NOT a continuation fragment.
          // This lets /stream serve clips at arbitrary positions without needing
          // to download the entire video from the start.
          const beginMs = url.searchParams.get('begin');
          if (beginMs && fetchUrl.includes('googlevideo.com')) {
            try {
              const u = new URL(fetchUrl);
              u.searchParams.set('begin', String(beginMs));
              fetchUrl = u.toString();
            } catch {}
          }

          const headers = {
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
          };
          if (range) headers['Range'] = range;

          let upstream = await fetch(fetchUrl, { headers });
          if (upstream.status === 200 || upstream.status === 206) return upstream;

          // IP-binding bypass: googlevideo.com URLs contain an `ip=` param bound
          // to the IP that called InnerTube (tryClient). When /resolve and /stream
          // hit different CF colos, or when the Worker's egress IP rotates within
          // a colo, the streamUrl's ip= won't match the doFetch egress IP and
          // googlevideo.com returns 403. Stripping `ip=` and setting `ipbits=0`
          // tells YouTube to skip IP validation — the signature/HMAC is NOT
          // affected because ip/ipbits are not part of the signed parameters.
          if ((upstream.status === 403 || upstream.status === 402) &&
              fetchUrl.includes('googlevideo.com') && fetchUrl.includes('ip=')) {
            try {
              const u = new URL(fetchUrl);
              u.searchParams.delete('ip');
              u.searchParams.set('ipbits', '0');
              // Re-apply begin parameter after stripping ip
              if (beginMs) u.searchParams.set('begin', String(beginMs));
              const strippedUrl = u.toString();
              const retryResp = await fetch(strippedUrl, { headers });
              if (retryResp.status === 200 || retryResp.status === 206) return retryResp;
              upstream = retryResp;
            } catch {}
          }

          return upstream;
        };

        // Fast path: if caller provides a pre-resolved streamUrl (from /resolve),
        // fetch it directly — skips tryClient (60s+ InnerTube call) entirely.
        // This avoids cold-cache latency when /stream and /resolve route to
        // different Cloudflare colos (caches.default is per-colo, not global).
        //
        // audioUrl param: when /resolve returned adaptiveFormats (video-only +
        // separate audio), the caller passes audio=1 AND audioUrl=<url> to
        // fetch the AUDIO stream instead of video. doFetch() checks wantAudio
        // and uses resolved.audioUrl when set — so we put audioUrl into the
        // direct resolved object. Without this, /api/cut-clip cannot download
        // audio (doFetch falls back to streamUrl which is video-only).
        const errors = [];
        const directStreamUrl = url.searchParams.get('streamUrl');
        const directAudioUrl = url.searchParams.get('audioUrl');
        if (directStreamUrl || (wantAudio && directAudioUrl)) {
          const directResolved = {
            streamUrl: directStreamUrl || directAudioUrl,
            userAgent: url.searchParams.get('userAgent') || '',
            visitorData: url.searchParams.get('visitorData') || '',
            xClientName: url.searchParams.get('xClientName') || '1',
            clientVersion: url.searchParams.get('clientVersion') || '2.20240101.00.00',
            client: url.searchParams.get('clientName') || 'direct',
            ...(directAudioUrl ? { audioUrl: directAudioUrl } : {}),
          };
          const upstream = await doFetch(directResolved);
          if (upstream.status === 200 || upstream.status === 206) {
            return passthroughStream(upstream);
          }
          const body = await upstream.text().catch(() => '');
          errors.push(`direct: HTTP ${upstream.status} ${body.slice(0, 120)}`);

          // quickCheck: caller only wants to know if the fast path works.
          // Return 502 immediately on failure — Vercel will try other getters.
          if (quickCheck) {
            return json(
              { error: 'quickCheck: direct stream failed', details: errors.slice(0, 4).join(' | ') },
              502,
            );
          }

          // Fast path failed (typically googlevideo.com 403 when /resolve and
          // /stream hit different CF colos — the streamUrl's ip= param is bound
          // to the /resolve colo's IP, not the /stream colo's IP).
          //
          // Fall through directly to the heights loop below. The heights loop
          // tries HD heights first (1080, 720), then SD (480, 360, 240, 144)
          // if allowSdFallback is true. HD-only mode (hdOnly=1 or
          // ALLOW_SD_FALLBACK=false) skips SD and returns 502 — Vercel then
          // retries without hdOnly or switches to link_only mode.
        }

        // HD-first heights, with SD fallback unless hdOnly/ALLOW_SD_FALLBACK=false.
        // B-plan: allowSdFallback=true (default) ensures a playable stream is
        // always returned, even if only 360p combined is available.
        const hdHeights = Array.from(new Set([effectiveMaxHeight, MIN_HD_HEIGHT].filter((h) => h >= MIN_HD_HEIGHT)));
        const sdHeights = allowSdFallback ? [480, 360, 240, 144].filter((h) => h < MIN_HD_HEIGHT) : [];
        const heights = [...hdHeights, ...sdHeights];

        for (const h of heights) {
          const cacheKey = `${videoId}|${String(h)}`;

          const cachedLocal = cache.get(cacheKey);
          const localResolved = cachedLocal && cachedLocal.expiresAt > Date.now() && cachedLocal.value?.streamUrl ? cachedLocal.value : null;
          const globalResolved = localResolved ? null : await cacheGetResolved(videoId, h, false, wantMuxed);
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
            try { await caches.default.delete(resolveCacheRequest(videoId, h, wantMuxed)); } catch {}
          }

          for (const client of CLIENTS) {
            try {
              const info = await tryClient(videoId, client, h, cookieHeader, wantMuxed);
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
                // Preserve audioUrl from tryClient (HD video-only + separate audio).
                // Previously this was dropped, so /stream cached entries lacked
                // audioUrl and subsequent /resolve cache hits returned video-only.
                ...(info.audioUrl ? { audioUrl: info.audioUrl } : {}),
              };
              const upstream = await doFetch(resolved);
              if (upstream.status === 200 || upstream.status === 206) {
                cache.set(cacheKey, { value: resolved, expiresAt: Date.now() + 10 * 60 * 1000 });
                await cachePutResolved(videoId, h, resolved, wantMuxed);
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
              await cachePutResolved(videoId, h, resolved, wantMuxed);
              return passthroughStream(upstream);
            }
            const body = await upstream.text().catch(() => '');
            errors.push(`cobalt@${h}: HTTP ${upstream.status} ${body.slice(0, 120)}`);
          } catch (e) {
            errors.push(`cobalt@${h}: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
          }
        }

        // ── Last-resort fallback: Invidious & Piped ──────────────────────────
        // Reached when ALL tryClient + cobalt attempts fail across ALL heights.
        // This typically happens when YouTube rate-limits InnerTube API on the
        // current CF colo. Invidious/Piped are independent services that return
        // googlevideo.com direct URLs — CF Workers can fetch these directly
        // (CF IPs are not blocked by googlevideo.com, unlike Vercel/AWS IPs).
        for (const fallback of [
          { name: 'Invidious', fn: () => getYouTubeStreamViaInvidious(videoId, effectiveMaxHeight) },
          { name: 'Piped', fn: () => getYouTubeStreamViaPiped(videoId, effectiveMaxHeight) },
        ]) {
          try {
            const result = await fallback.fn();
            const resolved = {
              streamUrl: result.url,
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
              visitorData: '',
              xClientName: '1',
              clientVersion: '2.20240101.00.00',
              title: 'YouTube Video',
              duration: 300,
              quality: result.quality,
              client: result.source,
              ...(result.audioUrl ? { audioUrl: result.audioUrl } : {}),
            };
            const upstream = await doFetch(resolved);
            if (upstream.status === 200 || upstream.status === 206) {
              const cacheKey2 = `${videoId}|${effectiveMaxHeight}`;
              cache.set(cacheKey2, { value: resolved, expiresAt: Date.now() + 10 * 60 * 1000 });
              await cachePutResolved(videoId, effectiveMaxHeight, resolved);
              return passthroughStream(upstream);
            }
            const body = await upstream.text().catch(() => '');
            errors.push(`${fallback.name}@${effectiveMaxHeight}: HTTP ${upstream.status} ${body.slice(0, 120)}`);
          } catch (e) {
            errors.push(`${fallback.name}@${effectiveMaxHeight}: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
          }
        }

        // ── Ultimate fallback: scrape YouTube watch page ─────────────────────
        // When InnerTube API is rate-limited (LOGIN_REQUIRED) AND Invidious/Piped
        // are down, try parsing ytInitialPlayerResponse directly from the watch
        // page HTML. This is yt-dlp's approach and sometimes works because the
        // watch page endpoint has different rate-limiting than the player API.
        try {
          const scrapeResult = await getStreamViaWatchPage(videoId, effectiveMaxHeight, cookieHeader);
          if (scrapeResult?.url) {
            const resolved = {
              streamUrl: scrapeResult.url,
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
              visitorData: '',
              xClientName: '1',
              clientVersion: '2.20240101.00.00',
              title: scrapeResult.title || 'YouTube Video',
              duration: scrapeResult.duration || 300,
              quality: scrapeResult.quality || 'unknown',
              client: 'watch_page',
              ...(scrapeResult.audioUrl ? { audioUrl: scrapeResult.audioUrl } : {}),
            };
            const upstream = await doFetch(resolved);
            if (upstream.status === 200 || upstream.status === 206) {
              cache.set(`${videoId}|${effectiveMaxHeight}`, { value: resolved, expiresAt: Date.now() + 10 * 60 * 1000 });
              await cachePutResolved(videoId, effectiveMaxHeight, resolved);
              return passthroughStream(upstream);
            }
            const body = await upstream.text().catch(() => '');
            errors.push(`watch_page@${effectiveMaxHeight}: HTTP ${upstream.status} ${body.slice(0, 120)}`);
          }
        } catch (e) {
          errors.push(`watch_page@${effectiveMaxHeight}: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
        }

        // ── Stale-while-revalidate for /stream: use stale cache when all fresh resolution fails ──
        // Same logic as /resolve: return stale streamUrl and proxy it.
        // /stream has IP-binding bypass (strips ip= param), so stale streamUrls work.
        for (const h of heights) {
          const stale = await cacheGetResolved(videoId, h, true);
          if (stale?.streamUrl) {
            try {
              const upstream = await doFetch(stale);
              if (upstream.status === 200 || upstream.status === 206) {
                return passthroughStream(upstream);
              }
            } catch {}
          }
        }

        return json({ error: 'All clients failed to stream', colo: request.cf?.colo || '?', details: errors.slice(0, 12).join(' | ') }, 502);

      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    const errors = [];
    const requestedMaxHeight = maxHeight || MAX_HEIGHT;
    // /resolve: HD-first with SD fallback (same logic as /stream).
    // B-plan: allowSdFallback ensures /resolve always returns a playable URL.
    const resolveAllowSd = env?.ALLOW_SD_FALLBACK !== 'false' && url.searchParams.get('hdOnly') !== '1';
    const resolveHdHeights = Array.from(new Set([requestedMaxHeight, MIN_HD_HEIGHT].filter((h) => h >= MIN_HD_HEIGHT)));
    const resolveSdHeights = resolveAllowSd ? [480, 360, 240, 144].filter((h) => h < MIN_HD_HEIGHT) : [];
    const heights = [...resolveHdHeights, ...resolveSdHeights];
    // muxed=1: force tryClient to return a combined (video+audio) stream instead of
    // HD video-only DASH + separate audio. Needed when Vercel cannot fetch the
    // separate audio stream (e.g., googlevideo.com rate-limits audio on CF colos).
    const resolveWantMuxed = url.searchParams.get('muxed') === '1';

    for (const h of heights) {
      // Pass resolveWantMuxed so cache key matches (muxed vs non-muxed are cached separately).
      // Previous bug: cacheGetResolved was called without wantMuxed, causing /resolve?muxed=1
      // to hit cache entries from prior /resolve (no muxed) calls — which were video-only + audioUrl.
      const cached = await cacheGetResolved(videoId, h, false, resolveWantMuxed);
      if (cached?.streamUrl) {
        // CRITICAL FIX: cachedMuxed must ONLY be true when the cached entry is a SINGLE
        // combined video+audio stream. A cache entry with audioUrl is NOT muxed — it's
        // a video-only stream + separate audio URL. Returning such an entry when the
        // caller explicitly wants muxed causes the "no audio" bug (server only downloads
        // the video-only streamUrl, ignoring audioUrl).
        const cachedMuxed = (cached.quality || '').includes('muxed') || !cached.audioUrl;
        if (!resolveWantMuxed || cachedMuxed) {
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
            // Preserve audioUrl from cache (HD video-only + separate audio path).
            // Server (/api/cut-clip) will download both and merge with ffmpeg.
            ...(cached.audioUrl ? { audioUrl: cached.audioUrl } : {}),
          });
        }
      }

      for (const client of CLIENTS) {
        try {
          const result = await tryClient(videoId, client, h, cookieHeader, resolveWantMuxed);
          if (result) {
            await cachePutResolved(videoId, h, { ...result, client: client.name }, resolveWantMuxed);
            return json({ ...result, client: client.name, colo: request.cf?.colo || '?' });
          }
          errors.push(`${client.name}@${h}: no stream URL`);
        } catch (e) {
          const msg = (e instanceof Error ? e.message : String(e)).slice(0, 150);
          errors.push(`${client.name}@${h}: ${msg}`);
        }
      }

      try {
        const cobaltUrl = await getYouTubeStreamViaCobalt(videoId, h);
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
        await cachePutResolved(videoId, h, result, resolveWantMuxed);
        return json(result);
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 150);
        errors.push(`cobalt@${h}: ${msg}`);
      }
    }

    // ── Last-resort fallback: Invidious & Piped ────────────────────────────
    // Reached when ALL tryClient + cobalt attempts fail across ALL heights.
    // Invidious/Piped return googlevideo.com direct URLs that CF Workers can
    // fetch directly (CF IPs are not blocked by googlevideo.com).
    // Pass resolveWantMuxed so they prefer combined (muxed) formats when requested.
    for (const fallback of [
      { name: 'Invidious', fn: () => getYouTubeStreamViaInvidious(videoId, requestedMaxHeight, resolveWantMuxed) },
      { name: 'Piped', fn: () => getYouTubeStreamViaPiped(videoId, requestedMaxHeight, resolveWantMuxed) },
    ]) {
      try {
        const result = await fallback.fn();
        const resolved = {
          title: 'YouTube Video',
          duration: 300,
          streamUrl: result.url,
          quality: result.quality,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          visitorData: '',
          xClientName: '1',
          clientVersion: '2.20240101.00.00',
          client: result.source,
          ...(result.audioUrl ? { audioUrl: result.audioUrl } : {}),
        };
        await cachePutResolved(videoId, requestedMaxHeight, resolved, resolveWantMuxed);
        return json({ ...resolved, colo: request.cf?.colo || '?' });
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 150);
        errors.push(`${fallback.name}@${requestedMaxHeight}: ${msg}`);
      }
    }

    // ── Stale-while-revalidate: return stale cache when all fresh resolution fails ──
    // YouTube rate-limits CF Worker IPs after the first successful /resolve call.
    // Subsequent calls within the rate-limit window fail with LOGIN_REQUIRED.
    // But the stale streamUrl is still usable because /stream has IP-binding bypass
    // (strips ip= param). Return stale cache (up to 2 hours old) instead of 502.
    for (const h of heights) {
      const stale = await cacheGetResolved(videoId, h, true);
      if (stale?.streamUrl) {
        return json({
          title: stale.title || 'YouTube Video',
          duration: stale.duration || 300,
          streamUrl: stale.streamUrl,
          quality: (stale.quality || 'cached') + ' (stale)',
          userAgent: stale.userAgent,
          visitorData: stale.visitorData,
          xClientName: stale.xClientName,
          clientVersion: stale.clientVersion,
          client: (stale.client || 'cached') + '-stale',
          colo: request.cf?.colo || '?',
          stale: true,
          ...(stale.audioUrl ? { audioUrl: stale.audioUrl } : {}),
        });
      }
    }

    return json({ error: `All clients failed: ${errors.slice(0, 14).join(' | ')}` }, 502);
  },
};

function normalizeMaxHeight(value) {
  const n = parseInt(String(value || ''), 10);
  if (!Number.isFinite(n)) return MAX_HEIGHT;
  if (n < 144) return 144;
  if (n > MAX_HEIGHT) return MAX_HEIGHT;
  return n;
}

async function tryClient(videoId, client, maxHeight, cookieHeader, wantMuxed) {
  const effectiveWantMuxed = wantMuxed === true;
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

  // YouTube InnerTube API returns:
  //   - data.streamingData.formats: COMBINED (muxed) video+audio formats (itag 18=360p, 22=720p)
  //   data.streamingData.adaptiveFormats: DASH formats (video-only or audio-only)
  // The previous detection (audioQuality || audioChannels || audioBitrate) was unreliable
  // because some clients omit these fields. The `formats` array is the canonical source
  // of muxed streams — use it directly.
  const muxedRaw = data.streamingData?.formats ?? [];
  const adaptiveRaw = data.streamingData?.adaptiveFormats ?? [];
  const formats = [...muxedRaw, ...adaptiveRaw];

  if (!formats.length) throw new Error('No formats in response');

  // Combined (muxed) formats — straight from data.streamingData.formats
  // (these always have both video and audio tracks)
  const muxed = muxedRaw.filter((f) =>
    (f?.url || f?.signatureCipher || f?.cipher) && typeof f.mimeType === 'string' && f.mimeType.startsWith('video/')
  );
  const videoFormats = formats.filter((f) =>
    (f?.url || f?.signatureCipher || f?.cipher) && typeof f.mimeType === 'string' && f.mimeType.startsWith('video/')
  );
  const muxedFormat = pickBest(muxed, maxHeight);
  const muxedHeight = formatHeight(muxedFormat);

  // muxed=1: caller explicitly wants a combined video+audio stream (e.g., Vercel
  // cannot fetch separate audio, or browser-side captureStream needs one stream).
  // Return the best muxed format even if it is lower quality than video-only.
  // If this client has no muxed formats, skip it so the caller can try other
  // clients (some InnerTube clients expose combined formats while others don't).
  if (effectiveWantMuxed) {
    if (muxedFormat) {
      const resolvedUrl = await resolveFormatUrl(muxedFormat, videoId, cookieHeader);
      if (resolvedUrl) {
        return {
          title: data.videoDetails?.title ?? 'YouTube Video',
          duration: parseInt(data.videoDetails?.lengthSeconds ?? '300', 10) || 300,
          streamUrl: resolvedUrl,
          quality: `${muxedFormat.qualityLabel ?? muxedFormat.quality ?? `${muxedHeight}p`} (muxed)`,
          userAgent: client.userAgent,
          visitorData,
          xClientName: client.xClientName,
          clientVersion: client.clientVersion,
          _debug: { combinedHeight: muxedHeight, chosenHeight: muxedHeight, requestedMaxHeight: maxHeight, muxed: true },
        };
      }
    }
    throw new Error('No muxed (combined video+audio) format available from this client');
  }

  // Default path: try HD video-only + separate audio first, then fall back to muxed.
  let chosen = muxedFormat || videoFormats[0] || formats[0];
  let chosenHeight = muxedHeight;
  let audioUrl = '';
  const debug = {
    combinedHeight: muxedHeight,
    videoOnlyCount: 0,
    audioOnlyCount: 0,
    audioOnlyWithUrl: 0,
    audioOnlyCiphered: 0,
    videoResolvedOk: false,
    audioResolvedOk: false,
  };

  // video-only formats are in adaptiveFormats (not in formats/muxed)
  const videoOnly = adaptiveRaw.filter((f) =>
    (f?.url || f?.signatureCipher || f?.cipher) && typeof f.mimeType === 'string' && f.mimeType.startsWith('video/')
  );
  const audioOnly = adaptiveRaw.filter((f) =>
    (f?.url || f?.signatureCipher || f?.cipher) &&
    typeof f.mimeType === 'string' && (f.mimeType.startsWith('audio/mp4') || f.mimeType.includes('audio/'))
  );

  debug.videoOnlyCount = videoOnly.length;
  debug.audioOnlyCount = audioOnly.length;
  debug.audioOnlyWithUrl = audioOnly.filter((a) => a.url).length;
  debug.audioOnlyCiphered = audioOnly.filter((a) => a.signatureCipher || a.cipher).length;

  const videoCandidates = videoOnly
    .map((f) => ({ f, q: formatHeight(f) }))
    .filter((x) => x.q > 0 && x.q <= (maxHeight || MAX_HEIGHT))
    .sort((a, b) => b.q - a.q);

  for (const candidate of videoCandidates) {
    // Skip candidates that are not better than the best muxed format.
    if (muxedFormat && candidate.q <= muxedHeight) break;
    const videoResolved = await resolveFormatUrl(candidate.f, videoId, cookieHeader);
    if (!videoResolved) continue;
    debug.videoResolvedOk = true;

    // Find a resolvable audio stream
    for (const a of audioOnly) {
      const audioResolved = await resolveFormatUrl(a, videoId, cookieHeader);
      if (audioResolved) {
        audioUrl = audioResolved;
        break;
      }
    }

    // Only choose video-only if we have a matching audio stream.
    // Otherwise try the next video candidate.
    if (audioUrl) {
      chosen = candidate.f;
      chosenHeight = candidate.q;
      debug.audioResolvedOk = true;
      break;
    }
  }

  // If no video-only candidate had a usable audio stream, fall back to muxed.
  if (!audioUrl && muxedFormat) {
    chosen = muxedFormat;
    chosenHeight = muxedHeight;
  }

  const resolvedUrl = await resolveFormatUrl(chosen, videoId, cookieHeader);
  if (!resolvedUrl) {
    const hasCipher = formats.some((f) => f.signatureCipher || f.cipher);
    throw new Error(`No direct URL${hasCipher ? ' (cipher)' : ''}`);
  }

  // Quality note: when maxHeight < MIN_HD_HEIGHT (SD heights loop iteration),
  // we accept any quality — this is the SD fallback path (B-plan).
  // When maxHeight >= MIN_HD_HEIGHT (HD heights loop iteration), we still
  // accept the result even if combinedHeight < maxHeight because:
  // 1. tryClient already tried adaptiveFormats HD video-only + audio first
  // 2. If that failed, combined stream is the best this client can do
  // 3. The heights loop will try other clients at the same height
  // 4. If no client can do HD at this height, the loop moves to SD heights
  //    (if allowSdFallback) or returns 502 (if hdOnly).
  // The chosenHeight logging helps diagnose quality via error messages.

  return {
    title: data.videoDetails?.title ?? 'YouTube Video',
    duration: parseInt(data.videoDetails?.lengthSeconds ?? '300', 10) || 300,
    streamUrl: resolvedUrl,
    quality: chosen?.qualityLabel ?? chosen?.quality ?? 'unknown',
    userAgent: client.userAgent,
    visitorData,
    xClientName: client.xClientName,
    clientVersion: client.clientVersion,
    ...(audioUrl ? { audioUrl } : {}),
    _debug: { ...debug, chosenHeight: formatHeight(chosen), requestedMaxHeight: maxHeight },
  };
}

function json(data, status = 200) {
  const payload =
    data && typeof data === 'object' && !Array.isArray(data)
      ? { build: BUILD_ID, ...data }
      : data;
  return new Response(JSON.stringify(payload), {
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

// ── YouTube watch page scraper ─────────────────────────────────────────────
// Parses ytInitialPlayerResponse from the watch page HTML.
// This is yt-dlp's approach and sometimes works when InnerTube API is
// rate-limited, because the watch page endpoint has different rate-limiting.
async function getStreamViaWatchPage(videoId, maxHeight, cookieHeader) {
  const maxH = Math.min(parseInt(String(maxHeight || 720), 10) || 720, 1080);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(watchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`watch page HTTP ${res.status}`);
  const html = await res.text();

  // Extract ytInitialPlayerResponse JSON from the page
  const marker = 'ytInitialPlayerResponse';
  const idx = html.indexOf(marker);
  if (idx < 0) throw new Error('ytInitialPlayerResponse not found');
  // Find the JSON object after the marker
  let start = -1;
  for (let i = idx + marker.length; i < html.length; i += 1) {
    if (html[i] === '{') { start = i; break; }
  }
  if (start < 0) throw new Error('player response JSON not found');

  // Find matching closing brace
  let depth = 0;
  let end = -1;
  for (let i = start; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) throw new Error('player response JSON incomplete');

  let data;
  try {
    data = JSON.parse(html.slice(start, end));
  } catch (e) {
    throw new Error(`player response JSON parse: ${e.message}`);
  }

  const ps = data?.playabilityStatus?.status;
  if (ps && ps !== 'OK') {
    throw new Error(`${ps}: ${data.playabilityStatus?.reason ?? ''}`);
  }

  const formats = [
    ...(data?.streamingData?.formats ?? []),
    ...(data?.streamingData?.adaptiveFormats ?? []),
  ];
  if (!formats.length) throw new Error('no formats in watch page response');

  // Parse quality label (e.g. "720p" → 720)
  const parseQ = (label) => {
    const m = /(\d{3,4})/.exec(label || '');
    return m ? parseInt(m[1], 10) : 0;
  };

  // Prefer combined mp4 (video+audio) under maxH
  const combined = formats
    .filter((f) => f?.url && f?.mimeType?.includes('video/mp4') && (f.audioQuality || f.audioChannels))
    .map((f) => ({ f, q: parseQ(f.qualityLabel || f.quality) }))
    .filter((x) => x.q > 0 && x.q <= maxH)
    .sort((a, b) => b.q - a.q);

  if (combined.length > 0) {
    return {
      url: combined[0].f.url,
      quality: combined[0].f.qualityLabel || combined[0].f.quality || `${combined[0].q}p`,
      title: data?.videoDetails?.title,
      duration: parseInt(data?.videoDetails?.lengthSeconds || '300', 10) || 300,
    };
  }

  // Fallback: adaptiveFormats video-only + audio
  const videoOnly = formats
    .filter((f) => f?.url && f?.mimeType?.includes('video/mp4') && !(f.audioQuality || f.audioChannels))
    .map((f) => ({ f, q: parseQ(f.qualityLabel || f.quality) }))
    .filter((x) => x.q > 0 && x.q <= maxH)
    .sort((a, b) => b.q - a.q);

  const audioOnly = formats
    .filter((f) => f?.url && (f?.mimeType?.includes('audio/mp4') || f?.mimeType?.includes('audio/')))
    .sort((a, b) => parseInt(b.bitrate || '0', 10) - parseInt(a.bitrate || '0', 10));

  if (videoOnly.length > 0) {
    return {
      url: videoOnly[0].f.url,
      audioUrl: audioOnly.length > 0 ? audioOnly[0].url : null,
      quality: videoOnly[0].f.qualityLabel || videoOnly[0].f.quality || `${videoOnly[0].q}p`,
      title: data?.videoDetails?.title,
      duration: parseInt(data?.videoDetails?.lengthSeconds || '300', 10) || 300,
    };
  }

  // Last resort: any format with a URL
  const any = formats.find((f) => f?.url);
  if (any) {
    return {
      url: any.url,
      quality: any.qualityLabel || any.quality || 'unknown',
      title: data?.videoDetails?.title,
      duration: parseInt(data?.videoDetails?.lengthSeconds || '300', 10) || 300,
    };
  }

  throw new Error('no streamable formats in watch page response');
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

// Invidious fallback — returns googlevideo.com direct URLs.
// CF Workers can fetch these directly (CF IPs are not blocked by googlevideo.com).
// Used when InnerTube API (tryClient) is rate-limited on the current colo.
// When wantMuxed=true, prefers formatStreams (combined video+audio) over
// adaptiveFormats (video-only + audio) — needed because /api/cut-clip may not
// fetch audioUrl separately. When wantMuxed=false, prefers adaptiveFormats
// for HD quality (formatStreams typically max out at 360p, itag 18).
async function getYouTubeStreamViaInvidious(videoId, maxHeight, wantMuxed = false) {
  const maxH = Math.min(parseInt(String(maxHeight || 720), 10) || 720, 1080);
  let lastError = 'no instances tried';
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) { lastError = `${instance}: HTTP ${res.status}`; continue; }
      const data = await res.json();
      if (!data?.formatStreams?.length && !data?.adaptiveFormats?.length) {
        lastError = `${instance}: no streams`;
        continue;
      }

      // combined (muxed) streams — formatStreams (typically 360p, itag 18)
      const combined = (data.formatStreams || [])
        .filter((s) => s?.url && s?.type?.includes('video/mp4'))
        .map((s) => {
          const m = /(\d+)p/.exec(s.qualityLabel || s.resolution || '');
          return { url: s.url, h: m ? parseInt(m[1], 10) : 0 };
        })
        .filter((s) => s.h > 0 && s.h <= maxH)
        .sort((a, b) => b.h - a.h);

      // When wantMuxed=true, return combined stream (single URL with both
      // video+audio). This is critical for /api/cut-clip which doesn't fetch
      // audioUrl separately — without this, downloads have no audio.
      if (wantMuxed && combined.length > 0) {
        return { url: combined[0].url, audioUrl: null, quality: `${combined[0].h}p (muxed)`, source: 'invidious' };
      }

      // adaptiveFormats — pick best video-only mp4 under maxH + best audio mp4
      const videoOnly = (data.adaptiveFormats || [])
        .filter((s) => s?.url && s?.type?.includes('video/mp4'))
        .map((s) => {
          const m = /(\d+)p/.exec(s.qualityLabel || s.resolution || '');
          return { url: s.url, h: m ? parseInt(m[1], 10) : 0 };
        })
        .filter((s) => s.h > 0 && s.h <= maxH)
        .sort((a, b) => b.h - a.h);
      const audioOnly = (data.adaptiveFormats || [])
        .filter((s) => s?.url && s?.type?.includes('audio/mp4'))
        .sort((a, b) => parseInt(b.bitrate || '0', 10) - parseInt(a.bitrate || '0', 10));

      if (videoOnly.length > 0) {
        return {
          url: videoOnly[0].url,
          audioUrl: audioOnly.length > 0 ? audioOnly[0].url : null,
          quality: `${videoOnly[0].h}p`,
          source: 'invidious',
        };
      }

      // Final fallback: combined (muxed) stream
      if (combined.length > 0) {
        return { url: combined[0].url, audioUrl: null, quality: `${combined[0].h}p`, source: 'invidious' };
      }
      lastError = `${instance}: no suitable stream`;
    } catch (e) {
      lastError = `${instance}: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`;
    }
  }
  throw new Error(`All Invidious instances failed. Last: ${lastError}`);
}

// Piped fallback — returns googlevideo.com direct URLs (often ciphered, but
// Piped handles deciphering server-side and returns usable URLs).
// When wantMuxed=true, prefers combined streams (videoOnly === false) over
// adaptive (video-only + separate audio) to ensure a single muxed URL.
async function getYouTubeStreamViaPiped(videoId, maxHeight, wantMuxed = false) {
  const maxH = Math.min(parseInt(String(maxHeight || 720), 10) || 720, 1080);
  let lastError = 'no instances tried';
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) { lastError = `${instance}: HTTP ${res.status}`; continue; }
      const data = await res.json();
      if (!data?.videoStreams?.length && !data?.audioStreams?.length) {
        lastError = `${instance}: no streams`;
        continue;
      }
      // combined (muxed) streams — videoOnly === false means both video+audio
      const combined = (data.videoStreams || [])
        .filter((s) => s?.url && s?.mimeType?.includes('video/mp4') && s.videoOnly === false)
        .map((s) => ({ url: s.url, h: parseInt(s.quality, 10) || 0 }))
        .filter((s) => s.h > 0 && s.h <= maxH)
        .sort((a, b) => b.h - a.h);
      // When wantMuxed=true, return combined stream first to ensure audio is present
      if (wantMuxed && combined.length > 0) {
        return { url: combined[0].url, audioUrl: null, quality: `${combined[0].h}p (muxed)`, source: 'piped' };
      }
      // videoStreams: pick best video-only mp4 under maxH
      const videoOnly = (data.videoStreams || [])
        .filter((s) => s?.url && s?.mimeType?.includes('video/mp4') && s.videoOnly === true)
        .map((s) => ({ url: s.url, h: parseInt(s.quality, 10) || 0 }))
        .filter((s) => s.h > 0 && s.h <= maxH)
        .sort((a, b) => b.h - a.h);
      const audioOnly = (data.audioStreams || [])
        .filter((s) => s?.url && s?.mimeType?.includes('audio/mp4'))
        .sort((a, b) => parseInt(b.quality, 10) - parseInt(a.quality, 10));
      if (videoOnly.length > 0) {
        return {
          url: videoOnly[0].url,
          audioUrl: audioOnly.length > 0 ? audioOnly[0].url : null,
          quality: `${videoOnly[0].h}p`,
          source: 'piped',
        };
      }
      if (combined.length > 0) {
        return {
          url: combined[0].url,
          audioUrl: null,
          quality: `${combined[0].h}p`,
          source: 'piped',
        };
      }
      lastError = `${instance}: no suitable stream`;
    } catch (e) {
      lastError = `${instance}: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`;
    }
  }
  throw new Error(`All Piped instances failed. Last: ${lastError}`);
}
