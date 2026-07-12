'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/locale-context';
import {
  BlogPost,
  getBuiltInBlogPosts,
  getBuiltInBlogPost,
  getStoredBlogPosts,
  getDefaultCoverImage,
  normalizeBlogRow,
  normalizeLocale,
  stripHtml,
  slugifyTitle,
  isUuid,
  buildBlogUrl,
} from '@/lib/blog-content';
import { detectLanguage } from '@/lib/lang-detect';
import { Calendar, ArrowLeft, ArrowRight, ChevronRight, Home, FileText } from 'lucide-react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

export default function BlogDetailPage() {
  const { t, locale } = useLocale();
  const activeLocale = normalizeLocale(locale);
  const params = useParams();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const rawParam = String(params.id || '');

  useEffect(() => {
    let cancelled = false;

    async function fetchPost() {
      setLoading(true);

      if (!isSupabaseConfigured()) {
        if (!cancelled) {
          setPost(null);
          setRelatedPosts([]);
          setLoading(false);
        }
        return;
      }

      try {
        const { getSupabaseClient } = await import('@/storage/database/supabase-client');
        const client = getSupabaseClient();

        let targetRow: any = null;

        // Detect if param is UUID (old URL) or slug (new SEO URL)
        if (isUuid(rawParam)) {
          // UUID: direct lookup
          const { data, error } = await client
            .from('blogs')
            .select('*')
            .eq('id', rawParam)
            .maybeSingle();
          if (error) throw error;
          targetRow = data;
        } else {
          // Slug: strip .html suffix, fetch all posts and match by slugified title
          const slug = rawParam.replace(/\.html?$/i, '');
          const { data: allPosts, error: allError } = await client
            .from('blogs')
            .select('id,title,category,cover_image,created_at,locale,parent_id,is_published,view_count,content,summary')
            .eq('is_published', true)
            .order('created_at', { ascending: false })
            .limit(60);

          if (allError) throw allError;

          if (allPosts && allPosts.length > 0) {
            // Group by parent_id, pick best version per group, then match slug
            const groups = new Map<string, any[]>();
            for (const row of allPosts) {
              const pid = String(row.parent_id || row.id);
              if (!groups.has(pid)) groups.set(pid, []);
              groups.get(pid)!.push(row);
            }

            for (const [, group] of groups) {
              let selected = group.find(r => r.locale === activeLocale);
              if (!selected) selected = group.find(r => r.locale === 'en' || !r.locale);
              if (!selected) selected = group[0];
              if (slugifyTitle(selected.title || '') === slug) {
                targetRow = selected;
                break;
              }
            }
          }
        }

        let databasePost: BlogPost | null = null;

        if (targetRow) {
          const parentId = String(targetRow.parent_id || targetRow.id);

          // Query all versions of this article (root + translations)
          const { data: versions, error: versionsError } = await client
            .from('blogs')
            .select('*')
            .eq('parent_id', parentId)
            .neq('id', parentId)
            .or(`id.eq.${parentId}`);

          if (!versionsError && versions && versions.length > 0) {
            let selected = versions.find(r => r.locale === activeLocale && r.is_published);
            if (!selected) selected = versions.find(r => (r.locale === 'en' || !r.locale) && r.is_published);
            if (!selected) selected = targetRow;
            databasePost = normalizeBlogRow(selected);

            // Increment view count
            try {
              await client
                .from('blogs')
                .update({ view_count: (selected.view_count || 0) + 1 })
                .eq('id', selected.id);
            } catch {}
          } else {
            databasePost = normalizeBlogRow(targetRow);
            try {
              await client
                .from('blogs')
                .update({ view_count: (targetRow.view_count || 0) + 1 })
                .eq('id', targetRow.id);
            } catch {}
          }
        }

        if (!cancelled) {
          setPost(databasePost);
        }

        // ── Related posts: always ensure at least 4 ──────────────────────────
        const seenRelated = new Set<string>();
        const rPosts: BlogPost[] = [];

        if (databasePost) {
          // 1. Same category posts from database
          try {
            const { data: relatedData } = await client
              .from('blogs')
              .select('id,title,category,cover_image,created_at,locale,parent_id,is_published,view_count,content,summary')
              .eq('is_published', true)
              .neq('id', databasePost.id)
              .eq('category', databasePost.category)
              .order('created_at', { ascending: false })
              .limit(50);

            const groups = new Map<string, any[]>();
            for (const row of (relatedData || [])) {
              const pid = String(row.parent_id || row.id);
              if (!groups.has(pid)) groups.set(pid, []);
              groups.get(pid)!.push(row);
            }

            for (const [, group] of groups) {
              let selected = group.find(r => r.locale === activeLocale);
              if (!selected) selected = group.find(r => r.locale === 'en' || !r.locale);
              if (!selected) selected = group[0];
              const p = normalizeBlogRow(selected);
              const key = String(selected.parent_id || selected.id);
              if (!seenRelated.has(key)) {
                seenRelated.add(key);
                rPosts.push(p);
              }
            }
          } catch {}

          // 2. If not enough, fill with other categories
          if (rPosts.length < 4) {
            try {
              const { data: otherData } = await client
                .from('blogs')
                .select('id,title,category,cover_image,created_at,locale,parent_id,is_published,view_count,content,summary')
                .eq('is_published', true)
                .neq('id', databasePost.id)
                .neq('category', databasePost.category)
                .order('created_at', { ascending: false })
                .limit(50);

              const groups = new Map<string, any[]>();
              for (const row of (otherData || [])) {
                const pid = String(row.parent_id || row.id);
                if (!groups.has(pid)) groups.set(pid, []);
                groups.get(pid)!.push(row);
              }

              for (const [, group] of groups) {
                if (rPosts.length >= 6) break;
                let selected = group.find(r => r.locale === activeLocale);
                if (!selected) selected = group.find(r => r.locale === 'en' || !r.locale);
                if (!selected) selected = group[0];
                const p = normalizeBlogRow(selected);
                const key = String(selected.parent_id || selected.id);
                if (!seenRelated.has(key)) {
                  seenRelated.add(key);
                  rPosts.push(p);
                }
              }
            } catch {}
          }
        }

        if (!cancelled) {
          setRelatedPosts(rPosts.slice(0, 6));
        }
      } catch {
        if (!cancelled) {
          setPost(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPost();

    return () => {
      cancelled = true;
    };
  }, [activeLocale, rawParam]);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const dateLocale = activeLocale === 'zh' ? 'zh-CN' : activeLocale === 'zh-Hant' ? 'zh-TW' : activeLocale === 'en' ? 'en-US' : activeLocale;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(dateLocale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // ── Skeleton loading (same style as blog list page) ──────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto">
            {/* Breadcrumb skeleton */}
            <div className="h-4 w-64 bg-muted animate-pulse rounded mb-8" />

            {/* Title skeleton */}
            <div className="h-4 w-24 bg-muted animate-pulse rounded mb-4" />
            <div className="h-10 w-3/4 bg-muted animate-pulse rounded mb-6" />

            {/* Cover image skeleton */}
            <div className="h-72 w-full bg-muted animate-pulse rounded-xl mb-10" />

            {/* Content skeleton */}
            <div className="space-y-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-full bg-muted animate-pulse rounded" />
                  <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
                </div>
              ))}
            </div>

            {/* Related posts skeleton */}
            <div className="mt-16">
              <div className="h-6 w-40 bg-muted animate-pulse rounded mb-6" />
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="h-20 w-20 bg-muted animate-pulse rounded-lg flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                          <div className="h-4 w-full bg-muted animate-pulse rounded" />
                          <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-4">
          {activeLocale === 'zh' ? '文章未找到' : 'Post not found'}
        </h1>
        <Button asChild>
          <Link href="/blog">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {activeLocale === 'zh' ? '返回博客' : 'Back to Blog'}
          </Link>
        </Button>
      </div>
    );
  }

  const postUrl = buildBlogUrl(post);

  return (
    <div className="min-h-screen bg-background">
      <article className="container mx-auto px-4 py-12 md:py-16">
        <div className="flex gap-8">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="max-w-3xl">
              {/* Breadcrumb */}
              <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Link href="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
                  <Home className="h-3.5 w-3.5" />
                  <span className="sr-only">{activeLocale === 'zh' ? '首页' : 'Home'}</span>
                </Link>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                <Link href="/blog" className="hover:text-foreground transition-colors">
                  {activeLocale === 'zh' ? '博客' : 'Blog'}
                </Link>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                <span className="text-foreground font-medium truncate max-w-[200px] sm:max-w-xs">
                  {post.title}
                </span>
              </nav>

              <header className="mb-10">
                <div className="flex flex-wrap items-center gap-3 mb-5">
                  <Badge variant="secondary" className="text-xs font-medium px-3 py-1">{post.category}</Badge>
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(post.created_at)}
                  </span>
                </div>
                <h1 className="text-3xl md:text-4xl lg:text-[2.75rem] font-extrabold leading-tight tracking-tight mb-6">
                  {post.title}
                </h1>
              </header>

              {post.cover_image && (
                <div className="mb-10 rounded-xl overflow-hidden shadow-sm">
                  <img
                    src={post.cover_image}
                    alt={post.title}
                    decoding="async"
                    className="w-full h-auto max-h-[420px] object-cover"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                </div>
              )}

              <div className="blog-article-scope max-w-none">
                <div dangerouslySetInnerHTML={{ __html: post.content }} />
              </div>

              <div className="mt-12 pt-8 border-t border-border">
                <Button variant="outline" className="gap-2" asChild>
                  <Link href="/blog">
                    <ArrowLeft className="h-4 w-4" />
                    {activeLocale === 'zh' ? '返回博客列表' : 'Back to Blog List'}
                  </Link>
                </Button>
              </div>

              {/* Bottom: Related posts — always show */}
              {relatedPosts.length > 0 && (
                <section className="mt-12">
                  <h2 className="text-xl font-bold mb-6">
                    {activeLocale === 'zh' ? '推荐阅读' : activeLocale === 'zh-Hant' ? '推薦閱讀' : 'Related Posts'}
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {relatedPosts.slice(0, 4).map((relatedPost) => (
                      <Card key={relatedPost.id} className="overflow-hidden hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg">
                              <img
                                src={relatedPost.cover_image || getDefaultCoverImage(relatedPost.category)}
                                alt={relatedPost.title}
                                loading="lazy"
                                decoding="async"
                                className="absolute inset-0 w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.currentTarget as HTMLImageElement;
                                  target.src = getDefaultCoverImage(relatedPost.category);
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
              <Badge variant="secondary" className="mb-1.5 text-xs">
                                {relatedPost.category}
                              </Badge>
                              <h3 className="font-semibold mb-1 text-sm leading-snug">
                                <Link href={buildBlogUrl(relatedPost)} className="text-foreground hover:text-primary transition-colors">
                                  {relatedPost.title}
                                </Link>
                              </h3>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(relatedPost.created_at)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* Right sidebar: Recommended posts */}
          {relatedPosts.length > 0 && (
            <aside className="hidden lg:block w-80 flex-shrink-0">
              <div className="sticky top-8 space-y-4">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                  {activeLocale === 'zh' ? '热门推荐' : activeLocale === 'zh-Hant' ? '熱門推薦' : 'Recommended'}
                </h3>
                {relatedPosts.slice(0, 5).map((rp) => (
                  <Link key={rp.id} href={buildBlogUrl(rp)} className="block group">
                    <Card className="overflow-hidden hover:shadow-md transition-shadow">
                      <div className="relative h-32 overflow-hidden">
                        <img
                          src={rp.cover_image || getDefaultCoverImage(rp.category)}
                          alt={rp.title}
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            target.src = getDefaultCoverImage(rp.category);
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <Badge variant="secondary" className="mb-1.5 text-xs">
                            {rp.category}
                          </Badge>
                          <h4 className="text-white font-semibold text-sm leading-snug line-clamp-2">
                            {rp.title}
                          </h4>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </aside>
          )}
        </div>
      </article>
    </div>
  );
}
