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
      const storedPosts = getStoredBlogPosts(activeLocale);
      const storedPost = storedPosts.find(item => item.id === postId) || null;
      const builtInPosts = getBuiltInBlogPosts(activeLocale);
      const builtInPost = getBuiltInBlogPost(postId, activeLocale);
      const fallbackPost = storedPost || builtInPost;

      if (!cancelled) {
        setPost(fallbackPost);
      }

      const allPosts = [...storedPosts, ...builtInPosts];
      const currentPost = allPosts.find(p => p.id === postId) || fallbackPost;
      const category = currentPost?.category || '';

      const relatedCandidates = allPosts.filter(p => p.id !== currentPost?.id);
      const seenRelated = new Set<string>();
      const related = [
        ...relatedCandidates.filter(p => p.category === category),
        ...relatedCandidates,
      ].filter((candidate) => {
        const groupKey = candidate.translation_group || candidate.id;
        if (seenRelated.has(groupKey)) return false;
        seenRelated.add(groupKey);
        return true;
      }).slice(0, 4);
      setRelatedPosts(related);

      if (!isSupabaseConfigured()) {
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
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none p-8">
              <div dangerouslySetInnerHTML={{ __html: post.content }} />
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
