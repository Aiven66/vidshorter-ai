/**
 * 本地视频字幕获取与高光笔记生成框架
 *
 * 设计目标：
 * - 完全不依赖云端 LLM，避免因 API key 缺失或网络问题导致生成失败
 * - 通过公开字幕接口获取 YouTube / B站字幕（无字幕时降级到元数据生成笔记）
 * - 使用 TextRank-like 启发式算法选取关键句作为高光内容
 *
 * 适用于 Vercel serverless nodejs runtime，无外部依赖。
 */

import { fetchFullTranscript } from '@/lib/server/subtitles';

export type TranscriptSegment = {
  /** 字幕开始时间（秒） */
  start: number;
  /** 字幕持续时长（秒） */
  duration: number;
  /** 字幕文本 */
  text: string;
};

export type CorePoint = {
  /** 序号 1-based */
  index: number;
  /** 核心点标题（一句话总结） */
  title: string;
  /** 详细阐述（1-2 段） */
  detail: string;
  /** 引用的高光时间戳列表 */
  sourceTimestamps?: string[];
  /** 预估重要性：0-1 */
  weight?: number;
};

export type LocalVideoNote = {
  summary: string;
  highlights: Array<{
    timestamp: string;
    startSeconds: number;
    text: string;
    level: 'critical' | 'important';
  }>;
  takeaways: string[];
  /** 核心讲义要点（基于字幕聚类/分段提炼出的编号列表） */
  corePoints: CorePoint[];
  /** 是否使用字幕生成（false 表示降级到元数据） */
  hasTranscript: boolean;
  /** 估算/解析出的视频总时长（秒），用于前端时间轴 */
  totalDuration: number;
};

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function pickUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);
  const headers = {
    'User-Agent': pickUA(),
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
    ...(opts.headers || {}),
  };
  return fetch(url, { ...opts, headers, signal });
}

/**
 * Vercel 环境变量 YOUTUBE_COOKIES 里的 YouTube 登录 Cookie。
 * 支持 Netscape cookies.txt（tab 分隔 7 列）与 `a=b; c=d` 两种写法。
 * 带上真实登录 Cookie 后，YouTube 不再对服务器出口 IP 返回 LOGIN_REQUIRED。
 */
function getYoutubeCookieHeader(): string {
  const raw = String(process.env.YOUTUBE_COOKIES || '').trim();
  if (!raw) return '';
  if (!raw.includes('\t')) return raw;
  return raw
    .split('\n')
    .filter(l => !l.startsWith('#') && l.trim())
    .map(l => {
      const p = l.split('\t');
      return p.length >= 7 ? `${p[5]}=${p[6]}` : '';
    })
    .filter(Boolean)
    .join('; ');
}

/** 从 YouTube URL 提取 video id */
export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '').trim();
      return /^[a-zA-Z0-9_-]{7,15}$/.test(id) ? id : null;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{7,15}$/.test(v)) return v;
      const m = u.pathname.match(/\/(?:embed|shorts)\/([a-zA-Z0-9_-]{7,15})/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

/** 从 B站 URL 提取 bvid */
export function extractBilibiliBvid(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/bilibili\.com|b23\.tv/i.test(u.hostname)) return null;
    // /video/BVxxxx
    const m = u.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
    if (m) return m[1];
    // b23.tv 短链需要 redirect，这里返回 bvid 字段
    const bv = u.searchParams.get('bvid');
    if (bv) return bv;
  } catch {}
  return null;
}

// ============================
// YouTube 字幕获取
// ============================

interface YouTubeCaptionTrack {
  baseUrl: string;
  languageCode: string;
  name?: string;
  kind?: string;
  vssId?: string;
}

// Invidious 实例列表（公开镜像，CORS 友好，绕过 YouTube 直接屏蔽）
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://yewtu.be',
  'https://invidious.nerdvpn.de',
  'https://iv.ggtyler.dev',
];

// 通过 Invidious API 获取字幕（CORS 友好，绕过 YouTube 对 Vercel IP 的屏蔽）
async function getYouTubeTranscriptFromInvidious(videoId: string, langHint?: string): Promise<TranscriptSegment[]> {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      // 1. 获取 captions 列表
      const captionsUrl = `${base}/api/v1/captions/${videoId}`;
      const res = await fetchWithTimeout(captionsUrl, { headers: { Accept: 'application/json' } }, 8000);
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      const captions: Array<{ label?: string; languageCode?: string; kind?: string; url?: string }> = Array.isArray(data?.captions) ? data.captions : [];
      if (captions.length === 0) continue;

      // 2. 选择匹配的字幕
      const pickBy = (pred: (c: any) => boolean) => captions.find(pred);
      const wanted =
        (langHint ? pickBy(c => String(c.languageCode || '').toLowerCase().startsWith(langHint.toLowerCase())) : undefined) ||
        pickBy(c => String(c.languageCode || '').toLowerCase().startsWith('en')) ||
        pickBy(c => String(c.languageCode || '').toLowerCase().startsWith('zh')) ||
        captions[0];
      if (!wanted?.url) continue;

      // 3. 下载字幕内容（vtt 格式）
      const subRes = await fetchWithTimeout(wanted.url, { headers: { Accept: 'text/vtt,application/json,*/*' } }, 10000);
      if (!subRes.ok) continue;
      const contentType = subRes.headers.get('content-type') || '';
      let text = '';
      if (contentType.includes('json')) {
        const subData = await subRes.json().catch(() => null);
        text = typeof subData?.body === 'string' ? subData.body : '';
      } else {
        text = await subRes.text();
      }
      if (!text) continue;

      const segments = parseVTT(text);
      if (segments.length > 0) {
        return segments;
      }
    } catch (err) {
      console.warn(`[yt-invidious] ${base} failed:`, err);
      continue;
    }
  }
  return [];
}

// 解析 VTT 字幕格式
function parseVTT(vtt: string): TranscriptSegment[] {
  const lines = vtt.split(/\r?\n/);
  const segments: TranscriptSegment[] = [];
  let currentText: string[] = [];
  let currentStart = 0;
  let currentDuration = 0;
  let inCue = false;

  const parseTime = (s: string): number => {
    const m = s.match(/(\d+):(\d+):(\d+)\.(\d+)|(\d+):(\d+)\.(\d+)/);
    if (!m) return 0;
    if (m[1]) {
      return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 1000;
    }
    return parseInt(m[5]) * 60 + parseInt(m[6]) + parseInt(m[7]) / 1000;
  };

  for (const line of lines) {
    if (line.startsWith('WEBVTT') || line.trim() === '' || /^NOTE/.test(line.trim())) {
      if (inCue && currentText.length > 0) {
        segments.push({
          start: currentStart,
          duration: currentDuration,
          text: currentText.join(' ').trim(),
        });
        currentText = [];
        inCue = false;
      }
      continue;
    }
    const timeMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})/);
    if (timeMatch) {
      if (inCue && currentText.length > 0) {
        segments.push({
          start: currentStart,
          duration: currentDuration,
          text: currentText.join(' ').trim(),
        });
        currentText = [];
      }
      currentStart = parseTime(timeMatch[1]);
      currentDuration = parseTime(timeMatch[2]) - currentStart;
      inCue = true;
      continue;
    }
    if (inCue) {
      // 跳过纯样式行
      const clean = line.replace(/<[^>]+>/g, '').trim();
      if (clean) currentText.push(clean);
    }
  }
  if (inCue && currentText.length > 0) {
    segments.push({
      start: currentStart,
      duration: currentDuration,
      text: currentText.join(' ').trim(),
    });
  }
  return segments;
}

