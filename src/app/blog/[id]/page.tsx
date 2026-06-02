'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/locale-context';
import {
  BlogPost,
  getBuiltInBlogPost,
  getStoredBlogPosts,
  isPostForLocale,
  normalizeBlogRow,
  normalizeLocale,
} from '@/lib/blog-content';
import { Calendar, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

export default function BlogDetailPage() {
  const { t, locale } = useLocale();
  const activeLocale = normalizeLocale(locale);
  const params = useParams();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const postId = String(params.id || '');

  useEffect(() => {
    let cancelled = false;

    async function fetchPost() {
      const storedPost = getStoredBlogPosts(activeLocale).find(item => item.id === postId) || null;
      const builtInPost = getBuiltInBlogPost(postId, activeLocale);
      const fallbackPost = storedPost || builtInPost;

      if (!cancelled) {
        setPost(fallbackPost);
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
          .eq('id', postId)
          .eq('is_published', true)
          .maybeSingle();

        if (error) throw error;

        const databasePost = data ? normalizeBlogRow(data) : null;
        const localizedDatabasePost = databasePost && isPostForLocale(databasePost, activeLocale)
          ? databasePost
          : null;

        if (!cancelled) {
          setPost(localizedDatabasePost || fallbackPost);
        }

        if (localizedDatabasePost) {
          try {
            await client
              .from('blogs')
              .update({ view_count: (localizedDatabasePost.view_count || 0) + 1 })
              .eq('id', localizedDatabasePost.id);
          } catch {}
        }
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

          {post.cover_image && (
            <div className="mb-8 rounded-lg overflow-hidden">
              <img
                src={post.cover_image}
                alt={post.title}
                className="w-full h-auto"
              />
            </div>
          )}

          <Card>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none p-8">
              <div dangerouslySetInnerHTML={{ __html: post.content }} />
            </CardContent>
          </Card>
        </div>
      </article>
    </div>
  );
}
