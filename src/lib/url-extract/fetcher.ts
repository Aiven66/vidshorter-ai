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

/**
 * 抓取页面 HTML，处理重定向、编码、基本容错。
 */
export async function fetchPage(url: string, timeoutMs = 15000): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('xml')) {
      throw new Error(`Unsupported content-type: ${contentType}`);
    }

    // 检测编码并解码
    const buffer = await resp.arrayBuffer();
    const charset = extractCharset(contentType) || 'utf-8';
    const decoder = new TextDecoder(charset as BufferEncoding);
    const html = decoder.decode(buffer);

    return { url, html, finalUrl: resp.url || url };
  } finally {
    clearTimeout(timer);
  }
}

function extractCharset(contentType: string): string | null {
  const match = contentType.match(/charset=([^;]+)/i);
  if (!match) return null;
  const cs = match[1].trim().toLowerCase();
  if (cs === 'gb2312' || cs === 'gbk') return 'gbk';
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

function extractArticleBody(html: string): string {
  // 1. <article>...</article>
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  let raw = articleMatch?.[0] || '';

  // 2. 常见正文容器
  if (!raw) {
    const candidates = [
      /<main[\s\S]*?<\/main>/i,
      /<div[^>]+class=["'][^"']*(?:post-content|article-content|entry-content|content-body|article-body|rich-text)[^"']*["'][^>]*>[\s\S]*?<\/div>/i,
    ];
    for (const re of candidates) {
      const m = html.match(re);
      if (m) {
        raw = m[0];
        break;
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
