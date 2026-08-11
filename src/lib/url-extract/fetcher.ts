/**
 * URL 内容抓取与解析工具
 *
 * 用于文章转视频、营销视频、资讯视频三个场景的 URL 一键转换。
 * 解析策略优先级：
 *   1. JSON-LD (schema.org Article / Product)
 *   2. Open Graph meta (og:title, og:description, og:image)
 *   3. Twitter Card meta
 *   4. <title> + <article>/<p> 文本聚合
 */

import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';

export interface FetchedPage {
  url: string;
  html: string;
  finalUrl: string;
}

export interface ArticleInfo {
  title: string;
  content: string;
  source: string;
  image?: string;
  description?: string;
}

export interface ProductInfo {
  name: string;
  price?: string;
  originalPrice?: string;
  currency?: string;
  image?: string;
  description?: string;
  brand?: string;
}

export interface NewsInfo {
  headline: string;
  source: string;
  content: string;
  dataPoints: Array<{ label: string; value: string }>;
  image?: string;
  publishedAt?: string;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': DEFAULT_UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
};

interface RawFetchResult {
  buffer: Buffer;
  finalUrl: string;
  contentType: string;
  statusCode: number;
}

/**
 * 用 Node.js 原生 https/http 模块抓取（绕过 undici fetch 的 TLS 指纹检测）。
 * 自动处理重定向（最多 5 次）和 gzip/deflate/br 压缩。
 */
function nativeGet(
  targetUrl: string,
  headers: Record<string, string>,
  timeoutMs: number,
  redirectCount = 0,
): Promise<RawFetchResult> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      reject(new Error(`Invalid URL: ${targetUrl}`));
      return;
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(
      targetUrl,
      {
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        // 处理重定向
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode ?? 0) &&
          res.headers.location &&
          redirectCount < 5
        ) {
          const nextUrl = new URL(res.headers.location, targetUrl).toString();
          res.resume(); // 释放当前响应
          resolve(nativeGet(nextUrl, headers, timeoutMs, redirectCount + 1));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const rawBuf = Buffer.concat(chunks);
          const encoding = (res.headers['content-encoding'] || '').toLowerCase();
          const finalUrl = res.headers.location || targetUrl;

          const finish = (buf: Buffer) => {
            resolve({
              buffer: buf,
              finalUrl,
              contentType: res.headers['content-type'] || '',
              statusCode: res.statusCode ?? 0,
            });
          };

          if (encoding.includes('br')) {
            zlib.brotliDecompress(rawBuf, (err, decoded) => {
              if (err) finish(rawBuf);
              else finish(decoded);
            });
          } else if (encoding.includes('gzip')) {
            zlib.gunzip(rawBuf, (err, decoded) => {
              if (err) finish(rawBuf);
              else finish(decoded);
            });
          } else if (encoding.includes('deflate')) {
            zlib.inflate(rawBuf, (err, decoded) => {
              if (err) finish(rawBuf);
              else finish(decoded);
            });
          } else {
            finish(rawBuf);
          }
        });
        res.on('error', reject);
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
    });
  });
}

/**
 * 抓取页面 HTML，处理重定向、压缩、编码、基本容错。
 * 使用 Node.js 原生 https 模块（绕过 undici fetch 的 TLS 指纹检测）。
 */
export async function fetchPage(url: string, timeoutMs = 20000): Promise<FetchedPage> {
  const result = await nativeGet(url, BROWSER_HEADERS, timeoutMs);

  if (result.statusCode >= 400) {
    throw new Error(`HTTP ${result.statusCode}`);
  }

  const contentType = result.contentType || '';
  // 部分服务器返回多个 Content-Type（如 "text/html;charset=utf-8, text/html"），
  // 这里宽松判断只要包含 html/xml 即可。
  if (
    contentType &&
    !contentType.includes('text/html') &&
    !contentType.includes('xml')
  ) {
    throw new Error(`Unsupported content-type: ${contentType}`);
  }

  // 检测编码并解码（TextDecoder 不支持的编码降级到 utf-8）
  const charset = extractCharset(contentType) || 'utf-8';
  let html: string;
  try {
    const decoder = new TextDecoder(charset as BufferEncoding);
    html = decoder.decode(result.buffer);
  } catch {
    // 编码不支持时降级到 utf-8
    const decoder = new TextDecoder('utf-8');
    html = decoder.decode(result.buffer);
  }

  return { url, html, finalUrl: result.finalUrl };
}

/**
 * 从 Content-Type 中提取 charset。
 * 用严格正则只匹配字母数字+连字符，避免吃进 ", text/html" 等噪声。
 * 仅返回 Node.js TextDecoder 支持的常见编码，未知则返回 null（外层降级 utf-8）。
 */
