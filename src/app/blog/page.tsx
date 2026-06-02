'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/locale-context';
import {
  BlogPost,
  getBuiltInBlogPosts,
  getStoredBlogPosts,
  isPostForLocale,
  normalizeBlogRow,
  normalizeLocale,
  stripHtml,
} from '@/lib/blog-content';
import { Calendar, ArrowRight, FileText } from 'lucide-react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

function mergePosts(posts: BlogPost[]) {
  const seen = new Set<string>();
  return posts
    .filter(post => post.id && post.title && post.is_published !== false)
    .filter(post => {
      if (seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export default function BlogPage() {
  const { t, locale } = useLocale();
  const activeLocale = normalizeLocale(locale);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPosts() {
      const builtInPosts = getBuiltInBlogPosts(activeLocale);
      const storedPosts = getStoredBlogPosts(activeLocale);
      const fallbackPosts = mergePosts([...storedPosts, ...builtInPosts]);

      if (!cancelled) {
        setPosts(fallbackPosts);
        setLoading(false);
      }

      if (!isSupabaseConfigured()) {
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
          .limit(60);

        if (error) throw error;

        const databasePosts = (data || [])
          .map(row => normalizeBlogRow(row))
          .filter(post => isPostForLocale(post, activeLocale));

        if (!cancelled) {
          setPosts(mergePosts([...databasePosts, ...fallbackPosts]));
        }
      } catch {
        if (!cancelled) setPosts(fallbackPosts);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    fetchPosts();

    return () => {
      cancelled = true;
    };
  }, [activeLocale]);

  const formatDate = (dateString: string) => {
    const dateLocale = activeLocale === 'zh' ? 'zh-CN' : activeLocale === 'zh-Hant' ? 'zh-TW' : activeLocale === 'en' ? 'en-US' : activeLocale;
    return new Date(dateString).toLocaleDateString(dateLocale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
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
                    {post.cover_image && (
                      <div className="md:w-1/3">
                        <img
                          src={post.cover_image}
                          alt={post.title}
                          className="w-full h-48 md:h-full object-cover"
                        />
                      </div>
                    )}
                    <div className={`p-6 ${post.cover_image ? 'md:w-2/3' : 'w-full'}`}>
                      <div className="flex flex-wrap items-center gap-4 mb-3">
                        <Badge variant="secondary">{post.category}</Badge>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(post.created_at)}
                        </span>
                        {post.view_count && post.view_count > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {post.view_count} {t('blog.views')}
                          </span>
                        )}
                      </div>
                      <h2 className="text-2xl font-bold mb-3">{post.title}</h2>
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
