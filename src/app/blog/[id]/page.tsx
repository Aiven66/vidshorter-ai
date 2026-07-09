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
  isPostForLocale,
  normalizeBlogRow,
  normalizeLocale,
  stripHtml,
} from '@/lib/blog-content';
import { Calendar, ArrowLeft, ArrowRight, ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

export default function BlogDetailPage() {
  const { t, locale } = useLocale();
  const activeLocale = normalizeLocale(locale);
  const params = useParams();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const postId = String(params.id || '');

  useEffect(() => {
    let cancelled = false;

    async function fetchPost() {
      const storedPosts = getStoredBlogPosts();
      const builtInPosts = getBuiltInBlogPosts(activeLocale);
      const builtInPost = getBuiltInBlogPost(postId, activeLocale);
      const storedPost = storedPosts.find(item => item.id === postId) || null;
      const fallbackPost = storedPost || builtInPost;

      // 相关文章候选：localStorage + 内置
      const allFallbackPosts = [...storedPosts, ...builtInPosts];
      const relatedCandidates = allFallbackPosts.filter(p => p.id !== postId);

      if (!cancelled) {
        setPost(fallbackPost);
      }

      if (!isSupabaseConfigured()) {
        const seenRelated = new Set<string>();
        const relatedList: BlogPost[] = [];
        for (const p of relatedCandidates) {
          const key = (p as any).slug || p.id;
          if (!seenRelated.has(key)) {
            seenRelated.add(key);
            relatedList.push(p);
          }
        }
        if (!cancelled) setRelatedPosts(relatedList.slice(0, 4));
        setLoading(false);
        return;
      }

      try {
        const { getSupabaseClient } = await import('@/storage/database/supabase-client');
        const client = getSupabaseClient();

        // 1. 先按 id 找到目标文章，确定 parent_id
        const { data: targetRow, error: targetError } = await client
          .from('blogs')
          .select('*')
          .eq('id', postId)
          .maybeSingle();

        if (targetError) throw targetError;

        let databasePost: BlogPost | null = null;

        if (targetRow) {
          const parentId = String(targetRow.parent_id || targetRow.id);

          // 2. 查询该 parent_id 下的所有版本（root + 翻译）
          const { data: versions, error: versionsError } = await client
            .from('blogs')
            .select('*')
            .eq('parent_id', parentId)
            .neq('id', parentId)
            .or(`id.eq.${parentId}`);

          if (!versionsError && versions && versions.length > 0) {
            // 优先当前语言版本
            let selected = versions.find(r => r.locale === activeLocale && r.is_published);
            // 其次英文版
            if (!selected) selected = versions.find(r => (r.locale === 'en' || !r.locale) && r.is_published);
            // fallback 到 targetRow
            if (!selected) selected = targetRow;
            databasePost = normalizeBlogRow(selected);

            // 更新浏览量（更新实际展示的那一行）
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

        const finalPost = databasePost || fallbackPost;

        if (!cancelled) {
          setPost(finalPost);
        }

        // 相关文章：从数据库读取同分类最新文章，按 parent_id 去重，按当前语言优先
        const seenRelated = new Set<string>();
        const rPosts: BlogPost[] = [];

        try {
          const { data: relatedData } = await client
            .from('blogs')
            .select('*')
            .eq('is_published', true)
            .neq('id', finalPost?.id || '')
            .eq('category', finalPost?.category || '')
            .order('created_at', { ascending: false })
            .limit(50);

          // 按 parent_id 分组，每组取当前语言优先
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

        // 补充 localStorage + 内置中的相关文章
        for (const p of relatedCandidates) {
          const key = (p as any).slug || p.id;
          if (!seenRelated.has(key)) {
            seenRelated.add(key);
            rPosts.push(p);
          }
        }
        // 补入其他文章（保证相关文章不会空）
        for (const p of allFallbackPosts) {
          const key = (p as any).slug || p.id;
          if (!seenRelated.has(key) && p.id !== postId) {
            seenRelated.add(key);
            rPosts.push(p);
          }
        }

        if (!cancelled) setRelatedPosts(rPosts.slice(0, 4));
      } catch {
        if (!cancelled) {
          setPost(fallbackPost);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    fetchPost();

    return () => {
      cancelled = true;
    };
  }, [activeLocale, postId]);

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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Post not found</h1>
        <Button asChild>
          <Link href="/blog">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Blog
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <article className="container mx-auto px-4 py-12 md:py-16">
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb navigation */}
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

          {relatedPosts.length > 0 && (
            <section className="mt-12">
              <h2 className="text-xl font-bold mb-6">
                {t('blog.relatedPosts') || 'Related Posts'}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {relatedPosts.map((relatedPost) => (
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
                            <Link href={`/blog/${relatedPost.id}`} className="text-foreground hover:text-primary transition-colors">
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
      </article>
    </div>
  );
}
