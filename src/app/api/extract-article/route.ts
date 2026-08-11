import { NextRequest, NextResponse } from 'next/server';
import { fetchPage, parseArticle } from '@/lib/url-extract/fetcher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/extract-article
 * body: { url: string }
 *
 * 抓取文章页面并返回标题、正文、来源、封面图。
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
    const article = parseArticle(page.html, page.finalUrl);

    if (!article.title || article.content.length < 50) {
      return NextResponse.json(
        { error: 'Could not extract meaningful article content from this URL' },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, article });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown fetch error';
    console.error('[extract-article] failed for', url, message);
    return NextResponse.json(
      { error: `Failed to fetch article: ${message}` },
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
