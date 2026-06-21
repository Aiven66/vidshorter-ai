/**
 * 免费翻译工具模块
 * 使用 MyMemory Translation API (免费，无需 API Key)
 * 每天支持约 5000 字符的免费翻译（无 key），带 email 可提升额度
 *
 * 品牌关键词保护：Clipop AI 等品牌词不翻译
 * SEO 关键词策略：英文关键词在翻译后保留，确保多语言关键词密度
 */

import type { Locale } from '@/lib/i18n';

// 不需要翻译的品牌关键词和 SEO 关键词
const PROTECTED_KEYWORDS = [
  'Clipop AI',
  'Clipop',
  'AI',
  'API',
  'URL',
  'HTML',
  'CSS',
  'JavaScript',
  'TypeScript',
  'YouTube',
  'SEO',
  'SaaS',
  'B2B',
  'B2C',
  'UI',
  'UX',
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
  'SDK',
  'OAuth',
  'JWT',
  'REST',
  'HTTP',
  'HTTPS',
];

// 语言代码到 MyMemory 语言代码的映射
const LOCALE_TO_MYMEMORY: Record<Locale, string> = {
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

// 需要翻译的目标语言（排除英文源语言）
export const TRANSLATION_TARGET_LOCALES: Locale[] = [
  'zh', 'zh-Hant', 'ja', 'ko', 'de', 'fr', 'it', 'es', 'pt',
  'hi', 'ar', 'bn', 'id', 'ms', 'th', 'he', 'ru', 'ur', 'tr',
  'vi', 'fa', 'mr', 'ta', 'pl', 'te', 'ne', 'da', 'fi', 'nl', 'no', 'sv',
];

export interface TranslationResult {
  locale: Locale;
  title: string;
  category: string;
  content: string;
  success: boolean;
  error?: string;
}

export interface TranslationProgress {
  total: number;
  completed: number;
  current?: Locale;
  results: TranslationResult[];
}

/**
 * 保护品牌关键词：将关键词替换为占位符，翻译后再替换回来
 */
function protectKeywords(text: string): { text: string; placeholders: Map<string, string> } {
  const placeholders = new Map<string, string>();
  let result = text;

  PROTECTED_KEYWORDS.forEach((keyword, index) => {
    const placeholder = `__BRAND_${index}__`;
    // 使用全局替换，大小写敏感
    const regex = new RegExp(escapeRegExp(keyword), 'g');
    result = result.replace(regex, placeholder);
    placeholders.set(placeholder, keyword);
  });

  return { text: result, placeholders };
}

/**
 * 恢复品牌关键词
 */
function restoreKeywords(text: string, placeholders: Map<string, string>): string {
  let result = text;
  placeholders.forEach((keyword, placeholder) => {
    result = result.replaceAll(placeholder, keyword);
  });
  return result;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从 HTML 内容中提取纯文本和 HTML 标签结构
 * 返回分段内容，每段要么是 HTML 标签，要么是纯文本
 */
function splitHtmlContent(html: string): { type: 'tag' | 'text'; content: string }[] {
  const segments: { type: 'tag' | 'text'; content: string }[] = [];
  const regex = /(<[^>]+>)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      const text = html.slice(lastIndex, match.index);
      if (text.trim()) {
        segments.push({ type: 'text', content: text });
      }
    }
    segments.push({ type: 'tag', content: match[1] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < html.length) {
    const text = html.slice(lastIndex);
    if (text.trim()) {
      segments.push({ type: 'text', content: text });
    }
  }

  return segments;
}

/**
 * 将分段内容重新组合为 HTML
 */
function joinHtmlContent(segments: { type: 'tag' | 'text'; content: string }[]): string {
  return segments.map(s => s.content).join('');
}

/**
 * 调用 MyMemory API 翻译文本
 * 限制：每次请求最多 500 字符，免费版无需 key
 */
async function translateText(text: string, fromLang: string, toLang: string): Promise<string> {
  if (!text.trim()) return text;

  const { text: protectedText, placeholders } = protectKeywords(text);

  // MyMemory API 限制每次 500 字符，需要分段
  const MAX_CHUNK = 480;
  const chunks: string[] = [];

  if (protectedText.length <= MAX_CHUNK) {
    chunks.push(protectedText);
  } else {
    // 按句子分割
    const sentences = protectedText.split(/(?<=[.!?。！？])\s*/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + ' ' + sentence).length > MAX_CHUNK && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
  }

  const translatedChunks: string[] = [];

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;

    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${fromLang}|${toLang}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000), // 15秒超时
      });

      if (!response.ok) {
        translatedChunks.push(chunk); // 翻译失败保留原文
        continue;
      }

      const data = await response.json();

      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        let translated = data.responseData.translatedText;
        // MyMemory 有时会返回大写，修正
        if (translated === translated.toUpperCase() && translated.length > 20) {
          // 可能是 API 返回异常，保留原文
          translated = chunk;
        }
        translatedChunks.push(translated);
      } else {
        translatedChunks.push(chunk); // 翻译失败保留原文
      }
    } catch {
      translatedChunks.push(chunk); // 翻译失败保留原文
    }

    // 请求间隔，避免触发限流
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  const translated = translatedChunks.join(' ');
  return restoreKeywords(translated, placeholders);
}