/** 从 watch HTML 里解析 captionTracks（直连与 CF Worker 代理两条路径共用）。 */
function extractCaptionTracksFromHtml(html: string): YouTubeCaptionTrack[] {
  // 在 HTML 中找 ytInitialPlayerResponse = {...};
  const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\});/);
  if (!m) return [];
  let playerResponse: any;
  try {
    playerResponse = JSON.parse(m[1]);
  } catch {
    try {
      const text = m[1];
      let depth = 0;
      let endIdx = -1;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
          depth--;
          if (depth === 0) {
            endIdx = i + 1;
            break;
          }
        }
      }
      if (endIdx > 0) {
        playerResponse = JSON.parse(text.substring(0, endIdx));
      }
    } catch {}
  }
  if (!playerResponse) return [];

  const tracks: YouTubeCaptionTrack[] = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  return tracks;
}

// 通过 watch HTML 解析 captions，参考 youtube-transcript-api 的策略
async function getYouTubeCaptionTracksFromWatch(videoId: string): Promise<YouTubeCaptionTrack[]> {
  const url = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  const cookie = getYoutubeCookieHeader();
  const res = await fetchWithTimeout(url, {
    headers: { Accept: 'text/html,*/*', ...(cookie ? { Cookie: cookie } : {}) },
  });
  if (!res.ok) return [];
  return extractCaptionTracksFromHtml(await res.text());
}

// 旧的 timedtext list API（备用）
async function getYouTubeTranscriptList(videoId: string): Promise<any[]> {
  const url = `https://www.youtube.com/api/timedtext?v=${videoId}&type=list`;
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/xml,text/plain,*/*' } });
  if (!res.ok) return [];
  const xml = await res.text();
  const tracks: any[] = [];
  const re = /<track\s+([^>]+)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const attrs = match[1];
    const obj: Record<string, string> = {};
    const attrRe = /(\w+)="([^"]+)"/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(attrs))) {
      obj[am[1]] = am[2];
    }
    if (obj.lang_code) tracks.push(obj);
  }
  return tracks;
}

/** 把 locale / langHint（如 'zh' / 'en'）映射成字幕白名单代码（如 'zh-CN' / 'en'）。 */
function toWhitelistLang(langHint?: string): string | null {
  if (!langHint) return null;
  const l = String(langHint).toLowerCase();
  if (l.startsWith('zh-hant') || l.startsWith('zh-tw')) return 'zh-TW';
  if (l.startsWith('zh')) return 'zh-CN';
  return l.split('-')[0];
}

/** 直接调用 InnerTube player 接口的客户端序列（移动端最不易被数据中心 IP 风控）。 */
const INNERTUBE_CLIENTS = [
  {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
  },
  {
    clientName: 'IOS',
    clientVersion: '19.45.4',
    userAgent: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X)',
  },
  {
    clientName: 'WEB',
    clientVersion: '2.20240726.00.00',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  },
];

/** 解析 timedtext 两种格式：`<p t="ms" d="ms">…</p>` 与 `<text start="s" dur="s">…</text>` */
function parseTimedText(xml: string): TranscriptSegment[] {
  const decode = (s: string) =>
    s
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
      .trim();

  const segments: TranscriptSegment[] = [];
  const pRe = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(xml))) {
    const text = decode(m[3]);
    if (text) segments.push({ start: Number(m[1]) / 1000, duration: Number(m[2]) / 1000, text });
  }
  if (segments.length > 0) return segments;

  const tRe = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  while ((m = tRe.exec(xml))) {
    const text = decode(m[3]);
    if (text) segments.push({ start: Number(m[1]), duration: Number(m[2]), text });
  }
  return segments;
}

/**
 * 直连 InnerTube player 接口取字幕（不依赖 youtube-transcript 包）。
 * 与 yt-stream 路由同款调用方式，额外兜底 IOS / WEB 客户端，且每次失败都写入明文原因。
 */
