import { NextRequest, NextResponse } from 'next/server';
import { fetchPage, parseProduct, parseAmazonProduct, isAmazonUrl } from '@/lib/url-extract/fetcher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * locale → Accept-Language（抓取对应语言版本的电商页面，让卖点语言匹配用户 UI 语言）
 */
function localeToAcceptLanguage(locale: string | undefined): string | undefined {
  if (!locale) return undefined;
  const l = locale.trim();
  if (!l) return undefined;
  if (/^zh$/i.test(l)) return 'zh-CN,zh;q=0.9,en;q=0.8';
  if (/^zh-(tw|hk|hant)/i.test(l)) return 'zh-TW,zh;q=0.9,en;q=0.8';
  if (/^([a-z]{2,3})(-[A-Za-z]{2,4})?$/.test(l)) {
    return `${l},${l.split('-')[0]};q=0.9,en;q=0.8`;
  }
  return undefined;
}

/**
 * POST /api/extract-product
 * body: { url: string, locale?: string }
 *
 * 抓取商品页面并返回商品名、价格、图片、描述、品牌、卖点、评分。
 */
export async function POST(request: NextRequest) {
  let body: { url?: string; locale?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: 'url must start with http:// or https://' },
      { status: 400 },
    );
  }

  try {
    const acceptLanguage = localeToAcceptLanguage(body.locale);
    const page = await fetchPage(url, 20000, acceptLanguage ? { acceptLanguage } : undefined);
    // Amazon 页面无 JSON-LD / og meta，走专用 DOM 解析器
    const product = isAmazonUrl(url)
      ? parseAmazonProduct(page.html, page.finalUrl)
      : parseProduct(page.html, page.finalUrl);

    if (!product.name || product.name === 'Unknown Product') {
      return NextResponse.json(
        { error: 'Could not extract product information from this URL' },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, product });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown fetch error';
    console.error('[extract-product] failed for', url, message);
    return NextResponse.json(
      { error: `Failed to fetch product: ${message}` },
      { status: 502 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
