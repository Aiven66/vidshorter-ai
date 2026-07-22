'use client';

/**
 * @clipop/blog - Blog Detail Page
 *
 * Fetches a single blog post (root + translations) via fetchBlogPost() and
 * renders it with dangerouslySetInnerHTML. Picks the best translation
 * matching `locale`, falling back to English, then to any available version.
 *
 * Related posts are loaded by category (same category first, then other
 * categories to fill up to 4 slots).
 *
 * No shadcn/ui — pure native HTML + Tailwind.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppConfig, type BlogPost, type Locale } from '@clipop/core';
import { fetchBlogPost } from './client';
import { sanitizeAndScopeHtml } from './sanitize';

export interface BlogDetailPageProps {
  id: string;
  locale?: Locale;
  onBack?: () => void;
  /** Optional callback when user clicks a related post. */
  onRelatedPostClick?: (post: BlogPost) => void;
}

const DEFAULT_COVER_IMAGE = 'https://picsum.photos/seed/blog-default/800/450';

export function BlogDetailPage({ id, locale, onBack, onRelatedPostClick }: BlogDetailPageProps) {
  const config = useAppConfig();
  const displayLocale = locale || config.defaultLocale || 'en';
  const isZh = displayLocale === 'zh';

  const [post, setPost] = useState<BlogPost | null>(null);
  const [translations, setTranslations] = useState<BlogPost[]>([]);
  const [related, setRelated] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const data = await fetchBlogPost(config, id);
        if (cancelled) return;

        const root = data.post;
        const trans = data.translations || [];
        if (!root) {
          setPost(null);
          setError(isZh ? '文章未找到' : 'Post not found');
          setLoading(false);
          return;
        }

        // Pick best version: prefer requested locale → english → any
        const candidates = [root, ...trans];
        const bestMatch =
          candidates.find((p) => p.locale === displayLocale) ||
          candidates.find((p) => p.locale === 'en' || !p.locale) ||
          candidates[0];

        setPost(bestMatch);
        setTranslations(candidates);

        // Increment view count (best-effort)
        try {
          await fetch(`/api/blog/posts/${encodeURIComponent(id)}/view`, {
            method: 'POST',
          });
        } catch {
          // ignore — view count is best-effort
        }

        // Load related posts (client-side filter for now; could be a dedicated endpoint)
        loadRelatedPosts(bestMatch);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load post');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    async function loadRelatedPosts(current: BlogPost) {
      try {
        const res = await fetch(
          `/api/blog/posts?pageSize=20&category=${encodeURIComponent(current.category || '')}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { posts?: BlogPost[] };
        const all = data.posts || [];
        const sameCategory = all.filter(
          (p) =>
            p.id !== current.id &&
            (p.parentId ?? p.id) !== (current.parentId ?? current.id) &&
            p.category === current.category,
        );
        const others = all.filter(
          (p) =>
            p.id !== current.id &&
            (p.parentId ?? p.id) !== (current.parentId ?? current.id) &&
            p.category !== current.category,
        );
        const combined = [...sameCategory, ...others].slice(0, 4);
        if (!cancelled) setRelated(combined);
      } catch {
        if (!cancelled) setRelated([]);
      }
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, displayLocale]);

  const sanitizedContent = useMemo(() => {
    if (!post?.content) return '';
    return sanitizeAndScopeHtml(post.content, 'blog-article-scope');
  }, [post]);

  const formatDate = useCallback(
    (dateString: string | undefined | null): string => {
      if (!dateString) return '';
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return '';
      const dateLocale = displayLocale === 'zh' ? 'zh-CN' : 'en-US';
      return date.toLocaleDateString(dateLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    },
    [displayLocale],
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="mb-4 h-9 w-3/4 animate-pulse rounded bg-muted" />
          <div className="mb-10 h-72 w-full animate-pulse rounded-xl bg-muted" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="mb-3 text-2xl font-bold">{error || (isZh ? '文章未找到' : 'Post not found')}</h1>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            {isZh ? '返回' : 'Back'}
          </button>
        )}
      </div>
    );
  }

  return (
    <article className="container mx-auto px-4 py-8 md:py-12">
      <div className="mx-auto max-w-3xl">
        {/* Breadcrumb */}
        {onBack && (
          <nav className="mb-6 text-sm text-muted-foreground">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <span>←</span>
              {isZh ? '返回博客' : 'Back to Blog'}
            </button>
          </nav>
        )}

        {/* Header */}
        <header className="mb-8">
          {post.category && (
            <span className="mb-3 inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium">
              {post.category}
            </span>
          )}
          <h1 className="mb-4 text-3xl font-bold leading-tight md:text-4xl">{post.title}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(post.createdAt)}
            {post.authorId && <span> · {post.authorId}</span>}
          </p>
        </header>

        {/* Cover */}
        {post.coverImage && (
          <div className="mb-8 overflow-hidden rounded-xl">
            <img
              src={post.coverImage}
              alt={post.title}
              decoding="async"
              className="h-auto w-full max-h-[420px] object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = DEFAULT_COVER_IMAGE;
              }}
            />
          </div>
        )}

        {/* Body */}
        <div
          className="blog-article-scope max-w-none prose prose-neutral dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        />

        {/* Related posts */}
        {related.length > 0 && (
          <section className="mt-12 border-t border-border pt-8">
            <h2 className="mb-4 text-xl font-bold">
              {isZh ? '相关文章' : 'Related Posts'}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {related.map((rp) => (
                <button
                  key={rp.id}
                  type="button"
                  onClick={() => onRelatedPostClick?.(rp)}
                  className="flex items-start gap-3 rounded-lg border p-3 text-left transition hover:bg-muted/40"
                >
                  <div className="h-16 w-16 flex-none overflow-hidden rounded">
                    <img
                      src={rp.coverImage || DEFAULT_COVER_IMAGE}
                      alt={rp.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = DEFAULT_COVER_IMAGE;
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    {rp.category && (
                      <span className="mb-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">
                        {rp.category}
                      </span>
                    )}
                    <h3 className="line-clamp-2 text-sm font-semibold">{rp.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(rp.createdAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