async function getYouTubeTranscriptFromInnertube(
  videoId: string,
  langHint: string | undefined,
  diag?: TranscriptDiagnostic,
): Promise<TranscriptSegment[]> {
  const cookie = getYoutubeCookieHeader();
  for (const client of INNERTUBE_CLIENTS) {
    const tag = `innertube(${client.clientName})`;
    try {
      const res = await fetchWithTimeout(
        'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': client.userAgent,
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: JSON.stringify({
            context: {
              client: { clientName: client.clientName, clientVersion: client.clientVersion },
            },
            videoId,
          }),
        },
        12000,
      );
      if (!res.ok) {
        diag?.attempts.push(`${tag} http ${res.status}`);
        continue;
      }
      const data = await res.json().catch(() => null);
      const status = data?.playabilityStatus?.status;
      const tracks: YouTubeCaptionTrack[] =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (tracks.length === 0) {
        diag?.attempts.push(`${tag} no captionTracks (playability=${status || '?'})`);
        continue;
      }

      const wanted = pickCaptionTrack(tracks, langHint);
      if (!wanted?.baseUrl) {
        diag?.attempts.push(`${tag} pick failed`);
        continue;
      }

      const capRes = await fetchWithTimeout(
        wanted.baseUrl,
        {
          headers: {
            'User-Agent': client.userAgent,
            Accept: '*/*',
            ...(cookie ? { Cookie: cookie } : {}),
          },
        },
        12000,
      );
      if (!capRes.ok) {
        diag?.attempts.push(`${tag} caption http ${capRes.status}`);
        continue;
      }
      const segs = parseTimedText(await capRes.text());
      if (segs.length > 0) {
        if (diag) diag.source = tag;
        return segs;
      }
      diag?.attempts.push(`${tag} caption body parsed to 0 lines`);
    } catch (err) {
      diag?.attempts.push(`${tag} ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return [];
}

/** 选择最匹配的字幕轨：优先 langHint > 英文 > 中文 > 第一条。 */
function pickCaptionTrack(
  tracks: YouTubeCaptionTrack[],
  langHint?: string,
): YouTubeCaptionTrack | undefined {
  const pickBy = (pred: (t: YouTubeCaptionTrack) => boolean) => tracks.find(pred);
  const code = (t: YouTubeCaptionTrack) => String(t.languageCode || '').toLowerCase();
  return (
    (langHint ? pickBy(t => code(t).startsWith(langHint.toLowerCase())) : undefined) ||
    pickBy(t => code(t).startsWith('en')) ||
    pickBy(t => code(t).startsWith('zh')) ||
    tracks[0]
  );
}

/** CF Worker 代理地址（从 Cloudflare IP 出网，绕过 Vercel 数据中心 IP 的 YouTube LOGIN_REQUIRED）。 */
function getCfWorkerUrl(): string {
  const raw = String(process.env.CF_WORKER_URL || '').trim();
  return raw ? raw.replace(/\/$/, '') : '';
}

/** 通过 CF Worker 的 /stream 端点代理抓取任意 YouTube URL。 */
async function fetchViaCfWorker(
  videoId: string,
  targetUrl: string,
  timeoutMs = 20000,
): Promise<Response | null> {
  const cf = getCfWorkerUrl();
  if (!cf) return null;
  const u = new URL(`${cf}/stream`);
  u.searchParams.set('videoId', videoId);
  u.searchParams.set('streamUrl', targetUrl);
  return fetchWithTimeout(u.toString(), { headers: { Accept: '*/*' } }, timeoutMs);
}

/**
 * 经 CF Worker 代理取字幕（生产环境最可靠的一条路径）：
 * 先用 CF IP 抓 watch HTML 拿 captionTracks，再用 CF IP 抓 timedtext 拿字幕正文。
 * Vercel 数据中心 IP 直连会拿到 LOGIN_REQUIRED，只有走 Cloudflare 出口才稳定。
 */
async function getYouTubeTranscriptViaCfWorker(
  videoId: string,
  langHint: string | undefined,
  diag?: TranscriptDiagnostic,
): Promise<TranscriptSegment[]> {
  const tag = 'cf-worker';
  if (!getCfWorkerUrl()) {
    diag?.attempts.push(`${tag}: CF_WORKER_URL 未配置`);
    return [];
  }
  // CF Worker 出口偶发被 YouTube 风控（LOGIN_REQUIRED / 返回 HTML 拦截页），重试可显著提高命中率。
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const suffix = attempt > 1 ? ` #${attempt}` : '';
    try {
      const watchRes = await fetchViaCfWorker(
        videoId,
        `https://www.youtube.com/watch?v=${videoId}&hl=en`,
      );
      if (!watchRes) return [];
      if (!watchRes.ok) {
        diag?.attempts.push(`${tag}${suffix} watch http ${watchRes.status}`);
        continue;
      }
      const tracks = extractCaptionTracksFromHtml(await watchRes.text());
      if (tracks.length === 0) {
        diag?.attempts.push(`${tag}${suffix} watch 无 captionTracks`);
        continue;
      }
      const wanted = pickCaptionTrack(tracks, langHint);
      if (!wanted?.baseUrl) {
        diag?.attempts.push(`${tag}${suffix} pick failed`);
        continue;
      }
      const capRes = await fetchViaCfWorker(videoId, wanted.baseUrl);
      if (!capRes || !capRes.ok) {
        diag?.attempts.push(`${tag}${suffix} timedtext http ${capRes?.status ?? 'no-response'}`);
        continue;
      }
      const body = await capRes.text();
      const segs = parseTimedText(body);
      if (segs.length === 0) {
        // 打印明文原因：200 但不是字幕 XML，多半是被风控返回的 HTML 拦截页。
        const head = body.replace(/\s+/g, ' ').slice(0, 70);
        diag?.attempts.push(
          `${tag}${suffix} timedtext 0 行 (type=${capRes.headers.get('content-type') || '?'} head=${head})`,
        );
        continue;
      }
      if (diag) {
        diag.source = `${tag}(${wanted.languageCode}${wanted.kind ? '/' + wanted.kind : ''})`;
      }
      return segs;
    } catch (err) {
      diag?.attempts.push(`${tag}${suffix}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return [];
}

async function getYouTubeTranscript(
  videoId: string,
  langHint?: string,
  diag?: TranscriptDiagnostic,
): Promise<TranscriptSegment[]> {
  if (diag) diag.source = 'none';

  // 0. youtube-transcript 包（ANDROID InnerTube；Recap / 字幕烧录已在生产使用）
  try {
    const { cues } = await fetchFullTranscript(videoId, toWhitelistLang(langHint));
    if (cues.length > 0) {
      if (diag) diag.source = 'youtube-transcript';
      return cues.map((c) => ({
        start: c.start,
        duration: Math.max(0, c.end - c.start),
        text: c.text,
      }));
    }
    diag?.attempts.push('youtube-transcript: no cues');
  } catch (err) {
    diag?.attempts.push(
      `youtube-transcript: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 1. 经 CF Worker 代理（生产环境唯一稳定通道：Vercel 数据中心 IP 会被 LOGIN_REQUIRED 拦截）
  try {
    const segs = await getYouTubeTranscriptViaCfWorker(videoId, langHint, diag);
    if (segs.length > 0) return segs;
  } catch (err) {
    diag?.attempts.push(`cf-worker: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. 直连 InnerTube（不依赖第三方包，自带 3 种客户端兜底）
  try {
    const segs = await getYouTubeTranscriptFromInnertube(videoId, langHint, diag);
    if (segs.length > 0) return segs;
  } catch (err) {
    diag?.attempts.push(`innertube-direct: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. 降级：Invidious 镜像（CORS 友好，绕过 YouTube 对 Vercel 的屏蔽）
  try {
    const segs = await getYouTubeTranscriptFromInvidious(videoId, langHint);
    if (segs.length > 0) {
      if (diag) diag.source = 'invidious';
      return segs;
    }
    diag?.attempts.push('invidious: no captions');
  } catch (err) {
    diag?.attempts.push(`invidious: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. 从 watch HTML 解析 captionTracks
  let tracks: YouTubeCaptionTrack[] = [];
  try {
    tracks = await getYouTubeCaptionTracksFromWatch(videoId);
  } catch (err) {
    diag?.attempts.push(`watch-html: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 5. 降级到 timedtext list API
  if (tracks.length === 0) {
    try {
      const legacyTracks = await getYouTubeTranscriptList(videoId);
      tracks = legacyTracks.map(t => ({
        baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${encodeURIComponent(t.lang_code)}${t.name ? `&name=${encodeURIComponent(t.name)}` : ''}&fmt=json3`,
        languageCode: t.lang_code,
        name: t.name,
      }));
    } catch (err) {
      diag?.attempts.push(`timedtext-list: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (tracks.length === 0) {
    diag?.attempts.push('watch-html/timedtext: no tracks');
    return [];
  }

  const wanted = pickCaptionTrack(tracks, langHint);
  if (!wanted || !wanted.baseUrl) {
    diag?.attempts.push('watch-html: pick failed');
    return [];
  }

  let baseUrl = wanted.baseUrl;
  if (!baseUrl.includes('fmt=')) baseUrl += (baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';

  const res = await fetchWithTimeout(baseUrl, { headers: { Accept: 'application/json,*/*' } });
  if (!res.ok) {
    diag?.attempts.push(`watch-html: caption http ${res.status}`);
    return [];
  }
  const data = await res.json().catch(() => null);
  const events = Array.isArray(data?.events) ? data.events : [];
  const segments: TranscriptSegment[] = [];
  for (const ev of events) {
    if (!ev) continue;
    const segs = Array.isArray(ev.segs) ? ev.segs : [];
    const text = segs
      .map((s: any) => (typeof s?.utf8 === 'string' ? s.utf8 : ''))
      .join('')
      .trim();
    if (!text) continue;
    segments.push({
      start: typeof ev.tStartMs === 'number' ? ev.tStartMs / 1000 : 0,
      duration: typeof ev.dDurationMs === 'number' ? ev.dDurationMs / 1000 : 0,
      text,
    });
  }
  if (segments.length > 0) {
    if (diag) diag.source = 'watch-html';
  } else {
    diag?.attempts.push('watch-html: caption json3 parsed to 0 lines');
  }
  return segments;
}

// ============================
// B站字幕获取
// ============================

async function getBilibiliCid(bvid: string): Promise<number | null> {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const cid = data?.data?.cid;
  return typeof cid === 'number' ? cid : null;
}

async function getBilibiliTranscript(bvid: string, _langHint?: string): Promise<TranscriptSegment[]> {
  const cid = await getBilibiliCid(bvid);
  if (cid == null) return [];

  // 获取字幕列表
  const url = `https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${cid}`;
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const subtitles: Array<{ subtitle_url?: string; lan?: string }> = data?.data?.subtitle?.subtitles || [];

  if (subtitles.length === 0) return [];

  // 优先选 zh-Hans / ai-zh
  const pick =
    subtitles.find(s => /zh|hans/i.test(s.lan || '')) ||
    subtitles[0];

  const subUrl = pick?.subtitle_url;
  if (!subUrl) return [];

  const fullSubUrl = subUrl.startsWith('//') ? `https:${subUrl}` : subUrl.startsWith('http') ? subUrl : `https://api.bilibili.com${subUrl}`;
  const subRes = await fetchWithTimeout(fullSubUrl, { headers: { Accept: 'application/json' } });
  if (!subRes.ok) return [];
  const subData = await subRes.json().catch(() => null);
  const body: Array<{ from?: number; to?: number; content?: string }> = Array.isArray(subData?.body) ? subData.body : [];
  const segments: TranscriptSegment[] = [];
  for (const item of body) {
    const text = (item.content || '').trim();
    if (!text) continue;
    segments.push({
      start: typeof item.from === 'number' ? item.from : 0,
      duration: typeof item.to === 'number' && typeof item.from === 'number' ? item.to - item.from : 0,
      text,
    });
  }
  return segments;
}

// ============================
// 笔记生成算法（本地，无 LLM）
// ============================

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 简单分词器：支持中英文 */
function tokenize(text: string): string[] {
  // 中文按字符，英文按单词
  const tokens: string[] = [];
  // 先按非字母数字汉字切分
  const parts = text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/);
  for (const p of parts) {
    if (!p) continue;
    if (/[\u4e00-\u9fa5]/.test(p)) {
      // 中文：单字 + 2-gram
      for (let i = 0; i < p.length; i++) {
        tokens.push(p[i]);
        if (i < p.length - 1) tokens.push(p.substring(i, i + 2));
      }
    } else if (p.length >= 2) {
      tokens.push(p);
    }
  }
  return tokens;
}

/** 计算词频 */
function computeWordFrequency(segments: TranscriptSegment[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const seg of segments) {
    const tokens = tokenize(seg.text);
    for (const t of tokens) {
      freq.set(t, (freq.get(t) || 0) + 1);
    }
  }
  return freq;
}

/** 句子分割 */
function splitSentences(text: string): string[] {
  return text
    .split(/[。.!！?？\n]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 4);
}

/** 给句子打分：基于关键词密度、长度、位置 */
function scoreSentence(
  sentence: string,
  freq: Map<string, number>,
  totalSentences: number,
  index: number,
): number {
  const tokens = tokenize(sentence);
  if (tokens.length === 0) return 0;

  // 关键词密度（归一化）
  let keywordScore = 0;
  for (const t of tokens) {
    keywordScore += freq.get(t) || 0;
  }
  keywordScore = keywordScore / Math.sqrt(tokens.length);

  // 长度评分：中等长度（10-50 字）最佳
  const len = sentence.length;
  let lengthScore = 1;
  if (len < 8) lengthScore = 0.3;
  else if (len < 15) lengthScore = 0.7;
  else if (len > 80) lengthScore = 0.5;
  else lengthScore = 1;

  // 位置评分：开头和结尾的句子更重要（视频通常有 intro / conclusion）
  const position = index / Math.max(1, totalSentences - 1);
  const positionScore = position < 0.15 || position > 0.85 ? 1.2 : 1;

  return keywordScore * lengthScore * positionScore;
}

/** 主笔记生成函数 */
export function generateNoteFromTranscript(
  segments: TranscriptSegment[],
  videoTitle: string | undefined,
  videoUrl: string,
  sourceType: 'youtube' | 'bilibili' | 'local',
  locale: string | undefined,
  description?: string,
  durationSec?: number,
  chapters?: Chapter[],
): LocalVideoNote {
  // 合并字幕为完整文本
  const fullText = segments.map(s => s.text).join(' ').trim();
  const totalDuration = segments.length > 0
    ? segments[segments.length - 1].start + (segments[segments.length - 1].duration || 0)
    : 0;

  if (segments.length === 0 || !fullText) {
    // 没有字幕：返回基于元数据的占位笔记（带上真实时长与真实章节，铺满整条进度条）
    return generateFallbackNote(videoTitle, videoUrl, sourceType, locale, description, durationSec, chapters);
  }

  // 1. 高光：把字幕按时长均匀切成 N 段，每段选最关键句
  const highlightCount = Math.min(10, Math.max(5, Math.floor(totalDuration / 60)));
  const highlights = extractHighlights(segments, highlightCount, locale);

  // 2. 金句：取评分最高的 3-6 句
  const takeaways = extractTakeaways(segments, locale);

  // 3. 核心讲义要点（编号形式，5-8 条）
  const corePoints = extractCorePoints(segments, highlights, videoTitle, locale);

  // 4. 概述：基于全片字幕句子评分 + 核心要点脉络，生成尽可能全面的概览
  const summary = buildOverviewSummary(segments, videoTitle, totalDuration, corePoints, locale);

  return {
    summary,
    highlights,
    takeaways,
    corePoints,
    hasTranscript: true,
    totalDuration,
  };
}

const OVERVIEW_MAX_CHARS = 1400;

/**
 * 全片概览：对整段字幕逐句打分，取分数最高的 8 个不重复句子（按时间顺序），
 * 再加上前 6 个核心要点的标题作为「全片脉络」，生成一段尽可能全面的概述。
 */
function buildOverviewSummary(
  segments: TranscriptSegment[],
  videoTitle: string | undefined,
  totalDuration: number,
  corePoints: CorePoint[],
  locale: string | undefined,
): string {
  const isZh = !!locale && locale.toLowerCase().startsWith('zh');
  const isJp = !!locale && locale.toLowerCase().startsWith('ja');
  const durationMin = Math.max(1, Math.round(totalDuration / 60));
  const title = videoTitle ? videoTitle.slice(0, 100) : '';

  // 1) 全片逐句打分
  const freq = computeWordFrequency(segments);
  const totalSentences = Math.max(1, segments.length);
  const scored: Array<{ text: string; start: number; score: number }> = [];
  segments.forEach((seg, idx) => {
    const sents = splitSentences(seg.text);
    for (const s of sents) {
      scored.push({ text: s, start: seg.start, score: scoreSentence(s, freq, totalSentences, idx) });
    }
  });

  if (scored.length === 0) {
    // 退化：直接拼接整段字幕
    const joined = segments.map(s => s.text).join(isZh ? '。' : ' ').trim();
    return truncate(joined, OVERVIEW_MAX_CHARS);
  }

  // 2) 高分句子优先，按 token 签名去重，取前 8 句
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const picked: Array<{ text: string; start: number }> = [];
  for (const item of scored) {
    const sig = tokenize(item.text).slice(0, 6).sort().join('|');
    if (sig && seen.has(sig)) continue;
    seen.add(sig);
    picked.push({ text: item.text, start: item.start });
    if (picked.length >= 8) break;
  }

  // 3) 按时间顺序重排，构成"关键内容概览"
  picked.sort((a, b) => a.start - b.start);
  const keySentences = picked.map(p => truncate(p.text, 180));
  const pointTitles = corePoints.slice(0, 6).map(p => p.title);

  let summary: string;
  if (isZh) {
    const head = title
      ? `视频《${title}》总长约 ${durationMin} 分钟（共 ${segments.length} 段字幕）。`
      : `本视频总长约 ${durationMin} 分钟（共 ${segments.length} 段字幕）。`;
    const body = keySentences.length > 0 ? `核心内容概览：${keySentences.join('；')}。` : '';
    const structure = pointTitles.length > 0 ? `全片脉络：${pointTitles.join('，')}。` : '';
    const closing = '以上概述由 AI 从整段字幕中自动提取。';
    summary = [head, body, structure, closing].filter(Boolean).join('');
  } else if (isJp) {
    const head = title
      ? `動画「${title}」の長さは約 ${durationMin} 分（全 ${segments.length} セグメント）。`
      : `この動画の長さは約 ${durationMin} 分（全 ${segments.length} セグメント）。`;
    const body = keySentences.length > 0 ? `主な内容：${keySentences.join('；')}。` : '';
    const structure = pointTitles.length > 0 ? `全体の流れ：${pointTitles.join('、')}。` : '';
    const closing = 'この概要は AI が字幕全体から自動抽出しました。';
    summary = [head, body, structure, closing].filter(Boolean).join('');
  } else {
    const head = title
      ? `Video "${title}" (~${durationMin} min, ${segments.length} transcript segments).`
      : `This video is ~${durationMin} min long with ${segments.length} transcript segments.`;
    const body = keySentences.length > 0 ? `Key content overview: ${keySentences.join('; ')}.` : '';
    const structure =
      pointTitles.length > 0
        ? `Full structure: ${pointTitles.map((ttl, i) => `${i + 1}) ${ttl}`).join(' ')}.`
        : '';
    const closing = 'This overview was extracted from the entire transcript by AI.';
    summary = [head, body, structure, closing].filter(Boolean).join(' ');
  }

  return truncate(summary, OVERVIEW_MAX_CHARS);
}

function extractHighlights(
  segments: TranscriptSegment[],
  count: number,
  locale: string | undefined,
): Array<{ timestamp: string; startSeconds: number; text: string; level: 'critical' | 'important' }> {
  const freq = computeWordFrequency(segments);
  const total = segments.length;
  if (total === 0) return [];

  // 按时长均匀分桶
  const bucketSize = Math.max(1, Math.floor(total / count));
  const highlights: Array<{
    timestamp: string;
    startSeconds: number;
    text: string;
    score: number;
    seg: TranscriptSegment;
  }> = [];

  for (let i = 0; i < count; i++) {
    const start = i * bucketSize;
    const end = Math.min(total, (i + 1) * bucketSize);
    if (start >= end) break;
    const bucket = segments.slice(start, end);

    // 在桶内把所有字幕合并成几句，按评分排序选最优
    const bucketSentences: Array<{
      text: string;
      seg: TranscriptSegment;
      score: number;
    }> = [];
    for (const seg of bucket) {
      const sents = splitSentences(seg.text);
      for (const s of sents) {
        const score = scoreSentence(s, freq, total, start);
        bucketSentences.push({ text: s, seg, score });
      }
    }
    if (bucketSentences.length === 0) {
      // 退化：直接用桶里第一段字幕
      const first = bucket[0];
      highlights.push({
        timestamp: formatTimestamp(first.start),
        startSeconds: Math.round(first.start),
        text: truncate(first.text, 80),
        score: 0,
        seg: first,
      });
      continue;
    }
    bucketSentences.sort((a, b) => b.score - a.score);
    const best = bucketSentences[0];
    highlights.push({
      timestamp: formatTimestamp(best.seg.start),
      startSeconds: Math.round(best.seg.start),
      text: truncate(best.text, 100),
      score: best.score,
      seg: best.seg,
    });
  }

  // 按 score 排序，前 30% 标记为 critical
  const sortedByScore = [...highlights].sort((a, b) => b.score - a.score);
  const criticalCount = Math.max(1, Math.floor(sortedByScore.length * 0.3));
  const criticalSet = new Set(sortedByScore.slice(0, criticalCount).map(h => h.timestamp + '|' + h.text));

  return highlights.map(h => ({
    timestamp: h.timestamp,
    startSeconds: h.startSeconds,
    text: h.text,
    level: criticalSet.has(h.timestamp + '|' + h.text) ? 'critical' : 'important',
  }));
}

function extractTakeaways(segments: TranscriptSegment[], locale: string | undefined): string[] {
  const freq = computeWordFrequency(segments);
  const all: Array<{ text: string; score: number; seg: TranscriptSegment }> = [];
  for (const seg of segments) {
    const sents = splitSentences(seg.text);
    sents.forEach((s, idx) => {
      const score = scoreSentence(s, freq, segments.length, idx);
      all.push({ text: s, score, seg });
    });
  }
  all.sort((a, b) => b.score - a.score);

  // 去重相似句，最多取 5 条
  const result: string[] = [];
  const seenTokens = new Set<string>();
  for (const item of all) {
    const tokens = tokenize(item.text).slice(0, 5);
    const sig = tokens.sort().join('|');
    if (seenTokens.has(sig)) continue;
    seenTokens.add(sig);
    result.push(truncate(item.text, 80));
    if (result.length >= 5) break;
  }
  return result;
}

// ============================
// 核心讲义要点提取（核心价值点编号 1、2、3…）
// ============================

/**
 * 把字幕按时间切片为 5-8 个阶段，对每个阶段聚合出：
 *  - title: 该阶段的一句话核心
 *  - detail: 2-4 句详细阐述
 *  - sourceTimestamps: 相关高光时刻的时间戳
 *
 * 避免简单罗列，采用"主题段 -> 中心句 + 细节句 + 引用高光"的讲义结构。
 */
function extractCorePoints(
  segments: TranscriptSegment[],
  highlights: Array<{ timestamp: string; startSeconds: number; text: string; level: string }>,
  videoTitle: string | undefined,
  locale: string | undefined,
): CorePoint[] {
  const isZh = locale && locale.toLowerCase().startsWith('zh');
  const freq = computeWordFrequency(segments);
  const total = segments.length;
  if (total === 0) return [];

  // 1) 按内容量分成 5-8 段（越多内容越细）
  const chunkCount = Math.min(8, Math.max(5, Math.floor(total / 15)));
  const chunkSize = Math.max(1, Math.floor(total / chunkCount));
  const chunks: TranscriptSegment[][] = [];
  for (let i = 0; i < chunkCount; i++) {
    const s = i * chunkSize;
    const e = Math.min(total, i === chunkCount - 1 ? total : s + chunkSize);
    if (s >= e) break;
    chunks.push(segments.slice(s, e));
  }
  if (chunks.length === 0) return [];

  // 2) 对每个 chunk 选出：中心句 + 细节句集合
  const points: CorePoint[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const firstStart = chunk[0].start;
    const lastStart = chunk[chunk.length - 1].start;

    // 把该 chunk 所有句子打分
    const chunkSentences: Array<{ text: string; seg: TranscriptSegment; score: number }> = [];
    for (const seg of chunk) {
      const sents = splitSentences(seg.text);
      for (const s of sents) {
        const score = scoreSentence(s, freq, total, Math.max(0, Math.floor((firstStart + lastStart) / 2)));
        chunkSentences.push({ text: s, seg, score });
      }
    }
    if (chunkSentences.length === 0) continue;

    chunkSentences.sort((a, b) => b.score - a.score);

    // Title = 评分最高的一句（精简）
    const title = truncate(chunkSentences[0].text, isZh ? 40 : 70);

    // Detail = 评分 2~6 名的句子拼成 120-200 字阐述
    const detailSentences = chunkSentences.slice(1, 6).map(cs => cs.text);
    const rawDetail = detailSentences.join(isZh ? '。' : '. ') + (isZh ? '。' : '.');
    const detail = truncate(rawDetail, isZh ? 220 : 380);

    // 关联该时间区间的高光时间戳
    const related = highlights.filter(h => {
      return h.startSeconds >= firstStart - 3 && h.startSeconds <= lastStart + 5;
    }).map(h => h.timestamp);
    const sourceTimestamps = related.slice(0, 3);

    // 重要性：最高分 + 位置加权
    const weight = Math.min(1, chunkSentences[0].score / 1000) * (i < 2 || i >= chunks.length - 2 ? 1.2 : 1);

    points.push({
      index: i + 1,
      title,
      detail,
      sourceTimestamps,
      weight,
    });
  }

  // 3) 若 points 数量不足 5，补充"总结/行动建议"等结构化项
  if (points.length < 5) {
    const remainder = 5 - points.length;
    for (let k = 0; k < remainder; k++) {
      const nextIdx = points.length + 1;
      const titleSrc = isZh
        ? [
            '核心方法论总结',
            '常见误区与避坑指南',
            '实践建议与下一步行动',
          ]
        : [
            'Core methodology',
            'Common pitfalls & mistakes to avoid',
            'Action items & next steps',
          ];
      points.push({
        index: nextIdx,
        title: titleSrc[k % titleSrc.length],
        detail: isZh
          ? '请结合视频内容及上方高光时刻，把本讲义要点进一步细化为可执行的行动清单。'
          : 'Combine the highlights above and refine this point into actionable items.',
        sourceTimestamps: [],
        weight: 0.4,
      });
    }
  }

  // 4) 补充开场/收尾的"导入/总结"包装（若标题存在）
  if (videoTitle && points.length >= 2) {
    // 仅保留微调，不篡改已提炼内容
    points[0].title = (isZh ? `① 背景导入：` : `1. Setup: `) + points[0].title.replace(/^[①②③④⑤⑥⑦⑧]\s*/, '').replace(/^[0-9]+\.\s*/, '');
    if (points.length >= 3) {
      const last = points[points.length - 1];
      last.title = (isZh ? `${numberToZhCircle(points.length)} 总结与启示：` : `${points.length}. Conclusion: `) + last.title.replace(/^[①②③④⑤⑥⑦⑧]\s*/, '').replace(/^[0-9]+\.\s*/, '');
    }
  }

  return points;
}

function numberToZhCircle(n: number): string {
  const mapping = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
  return mapping[n - 1] || `${n}`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function generateFallbackNote(
  videoTitle: string | undefined,
  videoUrl: string,
  sourceType: 'youtube' | 'bilibili' | 'local',
  locale: string | undefined,
  description?: string,
  durationSec?: number,
  chapters?: Chapter[],
): LocalVideoNote {
  const isZh = locale && locale.toLowerCase().startsWith('zh');
  const title = videoTitle || (isZh ? '未知视频' : 'Untitled video');

  // 视频描述（当无字幕时作为补充信息源）：句子切分后取前 ~500 字符
  const descText = description ? description.replace(/\r/g, '').trim() : '';
  let descExcerpt = '';
  if (descText) {
    const sents = splitSentences(descText.replace(/\n+/g, ' '));
    const parts: string[] = [];
    let len = 0;
    for (const s of sents) {
      if (parts.length > 0 && len + s.length > 500) break;
      parts.push(s);
      len += s.length + 1;
    }
    descExcerpt = parts.length > 0 ? parts.join(isZh ? '。' : '. ') : descText.slice(0, 500);
  }
  const descLines = descText
    ? descText
        .split(/\n+/)
        .map(l => l.replace(/^\s*[-•*]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  // 无字幕时的兜底高光：必须「铺满整条视频」，而不是挤在开头。
  // 优先级：① 真实章节（YouTube 自动章节 / 简介时间戳）→ 最贴近真实高光；
  //          ② 用抓到的真实时长把 N 个时刻均匀铺满全片；③ 兜底才用保守估算时长。
  const knownDuration = typeof durationSec === 'number' && durationSec > 60 ? durationSec : 0;
  const totalSec = knownDuration || 600;
  const highlights: Array<{
    timestamp: string;
    startSeconds: number;
    text: string;
    level: 'critical' | 'important';
  }> = [];
  let usedChapters = false;

  if (chapters && chapters.length >= 3) {
    usedChapters = true;
    const list = chapters.slice(0, 10);
    list.forEach((c, i) => {
      const isEdge = i === 0 || i === list.length - 1;
      highlights.push({
        timestamp: formatTimestamp(c.startSeconds),
        startSeconds: Math.round(c.startSeconds),
        text: c.title,
        level: isEdge ? 'critical' : 'important',
      });
    });
  } else {
    // 均匀铺满整条进度条：条数随片长增加（10 分钟 → 5 条，1 小时 → 7-9 条）。
    // 首条落在 00:00（开场），末条落在接近片尾（总结），中间等分分布，
    // 从而覆盖整条视频，而不是挤在开头。
    const segments = Math.max(5, Math.min(10, Math.round(totalSec / 420)));
    const step = segments > 1 ? totalSec / (segments - 1) : totalSec;
    for (let i = 0; i < segments; i += 1) {
      // 末条避免正好压在片尾（点击会跳到 EOF），向前留 20 秒
      const raw = step * i;
      const t = i === segments - 1 ? Math.max(0, totalSec - 20) : raw;
      const isCritical = i === 0 || i === segments - 1;
      let text: string;
      if (isZh) {
        if (i === 0) text = `开场介绍：${title}`;
        else if (i === segments - 1) text = '总结回顾与下期预告';
        else text = `第 ${i} 部分重点内容`;
      } else {
        if (i === 0) text = `Opening introduction: ${title}`;
        else if (i === segments - 1) text = 'Conclusion and key takeaways';
        else text = `Part ${i} key content`;
      }
      highlights.push({
        timestamp: formatTimestamp(t),
        startSeconds: Math.round(t),
        text,
        level: isCritical ? 'critical' : 'important',
      });
    }
  }

  const takeaways = isZh
    ? [
        `${title} 的核心观点`,
        '视频中提及的关键方法',
        '结尾的行动建议',
      ]
    : [
        `Core topic of "${title}"`,
        'Key methodology mentioned in the video',
        'Action items from the conclusion',
      ];

  const timeHintZh = usedChapters
    ? `已用该视频的真实章节把高光时刻铺满整条进度条（共 ${highlights.length} 个时间点）。`
    : knownDuration
      ? `未能获取字幕，已按视频真实时长（${formatTimestamp(totalSec)}）把 ${highlights.length} 个高光时刻均匀铺满整条进度条。`
      : '未获取到视频时长，高光时刻为保守估算。';
  const timeHintEn = usedChapters
    ? `Real video chapters were used to spread the highlights across the full timeline (${highlights.length} points).`
    : knownDuration
      ? `Without captions, ${highlights.length} highlight points were spread evenly across the real video length (${formatTimestamp(totalSec)}).`
      : 'Video length was unavailable, so highlight points use a conservative estimate.';

  const summary = isZh
    ? [
        `视频《${title}》暂未提供可自动获取的字幕，AI 已基于视频标题${descExcerpt ? '与简介' : ''}生成笔记骨架。`,
        timeHintZh,
        descExcerpt ? `视频简介：${descExcerpt}` : '',
        '你可以：1) 确认该视频是否带有官方/CC 字幕；2) 观看后补充你自己的批注；3) 使用下方的「翻译笔记」「分享海报」等功能整理并传播这份笔记。',
      ].filter(Boolean).join(' ')
    : [
        `No auto-capturable transcript is available for "${title}". AI generated a note skeleton from the video title${descExcerpt ? ' and description' : ''}.`,
        timeHintEn,
        descExcerpt ? `Video description: ${descExcerpt}` : '',
        'What you can do: 1) check whether the video has official/CC captions; 2) add your own viewing notes; 3) use the "Translate note" and "Share poster" features below to organize and share the note.',
      ].filter(Boolean).join(' ');

  // 核心要点：6 条讲义结构，避免"罗列"而是给用户可填充的讲义骨架
  const corePoints: CorePoint[] = [];
  const coreCount = 6;
  for (let i = 0; i < coreCount; i++) {
    const idx = i + 1;
    let pointTitle: string;
    let pointDetail: string;
    if (isZh) {
      const titles = [
        `① 背景导入：为什么关注《${title}》`,
        `② 主题范围：本期视频核心主题界定`,
        `③ 关键原理：视频中的核心方法论或公式`,
        `④ 实践案例：视频中给出的具体案例或数据`,
        `⑤ 误区提醒：视频里指出的踩坑或注意点`,
        `⑥ 总结启示：看完后的行动清单与复盘要点`,
      ];
      pointTitle = titles[i];
      const details = [
        '视频开场铺垫的背景、问题陈述、以及为什么今天要聊这个主题。请结合 00:30 前的内容手动补充。',
        '视频中真正要解决的问题范围，边界界定是什么，避免过度延伸。',
        '核心的方法步骤、公式或思考模型，通常是视频最值得做笔记的部分。',
        '主讲人给出的真实案例、数据支撑或反例，帮助理解抽象原理。',
        '视频中明确提醒的常见错误、反模式或容易忽略的点。',
        '结尾给出的行动建议、可执行清单（Checklist）、以及你自己的复盘。',
      ];
      pointDetail = details[i];
    } else {
      const titles = [
        `1. Context: Why "${title}" matters`,
        `2. Scope: The exact topics this video covers`,
        `3. Core Model: Key methodology / framework`,
        `4. Evidence: Real examples & data`,
        `5. Pitfalls: Mistakes & what to avoid`,
        `6. Takeaways: Action items & recap`,
      ];
      pointTitle = titles[i];
      const details = [
        'What background, problem, or trend opens the video? Fill in from the first 10%.',
        'The exact scope and boundaries of the topic — what is in vs. out of scope.',
        'The core framework, formula, or step-by-step method — the most valuable section.',
        'Concrete examples, case studies, or data points the presenter uses as evidence.',
        'Explicit warnings the speaker gives about common mistakes or anti-patterns.',
        'Closing call-to-action, checklists you can reuse, and personal notes.',
      ];
      pointDetail = details[i];
    }
    corePoints.push({
      index: idx,
      title: pointTitle,
      detail:
        descLines[i] !== undefined
          ? `${pointDetail} ${isZh ? '视频简介线索：' : 'Description hint: '}${truncate(descLines[i], 120)}`
          : pointDetail,
      sourceTimestamps:
        highlights.length > 0
          ? [highlights[Math.min(i, highlights.length - 1)].timestamp]
          : [],
      weight: 1 / (i + 1),
    });
  }

  return {
    summary,
    highlights,
    takeaways,
    corePoints,
    hasTranscript: false,
    totalDuration: totalSec,
  };
}

// ============================
// 主入口：根据 sourceType 选择字幕源
// ============================

/**
 * 逐字稿获取诊断（明文原因，绝不静默降级）。
 * `source` = 命中的字幕来源；`attempts` = 每个来源的失败原因。
 */
export type TranscriptDiagnostic = {
  source: string;
  attempts: string[];
};

export async function fetchTranscript(
  videoUrl: string,
  sourceType: 'youtube' | 'bilibili' | 'local',
  locale: string | undefined,
  diag?: TranscriptDiagnostic,
): Promise<TranscriptSegment[]> {
  if (sourceType === 'youtube') {
    const id = extractYouTubeId(videoUrl);
    if (!id) {
      diag?.attempts.push('youtube: 无法从链接解析出 videoId');
      return [];
    }
    const langHint = locale && locale.startsWith('zh') ? 'zh' : locale;
    return getYouTubeTranscript(id, langHint, diag);
  }
  if (sourceType === 'bilibili') {
    const bvid = extractBilibiliBvid(videoUrl);
    if (!bvid) {
      diag?.attempts.push('bilibili: 无法从链接解析出 bvid');
      return [];
    }
    return getBilibiliTranscript(bvid, locale);
  }
  diag?.attempts.push('local: 本地视频无服务端字幕');
  return [];
}

/** 通过 oEmbed 获取视频标题 */
export async function fetchVideoTitle(
  videoUrl: string,
  sourceType: 'youtube' | 'bilibili' | 'local',
): Promise<string | undefined> {
  if (sourceType === 'youtube') {
    try {
      const id = extractYouTubeId(videoUrl);
      if (!id) return undefined;
      const res = await fetchWithTimeout(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
        { headers: { Accept: 'application/json' } },
      );
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.title === 'string') return data.title.slice(0, 500);
      }
    } catch {}
    return undefined;
  }
  if (sourceType === 'bilibili') {
    try {
      const bvid = extractBilibiliBvid(videoUrl);
      if (!bvid) return undefined;
      const res = await fetchWithTimeout(
        `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (res.ok) {
        const data = await res.json();
        const t = data?.data?.title;
        if (typeof t === 'string') return t.slice(0, 500);
      }
    } catch {}
    return undefined;
  }
  return undefined;
}

/** 解码 JSON 字符串字面量（含 \n / \uXXXX 等转义）；失败时退回手工替换。 */
function decodeJsonString(raw: string): string {
  try {
    const parsed = JSON.parse(`"${raw}"`);
    if (typeof parsed === 'string') return parsed;
  } catch {}
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\\/g, '\\');
}

/** 把 "1:02:03" / "02:03" 解析为秒；非法返回 null。 */
function parseClock(value: string): number | null {
  const m = value.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return (m[1] ? parseInt(m[1], 10) * 3600 : 0) + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
}

type Chapter = { startSeconds: number; title: string };

/** 从简介文本中解析章节行（形如「00:00 开场」「12:34 第一部分」）。 */
function parseChaptersFromText(text: string): Chapter[] {
  if (!text) return [];
  const out: Chapter[] = [];
  const re = /(?:^|\n)\s*[[(]?\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[\])]?\s*[-–—:·]?\s*([^\n]{2,80})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const h = m[1] ? parseInt(m[1], 10) : 0;
    const mi = parseInt(m[2], 10);
    const s = parseInt(m[3], 10);
    const title = String(m[4] || '').replace(/[\s·-–—]+$/, '').trim();
    if (!title) continue;
    out.push({ startSeconds: h * 3600 + mi * 60 + s, title });
  }
  // 必须严格递增且至少 3 条，才认定为章节列表（避免把正文里的偶发时间戳当章节）
  for (let i = 1; i < out.length; i += 1) {
    if (out[i].startSeconds <= out[i - 1].startSeconds) return [];
  }
  return out.length >= 3 ? out : [];
}

/** 从 watch HTML 提取 YouTube 自动章节（macroMarkersListRenderer）。 */
function parseAutoChapters(html: string): Chapter[] {
  const out: Chapter[] = [];
  const pats: RegExp[] = [
    /"macroMarkersListItemRenderer":\{"title":\{"simpleText":"((?:[^"\\]|\\.)*)"\},"timeDescription":\{"simpleText":"([\d:]+)"\}/g,
    /"macroMarkersListItemRenderer":\{"timeDescription":\{"simpleText":"([\d:]+)"\},"title":\{"simpleText":"((?:[^"\\]|\\.)*)"\}/g,
  ];
  for (let p = 0; p < pats.length; p += 1) {
    const re = pats[p];
    const timeFirst = p === 1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const timeStr = timeFirst ? m[1] : m[2];
      const rawTitle = timeFirst ? m[2] : m[1];
      const sec = parseClock(timeStr);
      const title = decodeJsonString(rawTitle).trim();
      if (sec !== null && title) out.push({ startSeconds: sec, title });
    }
    if (out.length >= 3) break;
  }
  out.sort((a, b) => a.startSeconds - b.startSeconds);
  return out.length >= 3 ? out : [];
}

/** 视频元信息（无字幕兜底笔记用）：简介 + 真实时长 + 章节。 */
export interface VideoMeta {
  description?: string;
  durationSec?: number;
  chapters?: Chapter[];
}

/**
 * 尽力获取视频元信息（用于无字幕时的兜底笔记）。任何失败都返回空对象，绝不抛出。
 * - YouTube：抓 watch HTML，取 "lengthSeconds"（真实时长）、"shortDescription"（简介），
 *   以及自动章节（macroMarkers）或简介里的章节时间戳。
 * - B站：走 view 接口读取 data.desc / data.duration。
 */
export async function fetchVideoMeta(
  videoUrl: string,
  sourceType: 'youtube' | 'bilibili' | 'local',
): Promise<VideoMeta> {
  if (sourceType === 'youtube') {
    try {
      const id = extractYouTubeId(videoUrl);
      if (!id) return {};
      const res = await fetchWithTimeout(`https://www.youtube.com/watch?v=${id}&hl=en`, {
        headers: { Accept: 'text/html,*/*' },
      });
      if (!res.ok) return {};
      const html = await res.text();

      const meta: VideoMeta = {};

      // 真实时长：这是无字幕兜底高光能「铺满整条进度条」的关键
      const d = html.match(/"lengthSeconds":"(\d+)"/);
      if (d) {
        const n = parseInt(d[1], 10);
        if (Number.isFinite(n) && n > 0) meta.durationSec = n;
      }

      let raw: string | undefined;
      const m = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
      if (m) raw = m[1];
      if (!raw) {
        const m2 = html.match(/"attributedDescription":\{"content":"((?:[^"\\]|\\.)*)"/);
        if (m2) raw = m2[1];
      }
      const fullDesc = raw ? decodeJsonString(raw).replace(/\r/g, '').trim() : '';
      if (fullDesc) meta.description = fullDesc.slice(0, 2000);

      const autoChapters = parseAutoChapters(html);
      const chapters = autoChapters.length >= 3 ? autoChapters : parseChaptersFromText(fullDesc);
      if (chapters.length >= 3) meta.chapters = chapters;

      return meta;
    } catch {
      return {};
    }
  }
  if (sourceType === 'bilibili') {
    try {
      const bvid = extractBilibiliBvid(videoUrl);
      if (!bvid) return {};
      const res = await fetchWithTimeout(
        `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) return {};
      const data = await res.json().catch(() => null);
      const desc = data?.data?.desc;
      const dur = data?.data?.duration;
      return {
        description:
          typeof desc === 'string' && desc.trim() ? desc.trim().slice(0, 2000) : undefined,
        durationSec: typeof dur === 'number' && dur > 0 ? dur : undefined,
      };
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * 尽力获取视频描述文本（用于无字幕时补充笔记内容）。任何失败都返回 undefined，绝不抛出。
 */
export async function fetchVideoDescription(
  videoUrl: string,
  sourceType: 'youtube' | 'bilibili' | 'local',
): Promise<string | undefined> {
  return (await fetchVideoMeta(videoUrl, sourceType)).description;
}
