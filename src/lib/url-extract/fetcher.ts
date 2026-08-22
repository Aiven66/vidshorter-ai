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

export interface ProductHighlight {
  title: string;
  detail: string;
}

export interface ProductInfo {
  name: string;
  price?: string;
  originalPrice?: string;
  currency?: string;
  /** 组合好的展示价格，如 "$21.99" / "¥134.21"（前端可直接使用） */
  priceDisplay?: string;
  /** 组合好的划线价展示，如 "$29.99" */
  originalPriceDisplay?: string;
  image?: string;
  /** 商品图集（JSON-LD image 数组，供数字人带货页面图集切换） */
  images?: string[];
  description?: string;
  brand?: string;
  /** 核心卖点（如 Amazon feature bullets），用于种草视频要点场景 */
  highlights?: ProductHighlight[];
  /** 评分，如 "3.8" 或 "4.5" */
  rating?: string;
  /** 评分数，如 "20,324" */
  reviewCount?: string;
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
export interface FetchPageOptions {
  /** 覆盖 Accept-Language（用于按用户 UI 语言抓取对应语言版本页面） */
  acceptLanguage?: string;
}

export async function fetchPage(
  url: string,
  timeoutMs = 20000,
  opts?: FetchPageOptions,
): Promise<FetchedPage> {
  const headers: Record<string, string> = { ...BROWSER_HEADERS };
  if (opts?.acceptLanguage) {
    headers['Accept-Language'] = opts.acceptLanguage;
  }
  const result = await nativeGet(url, headers, timeoutMs);

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
/* 价格通用工具（多平台、多币种、多格式）                              */
/* ------------------------------------------------------------------ */

/** ISO 货币代码 → 展示符号 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', CNY: '¥', EUR: '€', GBP: '£', JPY: '¥', KRW: '₩',
  INR: '₹', CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', HKD: 'HK$', SGD: 'S$',
  MXN: 'MX$', BRL: 'R$', RUB: '₽', TRY: '₺', SEK: 'kr', NOK: 'kr',
  DKK: 'kr', PLN: 'zł', THB: '฿', TWD: 'NT$', VND: '₫', IDR: 'Rp',
  PHP: '₱', MYR: 'RM', ILS: '₪', CHF: 'Fr ',
};

/** 符号型货币前缀 → ISO 代码 */
const SYMBOL_TO_ISO: Record<string, string> = {
  '$': 'USD', 'US$': 'USD', '€': 'EUR', '£': 'GBP',
  '¥': 'CNY', '￥': 'CNY', '₩': 'KRW', '₹': 'INR', '₽': 'RUB',
  '₺': 'TRY', '฿': 'THB', '₫': 'VND', '₱': 'PHP', 'R$': 'BRL',
  'CA$': 'CAD', 'CDN$': 'CAD', 'A$': 'AUD', 'AU$': 'AUD',
  'NZ$': 'NZD', 'HK$': 'HKD', 'S$': 'SGD', 'MX$': 'MXN', 'NT$': 'TWD',
};

/** 千分位/小数归一化：1,234.56 / 1.234,56 / 21,99 → 纯数字字符串 */
function normalizePriceNumber(num: string): string {
  const hasC = num.includes(',');
  const hasD = num.includes('.');
  if (hasC && hasD) {
    return num.lastIndexOf(',') > num.lastIndexOf('.')
      ? num.replace(/\./g, '').replace(',', '.') // 欧式 1.234,56
      : num.replace(/,/g, ''); // 美式 1,234.56
  }
  if (hasC) {
    return /,\d{1,2}$/.test(num) && (num.match(/,/g) || []).length === 1
      ? num.replace(',', '.') // 欧式小数 21,99
      : num.replace(/,/g, ''); // 千分位 1,234
  }
  if (hasD) {
    return /\.\d{3}$/.test(num) && (num.match(/\./g) || []).length > 1
      ? num.replace(/\./g, '') // 千分位 1.234.567
      : num; // 小数 134.21
  }
  return num;
}

/**
 * 宽松价格解析：支持 "$21.99"、"US$21.99"、"CNY 134.21"、"134,21 €"、"R$89,90" 等。
 * 返回纯数字价格 + ISO 货币代码。
 */
function parseLoosePrice(text: string | undefined): { price?: string; currency?: string } {
  if (!text) return {};
  const s = decodeHtmlEntities(text).replace(/<[^>]+>/g, '').trim();
  if (!s) return {};

  const currencyAlt = [...Object.keys(SYMBOL_TO_ISO).sort((a, b) => b.length - a.length).map((k) => k.replace(/\$/g, '\\$')),
    ...Object.keys(CURRENCY_SYMBOLS)].join('|');
  const m = s.match(
    new RegExp(`(${currencyAlt})?\\s*([\\d]+(?:[.,]\\d{1,3})*)\\s*(?:(${currencyAlt}))?`),
  );
  if (!m || !m[2]) return {};
  const price = normalizePriceNumber(m[2]);
  if (!price || price === '0') return {};
  const rawCurrency = (m[1] || m[3] || '').trim();
  const currency = SYMBOL_TO_ISO[rawCurrency] || rawCurrency.toUpperCase();
  return { price, currency: currency || undefined };
}

/** price + currency → 展示字符串，如 "$21.99" / "¥134.21" */
function toDisplayPrice(currency: string | undefined, price: string | undefined): string | undefined {
  if (!price) return undefined;
  if (!currency) return price;
  const sym = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency;
  const sep = sym.trim().length > 2 ? ' ' : ''; // 文字型货币代码后加空格
  return `${sym}${sep}${price}`;
}

/** 从长描述拆句生成卖点（中英兼容），用于无结构化 bullets 的平台 */
function splitDescriptionHighlights(desc: string | undefined): ProductHighlight[] {
  if (!desc) return [];
  const parts = desc
    .replace(/([.!?。！？])\s+/g, '$1\u0001')
    .split(/[\u0001;；•·\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15 && s.length <= 400);
  const seen = new Set<string>();
  const highlights: ProductHighlight[] = [];
  for (const p of parts) {
    const key = p.slice(0, 40).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const title = p.length <= 44 ? p : p.slice(0, 44).replace(/\s+\S*$/, '') + '…';
    highlights.push({ title, detail: p.slice(0, 220) });
    if (highlights.length >= 6) break;
  }
  return highlights;
}

function formatCount(v: string | number | undefined): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^\d]/g, ''), 10);
  if (Number.isNaN(n)) return undefined;
  return n.toLocaleString('en-US');
}

