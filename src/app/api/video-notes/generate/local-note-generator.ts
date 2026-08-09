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

export type TranscriptSegment = {
  /** 字幕开始时间（秒） */
  start: number;
  /** 字幕持续时长（秒） */
  duration: number;
  /** 字幕文本 */
  text: string;
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

// 通过 watch HTML 解析 captions，参考 youtube-transcript-api 的策略
async function getYouTubeCaptionTracksFromWatch(videoId: string): Promise<YouTubeCaptionTrack[]> {
  const url = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  const res = await fetchWithTimeout(url, { headers: { Accept: 'text/html,*/*' } });
  if (!res.ok) return [];
  const html = await res.text();

  // 在 HTML 中找 ytInitialPlayerResponse = {...};
  const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
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

async function getYouTubeTranscript(videoId: string, langHint?: string): Promise<TranscriptSegment[]> {
  // 1. 优先：Invidious 镜像（CORS 友好，绕过 YouTube 对 Vercel 的屏蔽）
  try {
    const segs = await getYouTubeTranscriptFromInvidious(videoId, langHint);
    if (segs.length > 0) return segs;
  } catch (err) {
    console.warn('[yt-transcript] invidious failed:', err);
  }

  // 2. 从 watch HTML 解析 captionTracks
  let tracks: YouTubeCaptionTrack[] = [];
  try {
    tracks = await getYouTubeCaptionTracksFromWatch(videoId);
  } catch (err) {
    console.warn('[yt-transcript] getTracksFromWatch failed:', err);
  }

  // 3. 降级到 timedtext list API
  if (tracks.length === 0) {
    try {
      const legacyTracks = await getYouTubeTranscriptList(videoId);
      tracks = legacyTracks.map(t => ({
        baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${encodeURIComponent(t.lang_code)}${t.name ? `&name=${encodeURIComponent(t.name)}` : ''}&fmt=json3`,
        languageCode: t.lang_code,
        name: t.name,
      }));
    } catch (err) {
      console.warn('[yt-transcript] getList failed:', err);
    }
  }

  if (tracks.length === 0) return [];

  // 选择最匹配的字幕：优先 langHint > 英文 > 中文 > 第一条
  const pickBy = (pred: (t: YouTubeCaptionTrack) => boolean) => tracks.find(pred);
  const wanted =
    (langHint ? pickBy(t => t.languageCode.toLowerCase().startsWith(langHint.toLowerCase())) : undefined) ||
    pickBy(t => t.languageCode.toLowerCase().startsWith('en')) ||
    pickBy(t => t.languageCode.toLowerCase().startsWith('zh')) ||
    tracks[0];
  if (!wanted || !wanted.baseUrl) return [];

  let baseUrl = wanted.baseUrl;
  if (!baseUrl.includes('fmt=')) baseUrl += (baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';

  const res = await fetchWithTimeout(baseUrl, { headers: { Accept: 'application/json,*/*' } });
  if (!res.ok) return [];
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
): LocalVideoNote {
  // 合并字幕为完整文本
  const fullText = segments.map(s => s.text).join(' ').trim();
  const totalDuration = segments.length > 0
    ? segments[segments.length - 1].start + (segments[segments.length - 1].duration || 0)
    : 0;

  if (segments.length === 0 || !fullText) {
    // 没有字幕：返回基于元数据的占位笔记
    return generateFallbackNote(videoTitle, videoUrl, sourceType, locale);
  }

  // 1. 概述：取前 2-3 句话 + 整体统计
  const firstFewTexts = segments.slice(0, Math.min(5, segments.length)).map(s => s.text).join(' ');
  const sentences = splitSentences(firstFewTexts);
  const summary = buildSummary(sentences, videoTitle, totalDuration, segments.length, locale);

  // 2. 高光：把字幕按时长均匀切成 N 段，每段选最关键句
  const highlightCount = Math.min(10, Math.max(5, Math.floor(totalDuration / 60)));
  const highlights = extractHighlights(segments, highlightCount, locale);

  // 3. 金句：取评分最高的 3-6 句
  const takeaways = extractTakeaways(segments, locale);

  return {
    summary,
    highlights,
    takeaways,
    hasTranscript: true,
    totalDuration,
  };
}

function buildSummary(
  firstSentences: string[],
  videoTitle: string | undefined,
  totalDuration: number,
  segCount: number,
  locale: string | undefined,
): string {
  const durationMin = Math.max(1, Math.round(totalDuration / 60));
  const isZh = locale && locale.toLowerCase().startsWith('zh');
  const isJp = locale && locale.toLowerCase().startsWith('ja');

  const title = videoTitle ? videoTitle.slice(0, 100) : '';

  const lead = firstSentences.slice(0, 3).join(' ').slice(0, 280);

  if (isZh) {
    return [
      title ? `视频《${title}》` : '本视频',
      `总时长约 ${durationMin} 分钟，共 ${segCount} 段字幕。`,
      lead ? `主要内容：${lead}` : 'AI 已自动分析视频字幕并提取核心观点。',
    ].join(' ').slice(0, 400);
  }
  if (isJp) {
    return [
      title ? `動画「${title}」` : 'この動画',
      `（長さ約 ${durationMin} 分、${segCount} セグメント）。`,
      lead ? `主な内容：${lead}` : 'AI が字幕を分析しハイライトを抽出しました。',
    ].join(' ').slice(0, 400);
  }
  return [
    title ? `Video "${title}"` : 'This video',
    `(~${durationMin} min, ${segCount} transcript segments).`,
    lead ? `Key content: ${lead}` : 'AI analyzed the transcript and extracted key moments.',
  ].join(' ').slice(0, 400);
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

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function generateFallbackNote(
  videoTitle: string | undefined,
  videoUrl: string,
  sourceType: 'youtube' | 'bilibili' | 'local',
  locale: string | undefined,
): LocalVideoNote {
  const isZh = locale && locale.toLowerCase().startsWith('zh');
  const title = videoTitle || (isZh ? '未知视频' : 'Untitled video');

  // 即使没有字幕，也生成结构化的占位笔记（按预估 10 分钟时长均匀分布 6 个时刻）
  // 这样用户至少能拿到一个有结构的笔记，而不是只有 1 条
  const estimatedDurationSec = 600; // 10 分钟
  const segments = Math.max(5, Math.min(8, Math.floor(estimatedDurationSec / 90)));
  const highlights: Array<{ timestamp: string; startSeconds: number; text: string; level: 'critical' | 'important' }> = [];

  for (let i = 0; i < segments; i++) {
    const t = (estimatedDurationSec / segments) * i;
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

  const summary = isZh
    ? `视频《${title}》暂未提供可自动获取的字幕，AI 已基于视频标题和时长生成占位笔记结构。建议手动观看视频后填充实际内容。`
    : `No transcript available for "${title}". AI generated a placeholder note structure based on the video title and estimated duration. Please watch the video and fill in the actual content.`;

  return {
    summary,
    highlights,
    takeaways,
    hasTranscript: false,
    totalDuration: estimatedDurationSec,
  };
}

// ============================
// 主入口：根据 sourceType 选择字幕源
// ============================

export async function fetchTranscript(
  videoUrl: string,
  sourceType: 'youtube' | 'bilibili' | 'local',
  locale: string | undefined,
): Promise<TranscriptSegment[]> {
  if (sourceType === 'youtube') {
    const id = extractYouTubeId(videoUrl);
    if (!id) return [];
    const langHint = locale && locale.startsWith('zh') ? 'zh' : locale;
    return getYouTubeTranscript(id, langHint);
  }
  if (sourceType === 'bilibili') {
    const bvid = extractBilibiliBvid(videoUrl);
    if (!bvid) return [];
    return getBilibiliTranscript(bvid, locale);
  }
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
