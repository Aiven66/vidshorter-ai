import type { Metadata } from 'next';
import { cache } from 'react';
import { SITE_URL, DEFAULT_OG_IMAGE } from '@/lib/seo';
import { slugifyTitle, isUuid, extractShortIdFromSlug, stripHtml } from '@/lib/blog-content';

/** 与 lib/blog-content 的 buildBlogUrl 保持一致的 slug 解析 */
function parseSlugParam(raw: string) {
  const clean = raw.replace(/\.html?$/i, '');
  const shortId = extractShortIdFromSlug(raw);
  const slugWithoutId = clean.replace(/-([0-9a-f]{8})$/i, '');
  return { clean, shortId, slugWithoutId };
}

type PostMeta = {
  id: string;
  title: string;
  description: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  url: string;
};

/**
 * 后台发布的文章正文里带有站点导航/作者栏，直接截取会产生垃圾描述。
 * 这里用「min read / 面包屑」等稳定分隔符定位正文起点，失败时优雅回退。
 */
function buildDescription(title: string, rawContent: string): string {
  const text = stripHtml(rawContent || '');
  let body = text;

  const markers = ['min read', 'minute read'];
  let cut = -1;
  for (const m of markers) cut = Math.max(cut, text.lastIndexOf(m));
  if (cut >= 0) {
    body = text.slice(cut + markers[0].length);
  } else {
    const slash = text.lastIndexOf(' / ');
    if (slash >= 0) body = text.slice(slash + 3);
  }

  body = body.replace(/^[\s·|/–—-]+/, '').trim();
  const out = body.slice(0, 155).trim();
  return out || `${title} - read the full guide on the Clipop AI blog.`;
}

/**
 * 在服务端读取博客元数据，用于 SSR 的 <title>/description/OG 与 BlogPosting 结构化数据。
 * 失败时静默返回 null，页面行为保持不变（不影响任何客户端功能）。
 */
const fetchPostMeta = cache(async (rawId: string): Promise<PostMeta | null> => {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!base || !key || !rawId) return null;

  try {
    // 注意：生产 blogs 表没有 summary 列，指定不存在的列会让 PostgREST 返回 400，
    // 因此这里只 select 实际存在的列，摘要由正文 HTML 剥离生成。
    const res = await fetch(
      `${base}/rest/v1/blogs?select=id,title,content,cover_image,created_at,updated_at&is_published=eq.true&order=created_at.desc&limit=100`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const { shortId, slugWithoutId } = parseSlugParam(rawId);
    const shortIdLower = shortId ? shortId.toLowerCase() : null;
    const row =
      (isUuid(rawId) ? rows.find((r) => String(r.id) === rawId) : undefined) ||
      (shortIdLower
        ? rows.find(
            (r) => String(r.id || '').replace(/-/g, '').slice(0, 8).toLowerCase() === shortIdLower,
          )
        : undefined) ||
      rows.find((r) => slugifyTitle(String(r.title || '')) === slugWithoutId);

    if (!row) return null;

    const title = String(row.title || 'Blog');
    const description = buildDescription(title, String(row.content || ''));
    const cover = row.cover_image ? String(row.cover_image) : undefined;
    const url = `${SITE_URL}/blog/${rawId}`;

    return {
      id: String(row.id),
      title,
      description: description || `Read "${title}" on the Clipop AI blog.`,
      image: cover && /^https?:\/\//.test(cover) ? cover : undefined,
      datePublished: row.created_at ? String(row.created_at) : undefined,
      dateModified: row.updated_at ? String(row.updated_at) : undefined,
      url,
    };
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = await fetchPostMeta(id);

  if (!meta) {
    // 读取失败或文章不存在时保持可索引，避免因数据源临时抖动导致真实文章被误判为 noindex
    return {
      title: 'Blog',
      description: 'Guides and tutorials on AI video clipping from the Clipop AI team.',
      alternates: { canonical: `/blog/${id}` },
    };
  }

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: `/blog/${id}` },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: meta.url,
      siteName: 'Clipop AI',
      type: 'article',
      ...(meta.image
        ? { images: [{ url: meta.image, alt: meta.title }] }
        : { images: [DEFAULT_OG_IMAGE] }),
      ...(meta.datePublished ? { publishedTime: meta.datePublished } : {}),
      ...(meta.dateModified ? { modifiedTime: meta.dateModified } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.description,
      images: [meta.image || DEFAULT_OG_IMAGE.url],
    },
  };
}

export default async function BlogPostLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meta = await fetchPostMeta(id);

  const jsonLd = meta
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BlogPosting',
            headline: meta.title,
            description: meta.description,
            ...(meta.image ? { image: [meta.image] } : {}),
            ...(meta.datePublished ? { datePublished: meta.datePublished } : {}),
            ...(meta.dateModified ? { dateModified: meta.dateModified } : {}),
            mainEntityOfPage: { '@type': 'WebPage', '@id': meta.url },
            author: { '@type': 'Organization', name: 'Clipop AI', url: SITE_URL },
            publisher: {
              '@type': 'Organization',
              name: 'Clipop AI',
              logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon.svg` },
            },
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
              { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
              { '@type': 'ListItem', position: 3, name: meta.title, item: meta.url },
            ],
          },
        ],
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      {children}
    </>
  );
}