/**
 * 翻译 HTML 内容（保留 HTML 标签，只翻译文本节点）
 */
async function translateHtmlContent(html: string, fromLang: string, toLang: string): Promise<string> {
  const segments = splitHtmlContent(html);
  const translatedSegments: { type: 'tag' | 'text'; content: string }[] = [];

  // 收集所有文本节点，批量翻译以提高效率
  const textIndices: number[] = [];
  const textContents: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (segments[i].type === 'text') {
      textIndices.push(i);
      textContents.push(segments[i].content);
    }
  }

  // 合并文本节点，一次性翻译（减少 API 调用）
  const combinedText = textContents.join('\n\n---SPLIT---\n\n');
  const translatedCombined = await translateText(combinedText, fromLang, toLang);
  const translatedParts = translatedCombined.split('\n\n---SPLIT---\n\n');

  // 重新组装
  let textIdx = 0;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].type === 'tag') {
      translatedSegments.push(segments[i]);
    } else {
      const translated = translatedParts[textIdx] || textContents[textIdx] || segments[i].content;
      translatedSegments.push({ type: 'text', content: translated });
      textIdx++;
    }
  }

  return joinHtmlContent(translatedSegments);
}

/**
 * 翻译单篇博客文章到指定语言
 */
export async function translateBlogPost(
  title: string,
  category: string,
  content: string,
  targetLocale: Locale,
  sourceLocale: Locale = 'en'
): Promise<TranslationResult> {
  const fromLang = LOCALE_TO_MYMEMORY[sourceLocale];
  const toLang = LOCALE_TO_MYMEMORY[targetLocale];

  if (!fromLang || !toLang) {
    return {
      locale: targetLocale,
      title,
      category,
      content,
      success: false,
      error: `Unsupported locale: ${targetLocale}`,
    };
  }

  try {
    const [translatedTitle, translatedCategory, translatedContent] = await Promise.all([
      translateText(title, fromLang, toLang),
      translateText(category, fromLang, toLang),
      translateHtmlContent(content, fromLang, toLang),
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
      title,
      category,
      content,
      success: false,
      error: err instanceof Error ? err.message : 'Translation failed',
    };
  }
}

/**
 * 批量翻译博客文章到所有目标语言
 * 返回异步生成器，支持进度追踪
 */
export async function* translateBlogPostToAllLocales(
  title: string,
  category: string,
  content: string,
  sourceLocale: Locale = 'en'
): AsyncGenerator<TranslationProgress> {
  const targetLocales = TRANSLATION_TARGET_LOCALES;
  const results: TranslationResult[] = [];

  yield { total: targetLocales.length, completed: 0, results };

  for (let i = 0; i < targetLocales.length; i++) {
    const locale = targetLocales[i];

    const result = await translateBlogPost(title, category, content, locale, sourceLocale);
    results.push(result);

    yield {
      total: targetLocales.length,
      completed: i + 1,
      current: locale,
      results,
    };
  }
}
