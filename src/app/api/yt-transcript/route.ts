/**
 * YouTube 逐字稿抓取（Edge Runtime）。
 *
 * 背景：Vercel 的 AWS Lambda 出口 IP 被 YouTube 拦截，`youtube-transcript`
 * 直连 watch 页在生产必然失败 —— 导致 AI 字幕烧录、AI 粗剪（jump-cut）、
 * Recap Studio、高光笔记、卡拉OK 字幕全部拿不到 cues。
 *
 * 本路由跑在 Edge Runtime（与 Lambda 不同的出口网络），取字幕轨两条路：
 *   ① InnerTube `youtubei/v1/player`（ANDROID / IOS / WEB 多 client）——
 *      与 CF Worker 取流的同一套接口，player response 里带 captionTracks；
 *   ② watch 页 `ytInitialPlayerResponse` 兜底。
 * 拿到 baseUrl 后再取 timedtext（json3，失败退 XML）。
 *
 * 无字幕返回 404，调用方回落其它来源；不抛 500。
 */

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

interface Cue {
  start: number;
  end: number;
  text: string;
}

interface CaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
}

/** InnerTube client 配置（与 cf-worker/worker.js 同源，取字幕优先 ANDROID/IOS）。 */
const CLIENTS = [
  {
    name: 'ANDROID',
    clientName: 'ANDROID',
    clientVersion: '20.10.4',
    userAgent: 'com.google.android.youtube/20.10.4 (Linux; U; Android 14) gzip',
    xClientName: '3',
    extra: { androidSdkVersion: 34, clientFormFactor: 'SMALL_FORM_FACTOR' },
  },
  {
    name: 'IOS',
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
  },
  {
    name: 'WEB',
    clientName: 'WEB',
    clientVersion: '2.20250623.00.00',
    userAgent: UA,
    xClientName: '1',
    extra: {},
  },
];

/** 取 player response 的 captions 节点（InnerTube 与 watch 页结构一致）。 */
function captionTracksOf(player: unknown): CaptionTrack[] {
  const tracks = (player as {
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
  })?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  return Array.isArray(tracks) ? tracks : [];
}

function playabilityOf(player: unknown): string {
  return String(
    (player as { playabilityStatus?: { status?: unknown } })?.playabilityStatus?.status ?? '(none)',
  );
}