/**
 * 解析商品页面，输出商品名、价格、图片、描述、品牌。
 * 覆盖 Shopify / eBay / AliExpress / Walmart 等带 JSON-LD Product 的主流电商平台。
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
  const parsedPrice = parseLoosePrice(
    offers?.priceCurrency && priceRaw
      ? `${offers.priceCurrency} ${priceRaw}`
      : priceRaw,
  );
  const price = parsedPrice.price || (priceRaw ? normalizePriceNumber(priceRaw.replace(/[^\d.,]/g, '')) : undefined);
  const currency = parsedPrice.currency || offers?.priceCurrency;

  const description =
    asString(jsonLd?.description) || ogDesc || extractProductDescription(html);

  const brand =
    asString(jsonLd?.brand && (jsonLd.brand as { name?: string }).name) ||
    getMetaContent(html, 'product:brand') ||
    getMetaContent(html, 'og:brand') ||
    undefined;

  const image = asString(jsonLd?.image) || ogImage || undefined;

  // aggregateRating → 种草视频社交证明场景
  const agg = jsonLd?.aggregateRating as
    | { ratingValue?: string | number; reviewCount?: string | number; ratingCount?: string | number }
    | undefined;
  const rating = agg?.ratingValue !== undefined ? String(agg.ratingValue) : undefined;
  const reviewCount = formatCount(agg?.reviewCount ?? agg?.ratingCount);

  // 无结构化 bullets 时从描述拆句生成卖点，保证种草视频有内容
  const highlights = splitDescriptionHighlights(description);

  // 图集：JSON-LD image 数组（兼容字符串与 ImageObject，去重最多 6 张）
  const asImgUrl = (v: unknown): string | undefined => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      const o = v as { url?: unknown; contentUrl?: unknown };
      if (typeof o.url === 'string') return o.url;
      if (typeof o.contentUrl === 'string') return o.contentUrl;
    }
    return undefined;
  };
  const imageList: string[] = [];
  if (Array.isArray(jsonLd?.image)) {
    for (const img of jsonLd.image) {
      const u = asImgUrl(img);
      if (u && !imageList.includes(u)) imageList.push(u);
      if (imageList.length >= 6) break;
    }
  } else if (image) {
    imageList.push(image);
  }
  if (ogImage && !imageList.includes(ogImage)) imageList.push(ogImage);

  return {
    name: name.trim().slice(0, 200),
    price,
    currency,
    priceDisplay: toDisplayPrice(currency, price),
    description: description?.trim().slice(0, 600),
    brand,
    image: imageList[0] || undefined,
    images: imageList.length > 0 ? imageList : undefined,
    highlights: highlights.length > 0 ? highlights : undefined,
    rating,
    reviewCount,
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
/* Amazon 商品专用解析                                                 */
/* ------------------------------------------------------------------ */

