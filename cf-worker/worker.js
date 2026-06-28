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
const BUILD_ID = '2026-06-28-hd-pref-sd-fb';

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
        // quickCheck=1: only try the fast path (streamUrl param) + cache.
        // Skip tryClient/HD re-resolve. Used by Vercel preflight to quickly
        // detect colo-mismatch failures before committing to ffmpeg input.
        const quickCheck = url.searchParams.get('quickCheck') === '1';
        // audio=1: fetch resolved.audioUrl instead of resolved.streamUrl.
        // Used when /resolve returns adaptiveFormats (video-only + audio) and
        // Vercel's ffmpeg needs separate audio input.
        const wantAudio = url.searchParams.get('audio') === '1';
        // hdOnly=1: reject SD streams, return 502 if HD unavailable.
        // Overrides ALLOW_SD_FALLBACK env. Used by Vercel first attempt to
        // pursue HD quality; Vercel retries without hdOnly on failure.
        // B-plan: env ALLOW_SD_FALLBACK=false forces hdOnly globally.
        const allowSdFallback = env?.ALLOW_SD_FALLBACK !== 'false' && url.searchParams.get('hdOnly') !== '1';

        const doFetch = async (resolved) => {
          const isCobalt = resolved?.client === 'cobalt';
          // When audio=1, fetch audioUrl (falls back to streamUrl if no audioUrl)
          const fetchUrl = (wantAudio && resolved.audioUrl) ? resolved.audioUrl : resolved.streamUrl;
          const headers = {
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
          };

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
        const errors = [];
        const directStreamUrl = url.searchParams.get('streamUrl');
        if (directStreamUrl) {
          const directResolved = {
            streamUrl: directStreamUrl,
            userAgent: url.searchParams.get('userAgent') || '',
            visitorData: url.searchParams.get('visitorData') || '',
            xClientName: url.searchParams.get('xClientName') || '1',
            clientVersion: url.searchParams.get('clientVersion') || '2.20240101.00.00',
            client: url.searchParams.get('clientName') || 'direct',
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
                // Preserve audioUrl from tryClient (HD video-only + separate audio).
                // Previously this was dropped, so /stream cached entries lacked
                // audioUrl and subsequent /resolve cache hits returned video-only.
                ...(info.audioUrl ? { audioUrl: info.audioUrl } : {}),
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

    for (const h of heights) {
      const cached = await cacheGetResolved(videoId, h);
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
          // Preserve audioUrl from cache (HD video-only + separate audio path).
          // Previously this was dropped on cache hit, causing Vercel to receive
          // a video-only stream without audio and ffmpeg to fail.
          ...(cached.audioUrl ? { audioUrl: cached.audioUrl } : {}),
        });
      }

      for (const client of CLIENTS) {
        try {
          const result = await tryClient(videoId, client, h, cookieHeader);
          if (result) {
            await cachePutResolved(videoId, h, { ...result, client: client.name });
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
        await cachePutResolved(videoId, h, result);
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
    for (const fallback of [
      { name: 'Invidious', fn: () => getYouTubeStreamViaInvidious(videoId, requestedMaxHeight) },
      { name: 'Piped', fn: () => getYouTubeStreamViaPiped(videoId, requestedMaxHeight) },
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
        await cachePutResolved(videoId, requestedMaxHeight, resolved);
        return json({ ...resolved, colo: request.cf?.colo || '?' });
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 150);
        errors.push(`${fallback.name}@${requestedMaxHeight}: ${msg}`);
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

  // Combined (muxed) formats — usually limited to 360p without auth
  const videoFormats = formats.filter((f) =>
    (f?.url || f?.signatureCipher || f?.cipher) && typeof f.mimeType === 'string' && f.mimeType.startsWith('video/')
  );
  const muxed = videoFormats.filter((f) => f.audioQuality || f.audioChannels || f.audioBitrate);
  const combinedFormat = pickBest(muxed.length ? muxed : videoFormats, maxHeight);
  const combinedHeight = formatHeight(combinedFormat);

  // If combined is below 720p, try adaptiveFormats for HD video-only + audio
  let chosen = combinedFormat || videoFormats[0] || formats[0];
  let audioUrl = '';
  const debug = {
    combinedHeight,
    videoOnlyCount: 0,
    audioOnlyCount: 0,
    audioOnlyWithUrl: 0,
    audioOnlyCiphered: 0,
    videoResolvedOk: false,
    audioResolvedOk: false,
  };

  if (combinedHeight < 720) {
    const videoOnly = videoFormats.filter((f) => !(f.audioQuality || f.audioChannels || f.audioBitrate));
    const audioOnly = formats.filter((f) =>
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
      if (candidate.q <= combinedHeight) break;
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
      // Otherwise fall back to combined (lower quality but has audio).
      if (audioUrl) {
        chosen = candidate.f;
        debug.audioResolvedOk = true;
        break;
      }
      // audioUrl failed for this candidate — try next video candidate
    }
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
// Prefers adaptiveFormats (video-only + audio) for HD quality, since
// formatStreams (combined/muxed) typically max out at 360p (itag 18).
async function getYouTubeStreamViaInvidious(videoId, maxHeight) {
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

      // Fallback: combined (muxed) stream — typically 360p only
      const combined = (data.formatStreams || [])
        .filter((s) => s?.url && s?.type?.includes('video/mp4'))
        .map((s) => {
          const m = /(\d+)p/.exec(s.qualityLabel || s.resolution || '');
          return { url: s.url, h: m ? parseInt(m[1], 10) : 0 };
        })
        .filter((s) => s.h > 0 && s.h <= maxH)
        .sort((a, b) => b.h - a.h);
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
async function getYouTubeStreamViaPiped(videoId, maxHeight) {
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
      // videoStreams: pick best video-only mp4 under maxH
      const videoOnly = (data.videoStreams || [])
        .filter((s) => s?.url && s?.mimeType?.includes('video/mp4') && s.videoOnly === true)
        .map((s) => ({ url: s.url, h: parseInt(s.quality, 10) || 0 }))
        .filter((s) => s.h > 0 && s.h <= maxH)
        .sort((a, b) => b.h - a.h);
      // combined (muxed) streams
      const combined = (data.videoStreams || [])
        .filter((s) => s?.url && s?.mimeType?.includes('video/mp4') && s.videoOnly === false)
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