/** 从 watch 页 HTML 中取出 ytInitialPlayerResponse（与 CF Worker 同一套括号配平逻辑）。 */
function extractPlayerResponse(html: string): Record<string, unknown> | null {
  const marker = 'ytInitialPlayerResponse';
  const idx = html.indexOf(marker);
  if (idx < 0) return null;

  let start = -1;
  for (let i = idx + marker.length; i < html.length; i += 1) {
    if (html[i] === '{') {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function viaInnerTube(videoId: string, client: (typeof CLIENTS)[number]) {
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
    },
    playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
  };

  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': client.userAgent,
      Origin: 'https://www.youtube.com',
      Referer: 'https://www.youtube.com/',
      'X-Youtube-Client-Name': client.xClientName,
      'X-Youtube-Client-Version': client.clientVersion,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { tracks: captionTracksOf(data), status: playabilityOf(data) };
}

async function viaWatchPage(videoId: string) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999`, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const player = extractPlayerResponse(await res.text());
  if (!player) throw new Error('ytInitialPlayerResponse not found');
  return { tracks: captionTracksOf(player), status: playabilityOf(player) };
}

function pickTrack(tracks: CaptionTrack[], lang: string): CaptionTrack | null {
  const usable = tracks.filter((t) => typeof t?.baseUrl === 'string');
  if (usable.length === 0) return null;

  const wanted = lang.trim().toLowerCase();
  const byExact = (code: string) => usable.find((t) => String(t.languageCode || '').toLowerCase() === code);
  if (wanted) {
    const exact = byExact(wanted);
    if (exact) return exact;
    // zh-Hans 之类的地区码：按主语言前缀兜底匹配
    const prefix = wanted.split('-')[0];
    const loose = usable.find((t) => String(t.languageCode || '').toLowerCase().startsWith(prefix));
    if (loose) return loose;
  }
  return byExact('en') || usable[0];
}

/** json3 字幕：events[].segs[].utf8 + tStartMs/dDurationMs。 */
function parseJson3(payload: unknown): Cue[] {
  const events = (payload as { events?: unknown[] })?.events;
  if (!Array.isArray(events)) return [];
  const cues: Cue[] = [];
  for (const raw of events) {
    const e = raw as { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] };
    if (!Array.isArray(e?.segs)) continue;
    const text = e.segs
      .map((s) => String(s?.utf8 ?? ''))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const start = Number(e.tStartMs ?? 0) / 1000;
    const end = (Number(e.tStartMs ?? 0) + Number(e.dDurationMs ?? 0)) / 1000;
    if (end > start) cues.push({ start, end, text });
  }
  return cues;
}

/** 兜底：老式 XML 字幕（<text start="1.2" dur="3.4">…</text>）。 */
function parseXml(xml: string): Cue[] {
  const cues: Cue[] = [];
  const re = /<text[^>]*\bstart="([\d.]+)"[^>]*\bdur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const start = Number(m[1]);
    const end = start + Number(m[2]);
    const text = m[3]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    if (text && end > start) cues.push({ start, end, text });
  }
  return cues;
}

function timedtextHeaders(trackUrl: string): HeadersInit {
  let referer = 'https://www.youtube.com/';
  try {
    const origin = new URL(trackUrl).origin;
    referer = `${origin}/`;
  } catch {
    // 保持默认
  }
  return { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Referer: referer };
}

/** 取 timedtext：优先 json3，失败退 XML；附带诊断信息。 */
async function fetchCues(baseUrl: string): Promise<{ cues: Cue[]; debug: Record<string, unknown> }> {
  const debug: Record<string, unknown> = {};
  const headers = timedtextHeaders(baseUrl);

  try {
    const u = new URL(baseUrl);
    u.searchParams.set('fmt', 'json3');
    const res = await fetch(u.toString(), { headers, signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    debug.json3 = { status: res.status, bytes: text.length };
    if (res.ok) {
      const cues = parseJson3(text ? JSON.parse(text) : null);
      if (cues.length > 0) return { cues, debug };
    }
  } catch (err) {
    debug.json3 = { error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const res = await fetch(baseUrl, { headers, signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    debug.xml = { status: res.status, bytes: text.length, head: text.slice(0, 160) };
    return { cues: res.ok ? parseXml(text) : [], debug };
  } catch (err) {
    debug.xml = { error: err instanceof Error ? err.message : String(err) };
  }

  return { cues: [], debug };
}

/** 依次尝试各来源，返回第一个拿到 captionTracks 的结果。 */
async function resolveTracks(videoId: string) {
  const attempts: Record<string, unknown>[] = [];

  for (const client of CLIENTS) {
    try {
      const { tracks, status } = await viaInnerTube(videoId, client);
      attempts.push({ source: client.name, status, tracks: tracks.length });
      if (tracks.length > 0) return { tracks, attempts };
    } catch (err) {
      attempts.push({ source: client.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  try {
    const { tracks, status } = await viaWatchPage(videoId);
    attempts.push({ source: 'watch_page', status, tracks: tracks.length });
    if (tracks.length > 0) return { tracks, attempts };
  } catch (err) {
    attempts.push({ source: 'watch_page', error: err instanceof Error ? err.message : String(err) });
  }

  return { tracks: [] as CaptionTrack[], attempts };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = (url.searchParams.get('videoId') || '').trim();
  const lang = url.searchParams.get('lang') || '';
  if (!/^[A-Za-z0-9_-]{7,15}$/.test(videoId)) {
    return Response.json({ error: 'Invalid or missing videoId' }, { status: 400 });
  }

  try {
    const { tracks, attempts } = await resolveTracks(videoId);
    const track = pickTrack(tracks, lang);
    if (!track?.baseUrl) {
      return Response.json({ error: 'No captions available', attempts }, { status: 404 });
    }

    const { cues, debug } = await fetchCues(track.baseUrl);
    if (cues.length === 0) {
      return Response.json(
        { error: 'Caption track returned no cues', lang: track.languageCode, attempts, timedtext: debug },
        { status: 404 },
      );
    }

    return Response.json(
      {
        videoId,
        lang: track.languageCode || null,
        auto: track.kind === 'asr',
        source: attempts[attempts.length - 1]?.source,
        cues,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=600' } },
    );
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}