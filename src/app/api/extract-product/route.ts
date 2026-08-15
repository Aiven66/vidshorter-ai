import { NextRequest, NextResponse } from 'next/server';
import { fetchPage, parseProduct, parseAmazonProduct, isAmazonUrl } from '@/lib/url-extract/fetcher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/extract-product
 * body: { url: string }
 *
 * 抓取商品页面并返回商品名、价格、图片、描述、品牌。
 */
export async function POST(request: NextRequest) {
  let body: { url?: string };
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
    const page = await fetchPage(url);
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
