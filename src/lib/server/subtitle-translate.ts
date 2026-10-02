import type { SubtitleCue } from '@/lib/server/subtitles';

/**
 * P0 — 字幕翻译（Starter+ 权益）。服务端机器翻译引擎（免费、无 API Key）。
 *
 * ★ 批量策略：Google gtx 端点只处理首个 q 参数（多 q 无效），因此把一批 cue 文本
 *   用 \n 拼接成单个 q 一次翻译（两端点均保留换行、逐行独立翻译），响应按行拆分还原，
 *   保持 cue 顺序与时间轴不变。
 *
 * ★ 双保险降级：Google 优先（质量更好、无频率限制）；任一批失败（如 Google 对
 *   undici TLS 指纹返回 429 限流）→ 整体切换 MyMemory（匿名 ~1 req/sec，按字符
 *   分块 + 节流）；两者都失败 → 回落原文（字幕仍可烧录，不致命）。
 */

const GT_CHUNK_LINES = 25;
const GT_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const GT_TIMEOUT_MS = 15_000;

const MM_ENDPOINT = 'https://api.mymemory.translated.net/get';
const MM_MAX_CHARS = 450; // 匿名单请求 ≤500 字符，留余量
const MM_THROTTLE_MS = 1100; // 匿名 ~1 req/sec
const MM_TIMEOUT_MS = 15_000;

/** Google 翻译偶尔返回 HTML 实体（&#39; / &amp; 等），还原为普通字符。 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** 源语言 → MyMemory langpair 代码（MyMemory 用 zh-CN/zh-TW，无自动检测）。 */
function mmSourceCode(sourceLang: string | null | undefined): string {
  const base = (sourceLang || 'en').split('-')[0].toLowerCase();
  if (base === 'zh') return 'zh-CN';
  return base || 'en';
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 提取单查询形态的译文：res[0] = 段数组，逐段取 [0] 拼接（\n 在段内保留），解码实体。 */
function extractGtSegments(data: unknown): string | null {
  const root = Array.isArray(data) && Array.isArray(data[0]) ? (data[0] as unknown[]) : null;
  if (!root || root.length === 0) return null;
  return decodeHtmlEntities(
    root.map((r) => (Array.isArray(r) ? String((r as unknown[])[0] ?? '') : '')).join(''),
  );
}

/** Google：一次合并翻译（texts 用 \n 拼接为单 q）。 */
async function googleTranslateJoined(texts: string[], target: string): Promise<string[] | null> {
  const url = new URL(GT_ENDPOINT);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', target);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', texts.join('\n'));
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(GT_TIMEOUT_MS) });
    if (!res.ok) return null;
    const translated = extractGtSegments(await res.json());
    if (translated === null) return null;
    return translated.split('\n').map((l) => l.trim());
  } catch (err) {
    console.warn('[subtitle-translate] Google batch failed:', err instanceof Error ? err.message.slice(0, 160) : err);
    return null;
  }
}

/** Google：全量分块翻译（≤25 行/批）；任一批失败返回 null（交给 MyMemory 兜底）。 */
async function googleTranslateAll(cues: SubtitleCue[], target: string): Promise<string[] | null> {
  const results: string[] = [];
  for (let i = 0; i < cues.length; i += GT_CHUNK_LINES) {
    const chunk = cues.slice(i, i + GT_CHUNK_LINES);
    const tr = await googleTranslateJoined(chunk.map((c) => c.text), target);
    if (!tr || tr.length < chunk.length) return null;
    results.push(...tr.slice(0, chunk.length));
  }
  return results;
}

/** MyMemory：全量按字符分块翻译（≤450 字符/批 + 1.1s 节流）。 */
async function mymemoryTranslateAll(cues: SubtitleCue[], source: string, target: string): Promise<string[] | null> {
  const results: string[] = [];
  const texts = cues.map((c) => c.text);
  let i = 0;
  while (i < texts.length) {
    let chars = 0;
    let j = i;
    for (; j < texts.length; j++) {
      if (chars + texts[j].length + 1 > MM_MAX_CHARS) break;
      chars += texts[j].length + 1;
    }
    if (j <= i) j = i + 1; // 单条超长兜底（硬拆）
    const url = new URL(MM_ENDPOINT);
    url.searchParams.set('q', texts.slice(i, j).join('\n'));
    url.searchParams.set('langpair', `${source}|${target}`);
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(MM_TIMEOUT_MS) });
      if (!res.ok) return null;
      const data = await res.json();
      const t = (data as { responseData?: { translatedText?: unknown } })?.responseData?.translatedText;
      if (typeof t !== 'string') return null;
      const lines = t.split('\n').map((l) => l.trim());
      if (lines.length < j - i) return null;
      results.push(...lines.slice(0, j - i));
    } catch (err) {
      console.warn('[subtitle-translate] MyMemory batch failed:', err instanceof Error ? err.message.slice(0, 160) : err);
      return null;
    }
    i = j;
    if (i < texts.length) await sleep(MM_THROTTLE_MS);
  }
  return results;
}

/**
 * 把 cues 翻译成目标语言（时间轴不变，顺序一致）。
 * Google 优先；失败自动切 MyMemory；都失败 → 整体回落原文（不致命）。
 *
 * @param cues       已重定基到 clip 相对时间的字幕
 * @param targetCode 白名单语言代码（zh-CN / ja / …，由 normalizeSubtitleLang 保证）
 * @param sourceLang 实际拉到的字幕语言（如 'en'/'zh-Hans'，供 MyMemory langpair 用）
 */
export async function translateCues(
  cues: SubtitleCue[],
  targetCode: string,
  sourceLang?: string | null,
): Promise<SubtitleCue[]> {
  if (!cues || cues.length === 0) return cues;
  let translated = await googleTranslateAll(cues, targetCode);
  if (!translated) {
    console.warn('[subtitle-translate] Google unavailable, switching to MyMemory');
    translated = await mymemoryTranslateAll(cues, mmSourceCode(sourceLang), targetCode);
  }
  if (!translated || translated.length < cues.length) {
    console.warn(`[subtitle-translate] translation incomplete (${translated?.length ?? 0}/${cues.length}), fallback to original text`);
    return cues;
  }
  return cues.map((c, i) => ({ start: c.start, end: c.end, text: translated[i] || c.text }));
}