function extractCharset(contentType: string): string | null {
  const match = contentType.match(/charset\s*=\s*([a-zA-Z0-9_-]+)/i);
  if (!match) return null;
  const cs = match[1].trim().toLowerCase();
  // 已知支持的编码白名单
  const supported = ['utf-8', 'utf8', 'ascii', 'latin1', 'gbk', 'gb2312', 'gb18030', 'big5', 'shift_jis', 'euc-jp', 'euc-kr', 'windows-1252', 'iso-8859-1'];
  if (!supported.includes(cs)) return null;
  if (cs === 'utf8') return 'utf-8';
  if (cs === 'gb2312') return 'gbk';
  return cs;
}

/* ------------------------------------------------------------------ */
/* HTML 解析辅助                                                       */
/* ------------------------------------------------------------------ */

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;|&ndash;/g, '—');
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMetaContent(html: string, prop: string): string | null {
  // 支持 <meta property="og:title" content="..."> 和 <meta name="..." content="...">
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeHtmlEntities(m[1]);
  }
  return null;
}

function getTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!m) return null;
  return decodeHtmlEntities(m[1]).trim();
}

interface JsonLd {
  '@type'?: string | string[];
  [k: string]: unknown;
}

function extractJsonLd(html: string): JsonLd[] {
  const results: JsonLd[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const json = JSON.parse(m[1].trim());
      if (Array.isArray(json)) {
        results.push(...json);
      } else {
        results.push(json);
      }
    } catch {
      // 忽略 JSON 解析失败
    }
  }
  return results;
}

function findJsonLdByType(html: string, types: string[]): JsonLd | null {
  const all = extractJsonLd(html);
  for (const item of all) {
    const t = item['@type'];
    const typeArr = Array.isArray(t) ? t : [t];
    if (typeArr.some((x) => typeof x === 'string' && types.includes(x))) {
      return item;
    }
  }
  return null;
}

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* 文章解析                                                            */
/* ------------------------------------------------------------------ */

/**
 * 从指定起始位置提取一个完整的 <div> 块（解决嵌套 div 正则无法正确匹配的问题）。
 * 用 div 开闭标签计数法：遇到 `<div` 计数 +1，遇到 `</div>` 计数 -1，归零时停止。
 */
function extractDivBlock(html: string, startSearchFrom: number): string | null {
  // 从 startSearchFrom 往前找最近的 <div 开始标签
  const divOpenRe = /<div\b[^>]*>/gi;
  divOpenRe.lastIndex = startSearchFrom;
  const openMatch = divOpenRe.exec(html);
  if (!openMatch) return null;

  const blockStart = openMatch.index;
  const closeRe = /<\/?div\b/gi;
  closeRe.lastIndex = divOpenRe.lastIndex;

  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = closeRe.exec(html)) !== null) {
    if (m[0].startsWith('</')) {
      depth--;
      if (depth === 0) {
        return html.slice(blockStart, closeRe.lastIndex);
      }
    } else {
      depth++;
    }
  }
  return null;
}

function extractArticleBody(html: string): string {
  // 1. <article>...</article>
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  let raw = articleMatch?.[0] || '';

  // 2. 主流正文容器（按 id 或 class 定位，再用 div 平衡计数提取完整块）
  if (!raw) {
    // id 选择器（微信用 id="js_content"）
    const idCandidates = [
      'js_content', 'article-content', 'post-content', 'entry-content',
      'content-body', 'article-body', 'main-content', 'article',
    ];
    for (const id of idCandidates) {
      const re = new RegExp(`id=["']${id}["']`, 'i');
      const m = html.match(re);
      if (m && m.index !== undefined) {
        const block = extractDivBlock(html, m.index);
        if (block && block.length > 200) {
          raw = block;
          break;
        }
      }
    }

    // class 选择器（rich_media_content 是微信正文 class）
    if (!raw) {
      const classCandidates = [
        'rich_media_content', 'post-content', 'article-content', 'entry-content',
        'content-body', 'article-body', 'rich-text', 'markdown-body',
      ];
      for (const cls of classCandidates) {
        const re = new RegExp(
          `<div[^>]+class=["'][^"']*(?:${cls})[^"']*["'][^>]*>`,
          'i',
        );
        const m = html.match(re);
        if (m && m.index !== undefined) {
          const block = extractDivBlock(html, m.index);
          if (block && block.length > 200) {
            raw = block;
            break;
          }
        }
      }
    }

    // <main> 容器
    if (!raw) {
      const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
      if (mainMatch && mainMatch[0].length > 200) {
        raw = mainMatch[0];
      }
    }
  }

  // 3. 退化：抓取所有 <p>
  if (!raw) {
    const pMatches = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
    raw = pMatches.join(' ');
  }

  const text = stripTags(raw);
  return text.length > 200 ? text : stripTags(html).slice(0, 6000);
}

/**
 * 解析文章页面，输出标题、正文、来源、封面图。
 */