/**
 * 检测是否为 Amazon 商品页 URL。
 */
export function isAmazonUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return /(^|\.)amazon\.[a-z.]{2,6}$|(^|\.)amzn\.to$|(^|\.)a\.co$/i.test(host);
  } catch {
    return false;
  }
}

/**
 * 解析 Amazon 价格文本，如 "CNY134.21"、"$19.99"、"US$21.99"、"134,21 €"。
 * （多格式宽松解析，兼容各站点/语言版本的页面）
 */
function parseAmazonPriceText(text: string | undefined): { price?: string; currency?: string } {
  return parseLoosePrice(text);
}

/**
 * 清洗 Amazon byline 品牌文本（中英文兼容）：
 *   "Visit the medicube Store" / "Brand: medicube" / "访问 medicube 品牌旗舰店" → "medicube"
 */
function cleanAmazonBrand(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let s = decodeHtmlEntities(raw).replace(/<[^>]+>/g, '').trim();
  s = s
    .replace(/^visit\s+the\s+/i, '')
    .replace(/\s+store$/i, '')
    .replace(/^brand:\s*/i, '')
    .replace(/^品牌[：:]\s*/, '')
    .replace(/^访问\s*/, '')
    .replace(/^浏览\s*/, '')
    .replace(/\s*品牌旗舰店$/, '')
    .replace(/\s*品牌商店$/, '')
    .replace(/\s*旗舰店$/, '')
    .trim();
  return s || undefined;
}

/**
 * 解析 Amazon feature bullets（`[TITLE] detail` 格式）为卖点列表。
 */
