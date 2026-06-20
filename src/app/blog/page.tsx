'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/locale-context';
import { Calendar, ArrowRight, FileText } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import {
  BlogPost,
  getBuiltInBlogPosts,
  getStoredBlogPosts,
  getDefaultCoverImage,
  isPostForLocale,
  normalizeBlogRow,
  normalizeLocale,
  stripHtml,
} from '@/lib/blog-content';

export default function BlogPage() {
  const { t, locale } = useLocale();
  const activeLocale = normalizeLocale(locale);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchPosts();

    async function fetchPosts() {
      const fallbackPosts = [...getStoredBlogPosts(activeLocale), ...getBuiltInBlogPosts(activeLocale)];

      if (!isSupabaseConfigured()) {
        setPosts(fallbackPosts);
        setLoading(false);
        return;
      }

      try {
        const { getSupabaseClient } = await import('@/storage/database/supabase-client');
        const client = getSupabaseClient();
        const { data, error } = await client
          .from('blogs')
          .select('*')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(40);

        if (error) throw error;

        // 不按 locale 过滤，直接展示所有已发布文章
        const seenIds = new Set<string>();
        const databasePosts: BlogPost[] = [];
        for (const row of (data || [])) {
          const post = normalizeBlogRow(row);
          if (!seenIds.has(post.id)) {
            seenIds.add(post.id);
            databasePosts.push(post);
          }
        }

        const mergedPosts = databasePosts.length > 0 ? databasePosts : fallbackPosts;

        if (!cancelled) setPosts(mergedPosts);
      } catch {
        if (!cancelled) setPosts(fallbackPosts);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [activeLocale]);

  const formatDate = (dateString: string) => {
    const dateLocale = activeLocale === 'zh' ? 'zh-CN' : activeLocale === 'zh-Hant' ? 'zh-TW' : activeLocale === 'en' ? 'en-US' : activeLocale;
    const date = new Date(dateString);
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

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">{t('blog.title')}</h1>
          <p className="text-muted-foreground mb-12">
            {t('blog.subtitle')}
          </p>

          {posts.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('blog.noPosts')}</p>
            </div>
          ) : (
            <div className="grid gap-8">
              {posts.map((post) => (
                <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="md:flex">
                    <div className="relative h-48 md:min-h-[240px] md:w-1/3">
                      <img
                        src={post.cover_image || getDefaultCoverImage(post.category)}
                        alt={post.title}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          target.src = getDefaultCoverImage(post.category);
                        }}
                      />
                    </div>
                    <div className="p-6 md:w-2/3">
                      <div className="flex items-center gap-4 mb-3">
                        <Badge variant="secondary">{post.category}</Badge>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(post.created_at)}
                        </span>
                      </div>
                      <h2 className="text-2xl font-bold mb-3">
                      <Link href={`/blog/${post.id}`} className="text-primary hover:text-primary/80 transition-colors">
                        {post.title}
                      </Link>
                    </h2>
                      <p className="text-muted-foreground mb-4 line-clamp-3">
                        {stripHtml(post.content).substring(0, 200)}...
                      </p>
                      <Button variant="link" className="p-0 h-auto" asChild>
                        <Link href={`/blog/${post.id}`} className="flex items-center gap-1">
                          {t('blog.readMore')}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
