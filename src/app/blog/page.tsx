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

        // 先获取所有已发布文章
        const allResult = await client
          .from('blogs')
          .select('*')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(500);

        let data = allResult.data;
        const queryError = allResult.error;

        if (queryError) throw queryError;

        if (!data || data.length === 0) {
          setPosts(fallbackPosts);
          setLoading(false);
          return;
        }

        // 按 parent_id 分组：root 文章（parent_id 为空）为一组，
        // 翻译版本（parent_id 指向 root）归到同一组。
        // 每组只输出一条记录：优先当前语言版本，没有则 fallback 英文版。
        const groups = new Map<string, any[]>();
        for (const row of data) {
          const parentId = String(row.parent_id || row.id || '');
          if (!groups.has(parentId)) groups.set(parentId, []);
          groups.get(parentId)!.push(row);
        }

        const finalRows: any[] = [];
        for (const [, group] of groups) {
          // 1. 优先当前语言版本
          let selected = group.find(r => r.locale === activeLocale);

          // 2. 找英文 root 版
          if (!selected) selected = group.find(r => r.locale === 'en' || !r.locale);

          // 3. 用语言检测找匹配当前语言的
          if (!selected) {
            selected = group.find(r => {
              const detected = detectLanguage(String(r.title || ''));
              return detected === activeLocale;
            });
          }

          // 4. 取组内最新的（fallback）
          if (!selected) {
            selected = [...group].sort((a, b) =>
              new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
            )[0];
          }

          finalRows.push(selected);
        }

        // 按 created_at 降序
        finalRows.sort((a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );

        // 转化为 BlogPost 对象
        const databasePosts = finalRows.map(row => normalizeBlogRow(row));

        // localStorage 文章作为补充（仅数据库无数据时）
        if (databasePosts.length === 0) {
          for (const post of getStoredBlogPosts(activeLocale)) {
            const key = (post.title || '').trim().toLowerCase();
            const exists = databasePosts.some(p =>
              (p.title || '').trim().toLowerCase() === key
            );
            if (!exists) databasePosts.push(post);
          }
        }

        // 内置文章作为补充（仅数据库和 localStorage 都无数据时）
        if (databasePosts.length === 0) {
          databasePosts.push(...getBuiltInBlogPosts(activeLocale));
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
