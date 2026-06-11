'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { createLocalizedAdminPosts, saveAdminBlogPosts } from '@/lib/blog-content';
import { type Locale } from './admin-layout';

interface BlogPageProps {
  locale: Locale;
}

export function BlogPage({ locale }: BlogPageProps) {
  const { user, accessToken } = useAuth();
  const [blogTitle, setBlogTitle] = useState('');
  const [blogCategory, setBlogCategory] = useState('AI Video Clipping');
  const [blogCoverImage, setBlogCoverImage] = useState('');
  const [blogContent, setBlogContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin' || user?.email === 'admin@126.com';

  async function publishBlog() {
    setPublishStatus(null);

    if (!isAdmin) {
      setPublishStatus(locale === 'zh' ? '需要管理员权限' : 'Admin access required');
      return;
    }

    if (!blogTitle.trim() || !blogContent.trim()) {
      setPublishStatus(locale === 'zh' ? '请输入标题和内容' : 'Please enter title and content');
      return;
    }

    setPublishing(true);

    try {
      const payload = {
        title: blogTitle.trim(),
        category: blogCategory.trim() || 'AI Video Clipping',
        coverImage: blogCoverImage.trim(),
        content: blogContent.trim(),
        publish: true,
      };

      let generatedCount = 0;
      let remoteSaved = false;
      if (accessToken) {
        const res = await fetch('/api/blog/posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (Array.isArray(data.posts)) {
            saveAdminBlogPosts(data.posts);
            generatedCount = data.posts.length;
          }
          remoteSaved = true;
        } else {
          const data = await res.json().catch(() => ({}));
          const localPosts = createLocalizedAdminPosts(payload);
          saveAdminBlogPosts(localPosts);
          generatedCount = localPosts.length;
          setPublishStatus(
            locale === 'zh'
              ? `本地保存成功。在线保存失败：${data.error || res.statusText}`
              : `Saved local preview. Online save failed: ${data.error || res.statusText}`
          );
        }
      }

      if (remoteSaved || !accessToken) {
        if (!accessToken) {
          const localPosts = createLocalizedAdminPosts(payload);
          saveAdminBlogPosts(localPosts);
          generatedCount = localPosts.length;
        }
        setPublishStatus(
          remoteSaved
            ? locale === 'zh'
              ? `已发布 ${generatedCount} 篇多语言博客文章`
              : `Published ${generatedCount} localized blog articles online`
            : locale === 'zh'
              ? `已创建 ${generatedCount} 篇预览文章`
              : `Created ${generatedCount} localized blog articles for preview`
        );
      }

      setBlogTitle('');
      setBlogCoverImage('');
      setBlogContent('');
    } catch (error) {
      const message = error instanceof Error ? error.message : (locale === 'zh' ? '发布失败' : 'Publishing failed');
      setPublishStatus(message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {locale === 'zh' ? '博客管理' : 'Blog Management'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {locale === 'zh' ? '发布多语言博客文章' : 'Publish multilingual blog articles'}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {locale === 'zh' ? '发布博客文章' : 'Publish Blog Article'}
          </CardTitle>
          <CardDescription>
            {locale === 'zh' ? '输入英文内容，系统自动翻译为多种语言' : 'Enter English content, auto translated to multiple languages'}
          </CardDescription>
          <Badge variant="secondary">
            {locale === 'zh' ? '英文源，自动翻译' : 'English source, auto localized'}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {!isAdmin && (
              <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                {locale === 'zh' ? '请以 admin@126.com 登录以发布文章' : 'Sign in as admin@126.com to publish'}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="blog-title">
                {locale === 'zh' ? '英文标题' : 'English Title'}
              </Label>
              <Input
                id="blog-title"
                value={blogTitle}
                onChange={(event) => setBlogTitle(event.target.value)}
                placeholder={locale === 'zh' ? '如何将长视频转换为AI亮点短视频' : 'How to Turn Long Videos into AI Highlight Shorts'}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="blog-category">
                  {locale === 'zh' ? '分类' : 'Category'}
                </Label>
                <Input
                  id="blog-category"
                  value={blogCategory}
                  onChange={(event) => setBlogCategory(event.target.value)}
                  placeholder={locale === 'zh' ? 'AI视频剪辑' : 'AI Video Clipping'}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="blog-cover">
                  {locale === 'zh' ? '封面图片URL' : 'Cover Image URL'}
                </Label>
                <Input
                  id="blog-cover"
                  value={blogCoverImage}
                  onChange={(event) => setBlogCoverImage(event.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="blog-content">
                {locale === 'zh' ? '英文内容' : 'English Content'}
              </Label>
              <Textarea
                id="blog-content"
                value={blogContent}
                onChange={(event) => setBlogContent(event.target.value)}
                placeholder="<p>clipopai helps creators convert long videos into short highlight clips with AI...</p>"
                className="min-h-56"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={publishBlog} disabled={publishing || !isAdmin}>
                {publishing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {locale === 'zh' ? '发布中...' : 'Publishing...'}
                  </>
                ) : (
                  locale === 'zh' ? '发布多语言文章' : 'Publish multilingual article'
                )}
              </Button>
              {publishStatus && (
                <span className="text-sm text-muted-foreground">{publishStatus}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
