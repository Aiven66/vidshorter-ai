import { buildBlogUrl } from '@/lib/blog-content';

/**
 * RSS 2.0 feed。
 *
 * GEO 报告里 E2「生态集成」缺 RSS 订阅入口；这里直接从 Supabase 读取已发布博客，
 * 与 sitemap 使用同一数据源，失败时返回空 feed（不阻塞其他页面）。
 */
export const revalidate = 3600;

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.clipopai.com').replace(/\/$/, '');

type BlogRow = {
  id?: string | number;
  title?: string;
  category?: string;
  content?: string;
  created_at?: string;
  updated_at?: string;
};

/** 去掉 HTML 标签与多余空白，用于 RSS description。 */
function toPlainText(html: string, maxLength = 320): string {
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchPublishedPosts(): Promise<BlogRow[]> {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!base || !key) return [];

  try {
    const res = await fetch(
      `${base.replace(/\/$/, '')}/rest/v1/blogs?select=id,title,category,content,created_at,updated_at&is_published=eq.true&order=created_at.desc&limit=500`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? (rows as BlogRow[]) : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const rows = await fetchPublishedPosts();

  const items = rows
    .map((row) => {
      const id = String(row.id ?? '');
      const title = String(row.title ?? '').trim();
      if (!id || !title) return null;

      const url = `${siteUrl}${buildBlogUrl({ id, title })}`;
      const rawDate = row.updated_at || row.created_at;
      const date = rawDate ? new Date(rawDate) : new Date();
      const pubDate = Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
      const description = toPlainText(String(row.content ?? ''));
      const category = String(row.category ?? '').trim();

      return [
        '    <item>',
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <pubDate>${pubDate}</pubDate>`,
        category ? `      <category>${escapeXml(category)}</category>` : '',
        description ? `      <description>${escapeXml(description)}</description>` : '',
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .filter((item): item is string => item !== null);

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>Clipop AI Blog</title>',
    `    <link>${siteUrl}/blog</link>`,
    `    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />`,
    '    <description>Guides and tutorials on AI video clipping, long video to shorts workflows, TikTok growth and AI video tools.</description>',
    '    <language>en</language>',
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
