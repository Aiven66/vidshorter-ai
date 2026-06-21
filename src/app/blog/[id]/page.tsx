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
import { Calendar, ArrowLeft, ArrowRight } from 'lucide-react';
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
        const { data, error } = await client
          .from('blogs')
          .select('*')
          .eq('id', postId)
          .maybeSingle();

        if (error) throw error;

        // 详情页不做 locale 过滤，确保所有文章可访问
        const databasePost = data ? normalizeBlogRow(data) : null;
        const finalPost = databasePost || fallbackPost;

        if (!cancelled) {
          setPost(finalPost);
        }

        if (databasePost) {
          try {
            await client
              .from('blogs')
              .update({ view_count: (databasePost.view_count || 0) + 1 })
              .eq('id', databasePost.id);
          } catch {}
        }

        // 相关文章：从数据库读取同分类最新文章，再补入 localStorage/内置
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
            .limit(6);

          for (const row of (relatedData || [])) {
            const p = normalizeBlogRow(row);
            const key = (row as any).slug || p.id;
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
    <div className="min-h-screen bg-muted/30">
      <article className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" className="mb-8" asChild>
            <Link href="/blog">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Blog
            </Link>
          </Button>

          <header className="mb-8">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <Badge variant="secondary">{post.category}</Badge>
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(post.created_at)}
              </span>
            </div>
            <h1 className="text-4xl font-bold mb-4">{post.title}</h1>
          </header>

          <div className="mb-8 rounded-lg overflow-hidden">
            <img
              src={post.cover_image || getDefaultCoverImage(post.category)}
              alt={post.title}
              className="w-full h-auto max-h-[400px] object-cover"
              onError={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                target.src = getDefaultCoverImage(post.category);
              }}
            />
          </div>

          <Card>
            <CardContent className="max-w-none p-8">
              <div className="blog-article-scope prose prose-neutral dark:prose-invert max-w-none">
                <div dangerouslySetInnerHTML={{ __html: post.content }} />
              </div>
            </CardContent>
          </Card>

          {relatedPosts.length > 0 && (
            <section className="mt-12">
              <h2 className="text-2xl font-bold mb-6 text-center">
                {t('blog.relatedPosts') || 'Related Posts'}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {relatedPosts.map((relatedPost) => (
                  <Card key={relatedPost.id} className="overflow-hidden hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg">
                          <img
                            src={relatedPost.cover_image || getDefaultCoverImage(relatedPost.category)}
                            alt={relatedPost.title}
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.currentTarget as HTMLImageElement;
                              target.src = getDefaultCoverImage(relatedPost.category);
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <Badge variant="secondary" className="mb-2">
                            {relatedPost.category}
                          </Badge>
                          <h3 className="font-semibold mb-1">
                            <Link href={`/blog/${relatedPost.id}`} className="text-primary hover:text-primary/80 transition-colors">
                              {relatedPost.title}
                            </Link>
                          </h3>
                          <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">
                            {stripHtml(relatedPost.content)}
                          </p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(relatedPost.created_at)}
                          </p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
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