function parseAmazonHighlights(html: string): ProductHighlight[] {
  const section = html.match(/id=["']feature-bullets["']([\s\S]{0,8000})/i);
  if (!section) return [];

  const liMatches = [...section[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  const highlights: ProductHighlight[] = [];

  for (const m of liMatches) {
    const text = decodeHtmlEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (text.length < 10) continue;

    // Amazon 卖点格式：[ALL-IN-ONE VOLUME & GLOW BALM] Bring back the look of...
    const bracket = text.match(/^\[([^\]]{3,60})\]\s*([\s\S]+)$/);
    if (bracket) {
      highlights.push({ title: bracket[1].trim(), detail: bracket[2].trim().slice(0, 220) });
      continue;
    }

    // 无方括号前缀：前 6 个词作标题，整句作详情
    const words = text.split(/\s+/);
    const title = words.slice(0, 6).join(' ');
    highlights.push({ title: title.slice(0, 60), detail: text.slice(0, 220) });
    if (highlights.length >= 6) break;
  }

  return highlights.slice(0, 6);
}

/**
 * 判断 a-offscreen 价格候选是否有效主价候选。
 * 排除划线价前缀（List:/Typical:/Was:/Save:）、占位符（$00/null）等噪声。
 */
function isValidAmazonPriceText(s: string): boolean {
  if (!s || !/\d/.test(s)) return false;
  if (/^(list|typical|was|save|清单|典型|原价|建议价)\s*[:：]/i.test(s)) return false;
  if (/^\s*(?:null|undefined)\s*$/i.test(s)) return false;
  return true;
}

/** 提取 html 中所有 a-offscreen 文本（Amazon 无障碍价格文本） */
function extractAmazonOffscreenPrices(html: string): string[] {
  return [...html.matchAll(/class=["'][^"']*a-offscreen[^"']*["'][^>]*>([^<]{1,60})</gi)]
    .map((m) => decodeHtmlEntities(m[1]).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Amazon 主价提取（多级降级，兼容不同站点/语言/页面版本的 DOM 差异）：
 *   1. 核心价格容器（corePriceDisplay / corePrice / apexPriceToPay / apex_desktop）内的 a-offscreen
 *   2. class="a-price" 精确匹配元素内的 a-offscreen（买框主价标准结构）
 *   3. symbol + whole + fraction 组合（无 a-offscreen 的新版页面）
 *   4. 全局首个有效 a-offscreen
 * 返回容器位置 idx（供划线价在主价附近提取，避免误取推荐位价格）。
 */
function extractAmazonMainPrice(html: string): {
  price?: string;
  currency?: string;
  containerIdx?: number;
} {
  // 1) 核心价格容器内查找
  const containerIds = [
    'corePriceDisplay_desktop_feature_div', 'corePriceDisplay',
    'corePrice_feature_div', 'corePrice', 'apexPriceToPay', 'apex_desktop',
  ];
  for (const id of containerIds) {
    const idx = html.indexOf(`id="${id}"`);
    if (idx === -1) continue;
    const segment = html.slice(idx, idx + 2500);
    const candidates = extractAmazonOffscreenPrices(segment).filter(isValidAmazonPriceText);
    if (candidates.length > 0) {
      const parsed = parseAmazonPriceText(candidates[0]);
      if (parsed.price) return { ...parsed, containerIdx: idx };
    }
  }

  // 2) class="a-price ..." 精确元素内的 a-offscreen
  const priceElMatches = [...html.matchAll(
    /class=["']a-price(?:\s[^"']*)?["'][^>]*>\s*<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>([^<]{1,60})</gi,
  )].map((m) => decodeHtmlEntities(m[1]).trim()).filter(isValidAmazonPriceText);
  for (const cand of priceElMatches) {
    const parsed = parseAmazonPriceText(cand);
    if (parsed.price) return parsed;
  }

  // 3) symbol + whole + fraction 组合（新版 DOM 无 a-offscreen 时）
  const combo = html.match(
    /class=["'][^"']*a-price-symbol[^"']*["'][^>]*>([^<]{1,8})<\/span>[\s\S]{0,200}?class=["'][^"']*a-price-whole[^"']*["'][^>]*>([\d,]+)(?:[\s\S]{0,120}?class=["'][^"']*a-price-fraction[^"']*["'][^>]*>(\d{1,2}))?/i,
  );
  if (combo) {
    const currency = SYMBOL_TO_ISO[combo[1].trim()] || combo[1].trim().toUpperCase();
    const price = combo[3]
      ? `${normalizePriceNumber(combo[2])}.${combo[3]}`
      : normalizePriceNumber(combo[2]);
    if (price && price !== '0') return { price, currency };
  }

  // 4) 全局首个有效 a-offscreen
  const all = extractAmazonOffscreenPrices(html).filter(isValidAmazonPriceText);
  for (const cand of all) {
    const parsed = parseAmazonPriceText(cand);
    if (parsed.price) return parsed;
  }

  return {};
}

/**
 * Amazon 划线价（原价）提取：
 *   1. 主价容器窗口内的 "List:" / "Typical:" 前缀 a-offscreen（避免误取推荐位价格）
 *   2. data-a-strike="true" 内的 a-offscreen
 */
function extractAmazonOriginalPrice(
  html: string,
  mainPrice?: string,
  containerIdx?: number,
): string | undefined {
  // 1) 主价容器窗口内的 List:/Typical: 参考价
  if (containerIdx !== undefined) {
    const segment = html.slice(containerIdx, containerIdx + 2500);
    const refPrice = extractAmazonOffscreenPrices(segment)
      .find((p) => /^(list|typical|was)\s*[:：]/i.test(p));
    if (refPrice) {
      const parsed = parseAmazonPriceText(refPrice.replace(/^(list|typical|was)\s*[:：]\s*/i, ''));
      if (parsed.price && parsed.price !== mainPrice) return parsed.price;
    }
  }
  // 2) data-a-strike 划线价
  const strikeBlock = html.match(/data-a-strike=["']true["'][^>]*>[\s\S]{0,400}?class=["'][^"']*a-offscreen[^"']*["'][^>]*>([^<]{1,60})</i);
  if (strikeBlock) {
    const parsed = parseAmazonPriceText(strikeBlock[1]);
    if (parsed.price && parsed.price !== mainPrice) return parsed.price;
  }
  return undefined;
}

/**
 * Amazon 商品页专用解析器。
 *
 * Amazon 页面没有 JSON-LD Product 和 og: meta（服务端渲染版本），
 * 需要从页面固定 DOM 结构提取：
 *   - 名称: #productTitle
 *   - 价格: 多级降级提取（见 extractAmazonMainPrice）
 *   - 原价: data-a-strike / List: / Typical: 前缀
 *   - 图片: #landingImage 的 data-old-hires / data-a-dynamic-image
 *   - 卖点: #feature-bullets 下的 <li>
 *   - 品牌: #bylineInfo
 *   - 评分: "X.X out of 5 stars"
 *   - 评分数: "N,NNN ratings"（取最大值，即 global ratings）
 */
export function parseAmazonProduct(html: string, finalUrl: string): ProductInfo {
  // ---- 名称 ----
  const titleMatch = html.match(/id=["']productTitle["'][^>]*>([^<]+)</i);
  let name = titleMatch
    ? decodeHtmlEntities(titleMatch[1]).trim()
    : (getTitleTag(html) || '').replace(/^Amazon\.[a-z.]+:\s*/i, '').split(/\s*[|–-]\s*Amazon\.com/i)[0].trim();

  // ---- 价格（多级降级，兼容 US$/CNY/€ 等各站点格式）----
  const mainPriceInfo = extractAmazonMainPrice(html);
  const { price, currency } = mainPriceInfo;

  // ---- 原价（划线价）----
  const originalPrice = extractAmazonOriginalPrice(html, price, mainPriceInfo.containerIdx);

  // ---- 高清主图 ----
  let image: string | undefined;
  const oldHires = html.match(/data-old-hires=["']([^"']+)["']/i);
  if (oldHires) {
    image = decodeHtmlEntities(oldHires[1]);
  } else {
    const dyn = html.match(/id=["']landingImage["'][^>]*data-a-dynamic-image=["']([^"']+)["']/i);
    if (dyn) {
      const decoded = decodeHtmlEntities(dyn[1]);
      const firstUrl = decoded.match(/(https?:[^",]+)/i);
      if (firstUrl) image = firstUrl[1].trim();
    }
    if (!image) {
      const src = html.match(/id=["']landingImage["'][^>]*src=["']([^"']+)["']/i);
      if (src) image = decodeHtmlEntities(src[1]);
    }
  }

  // ---- 卖点 ----
  const highlights = parseAmazonHighlights(html);

  // ---- 描述：优先用卖点拼接，其次 meta description ----
  const metaDesc = getMetaContent(html, 'description');
  const description = highlights.length > 0
    ? highlights.map((h) => h.title).join(' · ')
    : (metaDesc || extractProductDescription(html) || '');

  // ---- 品牌 ----
  const byline = html.match(/id=["']bylineInfo["'][^>]*>([\s\S]{0,200}?)<\/(?:a|span)>/i);
  const brand = cleanAmazonBrand(byline?.[1]);

  // ---- 评分 & 评分数（中英文格式兼容，覆盖多种 Amazon 页面版本）----
  // 主评分优先（acrPopover / reviewCountTextLinkedHistogram / aria-label），
  // 再退到第一个通用评分文本；评论直方图评分（3.8 类）作为最后兜底。
  const ratingPatterns: RegExp[] = [
    // 中文: title="4.6 颗星，最多 5 颗星" / aria-label 同格式
    /(?:acrPopover|acrCustomerReviewText|Histogram)[^>]*title=["']([\d.]+)\s*颗星/i,
    /aria-label=["']([\d.]+)\s*颗星，最多\s*5\s*颗星，?/i,
    /([\d.]+)\s*颗星，最多\s*5\s*颗星/,
    // 英文: "4.6 out of 5 stars" / title="4.6 out of 5 stars"
    /(?:acrPopover|acrCustomerReviewText|Histogram)[^>]*title=["']([\d.]+)\s+out/i,
    /([\d.]+)\s+out\s+of\s+5\s+stars/i,
    /aria-label=["']([\d.]+)\s+out\s+of\s+5\s+stars/i,
    /([\d.]+)\s+out\s+of\s+5/i,
  ];
  let rating: string | undefined;
  for (const re of ratingPatterns) {
    const m = html.match(re);
    if (m) { rating = m[1]; break; }
  }

  // 评分数：优先 acrCustomerReviewText aria-label（商品标题旁的标准评论数），
  // 再试 aria-label 完整格式，最后取各格式最大值（global ratings）。
  // 中文: "1,829 评论" / "4.6 颗星，最多 5 颗星，20,324 个评级"
  // 英文: "1,829 ratings" / "20,324 global ratings"
  let reviewCount: string | undefined;
  const reviewTextCount = html.match(
    /id=["']acrCustomerReviewText["'][^>]*aria-label=["']([\d,]+)\s*(?:评论|ratings|reviews)/i,
  );
  const ariaCount = html.match(
    /aria-label=["'][\d.]+\s*(?:颗星，最多\s*5\s*颗星|out of 5 stars)[，,]?\s*([\d,]+)\s*(?:个评级|ratings)/i,
  );
  if (reviewTextCount) {
    reviewCount = reviewTextCount[1];
  } else if (ariaCount) {
    reviewCount = ariaCount[1];
  } else {
    let maxCount = 0;
    const ratingCountPatterns = [
      /([\d,]+)\s*个评级/g,
      /([\d,]+)\s+global\s+ratings/gi,
      /([\d,]+)\s+ratings/gi,
      /([\d,]+)\s*个评分/g,
    ];
    for (const pattern of ratingCountPatterns) {
      for (const m of html.matchAll(pattern)) {
        const n = parseInt(m[1].replace(/,/g, ''), 10);
        if (n > maxCount) { maxCount = n; reviewCount = m[1]; }
      }
    }
  }

  // 品牌兜底：从商品名第一词提取（如 "medicube PDRN..." → "medicube"）
  const finalBrand = brand || name.split(/\s+/)[0]?.replace(/[^A-Za-z0-9&-]/g, '') || undefined;

  return {
    name: (name || 'Amazon Product').trim().slice(0, 200),
    price,
    originalPrice,
    currency,
    priceDisplay: toDisplayPrice(currency, price),
    originalPriceDisplay: toDisplayPrice(currency, originalPrice),
    image,
    description: description?.trim().slice(0, 600),
    brand: finalBrand,
    highlights: highlights.length > 0 ? highlights : undefined,
    rating,
    reviewCount,
  };
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
