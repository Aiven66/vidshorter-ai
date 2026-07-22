'use client';

/**
 * @clipop/blog - Blog List Page
 *
 * Renders a paginated grid of blog cards with category filtering.
 * Uses fetchBlogPosts() to call /api/blog/posts on the host app.
 *
 * No shadcn/ui — pure native HTML + Tailwind.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppConfig, type BlogPost, type Locale } from '@clipop/core';
import { fetchBlogPosts } from './client';

export interface BlogListPageProps {
  locale?: Locale;
  /** Called when user clicks a post card. Receives the post object. */
  onPostClick?: (post: BlogPost) => void;
  /** Called when user changes the page. */
  onPageChange?: (page: number) => void;
  /** Override the page size (default 10). */
  pageSize?: number;
  /** Optional empty state element. */
  emptyState?: React.ReactNode;
}

const DEFAULT_COVER_IMAGE = 'https://picsum.photos/seed/blog-default/800/450';

/** Strip HTML tags and truncate to a short preview string. */
function stripHtml(html: string, maxLen = 140): string {
  if (!html) return '';
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

export function BlogListPage({
  locale,
  onPostClick,
  onPageChange,
  pageSize = 10,
  emptyState,
}: BlogListPageProps) {
  const config = useAppConfig();
  const displayLocale = locale || config.defaultLocale || 'en';
  const isZh = displayLocale === 'zh';

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBlogPosts(config, {
        page,
        pageSize,
        locale: displayLocale,
      });
      setPosts(result.posts);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts');
      setPosts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [config, page, pageSize, displayLocale]);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts) {
      if (p.category) counts.set(p.category, (counts.get(p.category) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
  }, [posts]);

  const filteredPosts = useMemo(() => {
    if (!selectedCategory) return posts;
    return posts.filter((p) => p.category === selectedCategory);
  }, [posts, selectedCategory]);

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedPosts = filteredPosts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const handlePageChange = useCallback(
    (next: number) => {
      const target = Math.max(1, Math.min(totalPages, next));
      setPage(target);
      onPageChange?.(target);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [totalPages, onPageChange],
  );

  const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    const dateLocale = displayLocale === 'zh' ? 'zh-CN' : displayLocale === 'zh-Hant' ? 'zh-TW' : 'en-US';
    return date.toLocaleDateString(dateLocale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8">
            <h1 className="mb-2 text-3xl font-bold">{isZh ? '博客' : 'Blog'}</h1>
            <p className="text-muted-foreground">
              {isZh ? '阅读最新文章与教程' : 'Read the latest articles and tutorials'}
            </p>
          </header>

          {categories.length > 0 && (
            <div className="mb-8 flex flex-wrap gap-2">
              <CategoryButton
                active={selectedCategory === null}
                onClick={() => setSelectedCategory(null)}
              >
                {isZh ? '全部' : 'All'}
                <span className="ml-1 rounded-full bg-muted px-1.5 text-xs">
                  {posts.length}
                </span>
              </CategoryButton>
              {categories.map(({ category, count }) => (
                <CategoryButton
                  key={category}
                  active={selectedCategory === category}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                  <span className="ml-1 rounded-full bg-muted px-1.5 text-xs">{count}</span>
                </CategoryButton>
              ))}
            </div>
          )}

          {loading && (
            <div className="grid gap-6 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-xl border bg-background">
                  <div className="h-48 w-full animate-pulse bg-muted" />
                  <div className="space-y-3 p-4">
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-full animate-pulse rounded bg-muted" />
                    <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <button
                type="button"
                onClick={load}
                className="mt-3 rounded border border-border px-3 py-1 text-sm hover:bg-muted"
              >
                {isZh ? '重试' : 'Retry'}
              </button>
            </div>
          )}

          {!loading && !error && paginatedPosts.length === 0 && (
            <div className="py-16 text-center">
              {emptyState || (
                <>
                  <div className="mx-auto mb-3 h-12 w-12 text-muted-foreground">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-12 w-12"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="9" y1="13" x2="15" y2="13" />
                      <line x1="9" y1="17" x2="13" y2="17" />
                    </svg>
                  </div>
                  <p className="text-muted-foreground">
                    {isZh ? '暂无文章' : 'No posts yet'}
                  </p>
                </>
              )}
            </div>
          )}

          {!loading && !error && paginatedPosts.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2">
              {paginatedPosts.map((post) => (
                <article
                  key={post.id}
                  className="group overflow-hidden rounded-xl border bg-background transition hover:shadow-lg"
                  onClick={() => onPostClick?.(post)}
                  role={onPostClick ? 'button' : undefined}
                  tabIndex={onPostClick ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (onPostClick && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onPostClick(post);
                    }
                  }}
                >
                  <div className="relative h-48 w-full overflow-hidden">
                    <img
                      src={post.coverImage || DEFAULT_COVER_IMAGE}
                      alt={post.title}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = DEFAULT_COVER_IMAGE;
                      }}
                    />
                  </div>
                  <div className="space-y-2 p-4">
                    {post.category && (
                      <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                        {post.category}
                      </span>
                    )}
                    <h2 className="text-lg font-semibold leading-snug group-hover:text-primary">
                      {post.title}
                    </h2>
                    {post.content && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {stripHtml(post.content)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDate(post.createdAt)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading && !error && totalPages > 1 && (
            <div className="mt-12 flex items-center justify-center gap-2">
              <PageButton
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                {isZh ? '上一页' : 'Prev'}
              </PageButton>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages)
                .map((pageNum, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && pageNum - prev > 1;
                  return (
                    <span key={pageNum} className="flex items-center gap-2">
                      {showEllipsis && <span className="text-muted-foreground">…</span>}
                      <PageButton
                        onClick={() => handlePageChange(pageNum)}
                        active={pageNum === currentPage}
                      >
                        {pageNum}
                      </PageButton>
                    </span>
                  );
                })}
              <PageButton
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                {isZh ? '下一页' : 'Next'}
              </PageButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline components ────────────────────────────────────────────────────────

function CategoryButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm transition ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function PageButton({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[2rem] rounded border px-2 py-1 text-sm transition ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-foreground hover:bg-muted'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}
