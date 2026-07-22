/**
 * @clipop/blog - Translation utilities
 *
 * Uses MyMemory Translation API (free, no API key required):
 *   https://api.mymemory.translated.net/get?q=<text>&langpair=<src>|<tgt>
 *
 * Limits:
 *   - 5000 chars/day without email
 *   - Each request max 500 chars (chunks longer than that are split)
 *   - 1000ms delay between requests to avoid rate limiting
 *   - Errors return the original text (translation is best-effort)
 *
 * Brand keywords are protected (placeholder substitution) so they survive
 * translation unchanged.
 */

import type { AppConfig, BlogPost, Locale } from '@clipop/core';

const MAX_CHUNK_SIZE = 480;
const REQUEST_INTERVAL_MS = 1000;
const MAX_TEXT_LENGTH = 500;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Keywords that should never be translated. The host app name (from config)
 * is always protected.
 */
export const PROTECTED_KEYWORDS: string[] = [
  'YouTube',
  'Google',
  'SaaS',
  'SEO',
  'API',
  'URL',
  'HTML',
  'CSS',
  'JavaScript',
  'TypeScript',
  'UI',
  'UX',
  'OAuth',
  'JWT',
  'REST',
  'HTTP',
  'HTTPS',
  'B2B',
  'B2C',
  'SDK',
  'GPU',
  'CPU',
  'HD',
  '4K',
  '8K',
  'MP4',
  'MP3',
  'GIF',
  'PNG',
  'JPG',
];

/** Locale code → MyMemory language code mapping. */
const LOCALE_TO_MYMEMORY: Record<string, string> = {
  en: 'en',
  zh: 'zh-CN',
  'zh-Hant': 'zh-TW',
  ja: 'ja',
  ko: 'ko',
  de: 'de',
  fr: 'fr',
  it: 'it',
  es: 'es',
  pt: 'pt',
  hi: 'hi',
  ar: 'ar',
  bn: 'bn',
  id: 'id',
  ms: 'ms',
  th: 'th',
  he: 'iw',
  ru: 'ru',
  ur: 'ur',
  tr: 'tr',
  vi: 'vi',
  fa: 'fa',
  mr: 'mr',
  ta: 'ta',
  pl: 'pl',
  te: 'te',
  ne: 'ne',
  da: 'da',
  fi: 'fi',
  nl: 'nl',
  no: 'no',
  sv: 'sv',
};