export function parseArticle(html: string, finalUrl: string): ArticleInfo {
  const jsonLd = findJsonLdByType(html, ['Article', 'NewsArticle', 'BlogPosting', 'TechArticle']);
  const ogTitle = getMetaContent(html, 'og:title');
  const ogDesc = getMetaContent(html, 'og:description');
  const ogImage = getMetaContent(html, 'og:image');
  const titleTag = getTitleTag(html);

  const title =
    asString(jsonLd?.headline) ||
    ogTitle ||
    asString(jsonLd?.name) ||
    titleTag ||
    'Untitled Article';

  let content = asString(jsonLd?.articleBody) || '';
  if (!content) {
    content = extractArticleBody(html);
  }
  if (ogDesc && content.length < 200) {
    content = `${ogDesc}\n\n${content}`;
  }

  const source = asString(jsonLd?.publisher && (jsonLd.publisher as { name?: string }).name) ||
    getMetaContent(html, 'og:site_name') ||
    new URL(finalUrl).hostname;

  return {
    title: title.trim(),
    content: content.trim().slice(0, 8000),
    source,
    image: ogImage || undefined,
    description: ogDesc || undefined,
  };
}

/* ------------------------------------------------------------------ */
/* 商品解析                                                            */
/* ------------------------------------------------------------------ */

function extractPrice(text: string | undefined): { price?: string; currency?: string } {
  if (!text) return {};
  const m = text.match(/(?:¥|￥|\$|€|£|₹)?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!m) return {};
  const currencyMatch = text.match(/(¥|￥|\$|€|£|₹|CNY|USD|EUR|GBP|INR)/i);
  return {
    price: m[1].replace(/,/g, ''),
    currency: currencyMatch?.[1],
  };
}

/**
 * 解析商品页面，输出商品名、价格、图片、描述、品牌。
 */
export function parseProduct(html: string, finalUrl: string): ProductInfo {
  const jsonLd = findJsonLdByType(html, ['Product']);
  const ogTitle = getMetaContent(html, 'og:title');
  const ogDesc = getMetaContent(html, 'og:description');
  const ogImage = getMetaContent(html, 'og:image');
  const titleTag = getTitleTag(html);

  const name =
    asString(jsonLd?.name) ||
    ogTitle ||
    titleTag ||
    'Unknown Product';

  const offers = jsonLd?.offers as
    | { price?: string; priceCurrency?: string; lowPrice?: string; highPrice?: string }
    | undefined;
  const priceRaw = offers?.price || offers?.lowPrice;
  const { price, currency } = extractPrice(priceRaw);

  const description =
    asString(jsonLd?.description) || ogDesc || extractProductDescription(html);

  const brand =
    asString(jsonLd?.brand && (jsonLd.brand as { name?: string }).name) ||
    getMetaContent(html, 'product:brand') ||
    undefined;

  const image = asString(jsonLd?.image) || ogImage || undefined;

  return {
    name: name.trim().slice(0, 200),
    price,
    currency,
    description: description?.trim().slice(0, 600),
    brand,
    image: Array.isArray(image) ? image[0] : image,
  };
}

function extractProductDescription(html: string): string | undefined {
  // 常见商品描述容器
  const candidates = [
    /<div[^>]+class=["'][^"']*(?:product-desc|product-detail|detail-content|item-desc|description)[^"']*["'][^>]*>[\s\S]*?<\/div>/i,
    /<div[^>]+id=["'](?:description|detail)[^"']*["'][^>]*>[\s\S]*?<\/div>/i,
  ];
  for (const re of candidates) {
    const m = html.match(re);
    if (m) {
      const text = stripTags(m[0]);
      if (text.length > 50) return text.slice(0, 600);
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* 资讯解析                                                            */
/* ------------------------------------------------------------------ */

const NUM_PATTERN =
  /(?:^|[\s,，])([A-Za-z0-9\u4e00-\u9fff]{2,15})\s*[:：是为]\s*(¥|￥|\$|€|£|₹)?\s*([\d,]+(?:\.\d+)?)\s*(%|亿|万|千亿|百万|千万|k|m|b| billion| million)?/g;

function extractDataPoints(text: string): Array<{ label: string; value: string }> {
  const points: Array<{ label: string; value: string }> = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  NUM_PATTERN.lastIndex = 0;

  while ((m = NUM_PATTERN.exec(text)) !== null && points.length < 8) {
    const label = m[1].trim();
    const valueNum = m[3];
    const unit = m[4] || '';
    const value = `${valueNum}${unit}`.trim();
    const key = `${label}|${value}`.toLowerCase();
    if (seen.has(key) || label.length < 2) continue;
    seen.add(key);
    points.push({ label, value });
  }
  return points;
}

/**
 * 解析资讯页面，输出标题、正文、来源、自动提取的数据点。
 */
export function parseNews(html: string, finalUrl: string): NewsInfo {
  const article = parseArticle(html, finalUrl);

  const jsonLd = findJsonLdByType(html, ['NewsArticle', 'Article']);
  const publishedAt =
    asString(jsonLd?.datePublished) || getMetaContent(html, 'article:published_time') || undefined;

  const dataPoints = extractDataPoints(article.content);

  return {
    headline: article.title,
    source: article.source,
    content: article.content,
    dataPoints,
    image: article.image,
    publishedAt,
  };
}
