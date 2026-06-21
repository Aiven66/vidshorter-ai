'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/locale-context';
import { Calendar, ArrowRight, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { detectLanguage } from '@/lib/lang-detect';

export default function BlogPage() {
  const { t, locale } = useLocale();
  const activeLocale = normalizeLocale(locale);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

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

        // 先尝试按 locale 列过滤查询（如果 locale 列存在）
        let data: any[] | null = null;
        let error: any = null;
        let localeColumnExists = false;

        // 尝试带 locale 过滤的查询
        const localeResult = await client
          .from('blogs')
          .select('*')
          .eq('is_published', true)
          .eq('locale', activeLocale)
          .order('created_at', { ascending: false })
          .limit(50);

        if (localeResult.error) {
          // locale 列可能不存在，fallback 到不带 locale 过滤
          const fallbackResult = await client
            .from('blogs')
            .select('*')
            .eq('is_published', true)
            .order('created_at', { ascending: false })
            .limit(500);
          data = fallbackResult.data;
          error = fallbackResult.error;
        } else {
          localeColumnExists = true;
          data = localeResult.data;
          // 如果当前语言没有文章，fallback 到英文
          if (!data || data.length === 0) {
            const enResult = await client
              .from('blogs')
              .select('*')
              .eq('is_published', true)
              .eq('locale', 'en')
              .order('created_at', { ascending: false })
              .limit(50);
            if (enResult.data && enResult.data.length > 0) {
              data = enResult.data;
            }
          }
        }

        if (error) throw error;

        // 如果 locale 列不存在，使用语言检测来过滤
        if (!localeColumnExists && data && data.length > 0) {
          const filteredData = data.filter((row: any) => {
            const detectedLang = detectLanguage(row.title || '');
            if (detectedLang === activeLocale) return true;
            if (activeLocale === 'zh' && detectedLang === 'zh') return true;
            if (activeLocale === 'zh-Hant' && detectedLang === 'zh-Hant') return true;
            if (activeLocale === 'en' && detectedLang === 'en') return true;
            return false;
          });

          if (filteredData.length === 0) {
            const enArticles = data.filter((row: any) => detectLanguage(row.title || '') === 'en');
            data = enArticles.length > 0 ? enArticles : data.slice(0, 10);
          } else {
            data = filteredData;
          }
        }

        // 合并显示：数据库文章 + localStorage 文章 + 内置文章
        // 仅按 ID 去重，不按标题去重（不同语言版本可能有相同标题）
        const seenIds = new Set<string>();
        const databasePosts: BlogPost[] = [];

        // 1) 数据库中的文章（按 created_at 倒序，优先级最高）
        for (const row of (data || [])) {
          const post = normalizeBlogRow(row);
          if (!seenIds.has(post.id)) {
            seenIds.add(post.id);
            databasePosts.push(post);
          }
        }

        // 2) 追加 localStorage 中之前发布的文章（仅当数据库无数据时）
        if (databasePosts.length === 0) {
          for (const post of getStoredBlogPosts(activeLocale)) {
            if (!seenIds.has(post.id)) {
              seenIds.add(post.id);
              databasePosts.push(post);
            }
          }
        }

        // 3) 追加内置文章作为补充（仅当无其他文章时）
        if (databasePosts.length === 0) {
          for (const post of getBuiltInBlogPosts(activeLocale)) {
            if (!seenIds.has(post.id)) {
              seenIds.add(post.id);
              databasePosts.push(post);
            }
          }
        }

        if (!cancelled) setPosts(databasePosts);
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

  // 分页计算
  const totalPages = Math.ceil(posts.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedPosts = posts.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 生成分页页码
  const getPageNumbers = (): number[] => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

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
            <>
              <div className="grid gap-8">
                {paginatedPosts.map((post) => (
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

            {/* 分页组件 */}
            {totalPages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {activeLocale === 'zh' ? '上一页' : 'Prev'}
                </Button>

                {getPageNumbers().map((pageNum) => (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </Button>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1"
                >
                  {activeLocale === 'zh' ? '下一页' : 'Next'}
                  <ChevronRight className="h-4 w-4" />
                </Button>

                <span className="text-sm text-muted-foreground ml-3">
                  {activeLocale === 'zh'
                    ? `第 ${currentPage}/${totalPages} 页，共 ${posts.length} 篇`
                    : `Page ${currentPage}/${totalPages}, ${posts.length} articles`}
                </span>
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