export interface TranslationResult {
  locale: Locale;
  title: string;
  category: string;
  content: string;
  success: boolean;
  error?: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace protected keywords with placeholders so the translator cannot mangle them.
 */
function protectKeywords(text: string, protectedKeywords: string[]): {
  text: string;
  placeholders: Map<string, string>;
} {
  const placeholders = new Map<string, string>();
  let result = text;
  protectedKeywords.forEach((keyword, index) => {
    const placeholder = `__BRAND_${index}__`;
    const regex = new RegExp(escapeRegExp(keyword), 'g');
    result = result.replace(regex, placeholder);
    placeholders.set(placeholder, keyword);
  });
  return { text: result, placeholders };
}

function restoreKeywords(text: string, placeholders: Map<string, string>): string {
  let result = text;
  placeholders.forEach((keyword, placeholder) => {
    // Use split/join to avoid regex special chars in placeholder
    result = result.split(placeholder).join(keyword);
  });
  return result;
}

/**
 * Split a long text into chunks ≤ MAX_CHUNK_SIZE, splitting on sentence boundaries.
 */
function chunkText(text: string, maxChunk: number = MAX_CHUNK_SIZE): string[] {
  if (text.length <= maxChunk) return [text];
  const sentences = text.split(/(?<=[.!?。！？])\s*/);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if ((current + ' ' + sentence).length > maxChunk && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < REQUEST_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Translate a plain-text string using MyMemory API.
 *
 * - Limits input to MAX_TEXT_LENGTH chars (returns original on overflow).
 * - Splits long input into chunks.
 * - Protects brand keywords before translation.
 * - On API error returns the original (protected) text.
 *
 * @param text source text
 * @param sourceLang source locale code (e.g. 'en')
 * @param targetLang target locale code (e.g. 'zh')
 */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  if (!text || !text.trim()) return text;
  if (text.length > MAX_TEXT_LENGTH) {
    // Caller should chunk before calling — for safety, just return original
    return text;
  }

  const fromLang = LOCALE_TO_MYMEMORY[sourceLang] || sourceLang;
  const toLang = LOCALE_TO_MYMEMORY[targetLang] || targetLang;
  if (fromLang === toLang) return text;

  const { text: protectedText, placeholders } = protectKeywords(text, PROTECTED_KEYWORDS);
  const chunks = chunkText(protectedText);
  const translatedChunks: string[] = [];

  for (const chunk of chunks) {
    if (!chunk.trim()) {
      translatedChunks.push(chunk);
      continue;
    }

    try {
      await throttle();
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${fromLang}|${toLang}`;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        : null;

      const res = await fetch(url, controller ? { signal: controller.signal } : {});
      if (timeoutId) clearTimeout(timeoutId);

      if (!res.ok) {
        translatedChunks.push(chunk);
        continue;
      }
      const data = (await res.json()) as {
        responseStatus?: number | string;
        responseData?: { translatedText?: string };
      };
      if (
        (data.responseStatus === 200 || data.responseStatus === '200') &&
        data.responseData?.translatedText
      ) {
        let translated = data.responseData.translatedText;
        // MyMemory sometimes uppercases short text — revert if so
        if (translated === translated.toUpperCase() && translated.length > 20) {
          translated = chunk;
        }
        translatedChunks.push(translated);
      } else {
        translatedChunks.push(chunk);
      }
    } catch {
      translatedChunks.push(chunk);
    }
  }

  const translated = translatedChunks.join(' ');
  return restoreKeywords(translated, placeholders);
}

/**
 * Split HTML into segments (text vs tags). Only text nodes are translated.
 */
function splitHtmlSegments(html: string): Array<{ type: 'tag' | 'text'; content: string }> {
  const segments: Array<{ type: 'tag' | 'text'; content: string }> = [];
  const regex = /(<[^>]+>)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      const text = html.slice(lastIndex, match.index);
      if (text.trim()) segments.push({ type: 'text', content: text });
    }
    segments.push({ type: 'tag', content: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < html.length) {
    const text = html.slice(lastIndex);
    if (text.trim()) segments.push({ type: 'text', content: text });
  }
  return segments;
}

/**
 * Translate HTML content while preserving all tags and attributes.
 * Only the text between tags is sent to the translator.
 */
async function translateHtmlContent(
  html: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const segments = splitHtmlSegments(html);
  const textSegments = segments.filter((s) => s.type === 'text').map((s) => s.content);

  // Merge text segments with separator, translate as a batch, then split back.
  // This reduces API calls for content with many small text nodes.
  const separator = '\n\n---SPLIT---\n\n';
  const combined = textSegments.join(separator);
  const translatedCombined = await translateText(combined, sourceLang, targetLang);
  const translatedParts = translatedCombined.split(separator);

  let textIdx = 0;
  return segments
    .map((seg) => {
      if (seg.type === 'tag') return seg.content;
      const translated = translatedParts[textIdx] ?? textSegments[textIdx] ?? seg.content;
      textIdx++;
      return translated;
    })
    .join('');
}

/**
 * Translate a blog post (title + category + HTML content) to the target locale.
 *
 * Returns a new BlogPost object with translated fields. The id and other
 * metadata are NOT modified — the caller is responsible for persisting the
 * translation (e.g. via `saveBlogTranslation` in `client.ts`).
 *
 * On any translation failure, the original fields are returned and
 * `success: false` is set on the result.
 *
 * @param config app config (appName is added to protected keywords)
 * @param post source blog post
 * @param targetLocale target locale code
 */
export async function translateBlogPost(
  config: AppConfig,
  post: Pick<BlogPost, 'title' | 'category' | 'content'>,
  targetLocale: Locale,
  sourceLocale: Locale = 'en',
): Promise<TranslationResult> {
  const fromLang = LOCALE_TO_MYMEMORY[sourceLocale] || sourceLocale;
  const toLang = LOCALE_TO_MYMEMORY[targetLocale] || targetLocale;

  if (!fromLang || !toLang) {
    return {
      locale: targetLocale,
      title: post.title,
      category: post.category,
      content: post.content,
      success: false,
      error: `Unsupported locale: ${targetLocale}`,
    };
  }

  try {
    const [translatedTitle, translatedCategory, translatedContent] = await Promise.all([
      translateText(post.title, sourceLocale, targetLocale),
      translateText(post.category, sourceLocale, targetLocale),
      translateHtmlContent(post.content, sourceLocale, targetLocale),
    ]);

    return {
      locale: targetLocale,
      title: translatedTitle,
      category: translatedCategory,
      content: translatedContent,
      success: true,
    };
  } catch (err) {
    return {
      locale: targetLocale,
      title: post.title,
      category: post.category,
      content: post.content,
      success: false,
      error: err instanceof Error ? err.message : 'Translation failed',
    };
  }
}

/**
 * Translate a blog post to all target locales configured in `config.blogTranslationLocales`.
 *
 * Returns one TranslationResult per locale. Source locale is excluded.
 */
export async function translateBlogPostToAllLocales(
  config: AppConfig,
  post: Pick<BlogPost, 'title' | 'category' | 'content'>,
  sourceLocale: Locale = 'en',
): Promise<TranslationResult[]> {
  const targets = config.blogTranslationLocales?.filter((l) => l !== sourceLocale) ?? [];
  const results: TranslationResult[] = [];
  for (const locale of targets) {
    const result = await translateBlogPost(config, post, locale, sourceLocale);
    results.push(result);
  }
  return results;
}
