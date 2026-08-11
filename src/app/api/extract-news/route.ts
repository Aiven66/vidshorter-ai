import { NextRequest, NextResponse } from 'next/server';
import { fetchPage, parseNews } from '@/lib/url-extract/fetcher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/extract-news
 * body: { url: string }
 *
 * 抓取资讯页面并返回标题、正文、来源、自动提取的数据点。
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
    const news = parseNews(page.html, page.finalUrl);

    if (!news.headline || news.content.length < 50) {
      return NextResponse.json(
        { error: 'Could not extract news content from this URL' },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, news });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown fetch error';
    console.error('[extract-news] failed for', url, message);
    return NextResponse.json(
      { error: `Failed to fetch news: ${message}` },
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
