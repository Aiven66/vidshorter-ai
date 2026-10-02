import type { MetadataRoute } from 'next';
import { buildBlogUrl } from '@/lib/blog-content';

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.clipopai.com').replace(/\/$/, '');

/** 增量刷新：新发布的博客文章无需重新部署即可进入 sitemap */
export const revalidate = 3600;

type RouteDef = { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] };

/** 公开可索引路由（与各路由 layout.tsx 中的 canonical 保持一致） */
const PUBLIC_ROUTES: RouteDef[] = [
  { path: '', priority: 1, changeFrequency: 'daily' },
  { path: '/video-clips', priority: 0.95, changeFrequency: 'daily' },
  { path: '/shorts', priority: 0.95, changeFrequency: 'daily' },
  { path: '/ai-video', priority: 0.9, changeFrequency: 'daily' },
  { path: '/digital-human-live', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/digital-human', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/video-notes', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/ai-tools', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/marketing-video', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/article-to-video', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/news-video', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/podcast', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/pricing', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/blog', priority: 0.85, changeFrequency: 'daily' },
  { path: '/download', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
];

/** 读取已发布博客（构建期/增量期各执行一次；失败时静默降级为静态路由） */
async function fetchPublishedPosts(): Promise<MetadataRoute.Sitemap> {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!base || !key) return [];

  try {
    const res = await fetch(
      `${base.replace(/\/$/, '')}/rest/v1/blogs?select=id,title,created_at,updated_at&is_published=eq.true&order=created_at.desc&limit=500`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return [];

    const rows = (await res.json()) as Array<{
      id?: string | number;
      title?: string;
      created_at?: string;
      updated_at?: string;
    }>;
    if (!Array.isArray(rows)) return [];

    const seen = new Set<string>();
    return rows
      .map((row) => {
        const id = String(row.id ?? '');
        const title = String(row.title ?? '');
        if (!id || !title) return null;
        const url = `${siteUrl}${buildBlogUrl({ id, title })}`;
        if (seen.has(url)) return null;
        seen.add(url);
        const lastModified = new Date(row.updated_at || row.created_at || Date.now());
        return {
          url,
          lastModified: Number.isNaN(lastModified.getTime()) ? new Date() : lastModified,
          changeFrequency: 'weekly' as const,
          priority: 0.65,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const postEntries = await fetchPublishedPosts();
  return [...staticEntries, ...postEntries];
}