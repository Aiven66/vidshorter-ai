'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  FileText,
  PlusCircle,
  ArrowLeft,
  Calendar,
  Eye,
  Tag,
  Image as ImageIcon,
  RefreshCw,
  Pencil,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  saveAdminBlogPosts,
  getBuiltInBlogPosts,
  getStoredBlogPosts,
  normalizeLocale,
  getDefaultCoverImage,
} from '@/lib/blog-content';
import { RichTextEditor } from '@/components/rich-text-editor';
import { CoverImageUploader } from '@/components/cover-image-uploader';
import { type Locale } from './admin-layout';

interface BlogPost {
  id: string;
  title: string;
  category: string;
  cover_image?: string;
  content?: string;
  is_published: boolean;
  view_count?: number;
  created_at: string;
  updated_at?: string;
}

interface BlogPageProps {
  locale: Locale;
}

export function BlogPage({ locale }: BlogPageProps) {
  const { user, accessToken } = useAuth();
  const [view, setView] = useState<'list' | 'new' | 'edit'>('list');
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Form state (shared for new/edit)
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [blogTitle, setBlogTitle] = useState('');
  const [blogCategory, setBlogCategory] = useState('AI Video Clipping');
  const [blogCoverImage, setBlogCoverImage] = useState('');
  const [blogContent, setBlogContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin' || user?.email === 'admin@126.com';

  const fetchPosts = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/blog/posts', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      let dbPosts: BlogPost[] = [];
      if (res.ok) {
        const data = await res.json();
        dbPosts = (data.posts || []).map((p: any) => ({
          id: p.id,
          title: p.title,
          category: p.category,
          cover_image: p.cover_image,
          content: p.content,
          is_published: p.is_published,
          view_count: p.view_count,
          created_at: new Date(p.created_at).toISOString(),
          updated_at: p.updated_at ? new Date(p.updated_at).toISOString() : undefined,
        }));
      }

      const activeLocale = normalizeLocale(locale);
      const storedPosts = getStoredBlogPosts(activeLocale).map(p => ({
        id: p.id,
        title: p.title,
        category: p.category,
        cover_image: p.cover_image,
        content: p.content,
        is_published: p.is_published,
        view_count: p.view_count,
        created_at: p.created_at,
        updated_at: undefined,
      }));

      const builtInPosts = getBuiltInBlogPosts(activeLocale).map(p => ({
        id: p.id,
        title: p.title,
        category: p.category,
        cover_image: p.cover_image,
        content: p.content,
        is_published: p.is_published,
        view_count: p.view_count,
        created_at: p.created_at,
        updated_at: undefined,
      }));

      const allPosts = [...dbPosts, ...storedPosts, ...builtInPosts];
      const seen = new Set<string>();
      const uniquePosts = allPosts.filter(post => {
        if (seen.has(post.id)) return false;
        seen.add(post.id);
        return true;
      });

      uniquePosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setPosts(uniquePosts);
    } catch (err) {
      const activeLocale = normalizeLocale(locale);
      const fallbackPosts = [...getStoredBlogPosts(activeLocale), ...getBuiltInBlogPosts(activeLocale)];
      fallbackPosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setPosts(fallbackPosts);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [accessToken, locale]);

  useEffect(() => {
    if (view === 'list') {
      fetchPosts();
    }
  }, [view, fetchPosts]);

  async function syncBuiltInPosts() {
    if (!accessToken || !isAdmin) return;
    setSyncing(true);
    try {
      const builtInPosts = getBuiltInBlogPosts('en');
      for (const post of builtInPosts) {
        const payload = {
          title: post.title,
          category: post.category,
          coverImage: post.cover_image || '',
          content: post.content || '',
          publish: true,
        };
        await fetch('/api/blog/posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });
      }
      await fetchPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  function openNewForm() {
    setEditingPost(null);
    setBlogTitle('');
    setBlogCategory('AI Video Clipping');
    setBlogCoverImage('');
    setBlogContent('');
    setSaveStatus(null);
    setView('new');
  }

  function openEditForm(post: BlogPost) {
    setEditingPost(post);
    setBlogTitle(post.title);
    setBlogCategory(post.category);
    setBlogCoverImage(post.cover_image || '');
    setBlogContent(post.content || '');
    setSaveStatus(null);
    setView('edit');
  }

  async function savePost() {
    setSaveStatus(null);

    if (!isAdmin) {
      setSaveStatus(locale === 'zh' ? '需要管理员权限' : 'Admin access required');
      return;
    }

    if (!blogTitle.trim() || !blogContent.trim()) {
      setSaveStatus(locale === 'zh' ? '请输入标题和内容' : 'Please enter title and content');
      return;
    }

    setSaving(true);

    try {
      if (accessToken) {
        const payload = {
          title: blogTitle.trim(),
          category: blogCategory.trim() || 'AI Video Clipping',
          coverImage: blogCoverImage.trim(),
          content: blogContent.trim(),
          publish: true,
        };

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
          }
          setSaveStatus(
            editingPost
              ? (locale === 'zh' ? '文章已更新' : 'Article updated')
              : (locale === 'zh' ? `已发布 ${data.posts?.length || 1} 篇文章` : `Published ${data.posts?.length || 1} article(s)`)
          );
          setTimeout(() => {
            setView('list');
            setSaveStatus(null);
          }, 1500);
        } else {
          const data = await res.json().catch(() => ({}));
          setSaveStatus(
            locale === 'zh'
              ? `保存失败：${data.error || res.statusText}`
              : `Save failed: ${data.error || res.statusText}`
          );
        }
      }
    } catch (err) {
      setSaveStatus(
        err instanceof Error ? err.message : (locale === 'zh' ? '保存失败' : 'Save failed')
      );
    } finally {
      setSaving(false);
    }
  }

  const formatDate = (dateString: string) => {
    const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-US';
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

  // ============ LIST VIEW ============
  if (view === 'list') {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">
              {locale === 'zh' ? '博客管理' : 'Blog Management'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {locale === 'zh' ? '管理平台所有已发布文章' : 'Manage all published articles'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={openNewForm} className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              {locale === 'zh' ? '新增博客' : 'New Article'}
            </Button>
            <Button
              variant="outline"
              onClick={syncBuiltInPosts}
              disabled={syncing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {locale === 'zh' ? '同步内置文章' : 'Sync Built-in'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">
              {locale === 'zh' ? '加载中...' : 'Loading...'}
            </span>
          </div>
        ) : posts.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                {locale === 'zh' ? '暂无文章' : 'No articles yet'}
              </p>
              <Button onClick={openNewForm} className="flex items-center gap-2 mx-auto">
                <PlusCircle className="h-4 w-4" />
                {locale === 'zh' ? '发布第一篇博客' : 'Publish your first article'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="p-5 flex items-start gap-4 hover:bg-muted/30 transition-colors group"
                  >
                    <div className="flex-shrink-0 w-24 h-24 rounded-md overflow-hidden bg-muted">
                      <img
                        src={post.cover_image || getDefaultCoverImage(post.category)}
                        alt={post.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          target.src = getDefaultCoverImage(post.category);
                        }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg mb-1 line-clamp-1">
                        {post.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-2">
                        <Badge variant="secondary">{post.category}</Badge>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(post.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" />
                          {post.view_count || 0}
                        </span>
                        <Badge variant={post.is_published ? 'default' : 'secondary'}>
                          {post.is_published
                            ? (locale === 'zh' ? '已发布' : 'Published')
                            : (locale === 'zh' ? '草稿' : 'Draft')}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditForm(post)}
                        className="flex items-center gap-1"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {locale === 'zh' ? '编辑' : 'Edit'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ============ NEW / EDIT POST VIEW ============
  const isEditing = view === 'edit';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => {
            setView('list');
            setSaveStatus(null);
          }}
          className="flex items-center gap-2 mb-4 -ml-3"
        >
          <ArrowLeft className="h-4 w-4" />
          {locale === 'zh' ? '返回文章列表' : 'Back to articles'}
        </Button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {isEditing
                ? (locale === 'zh' ? '编辑博客文章' : 'Edit Article')
                : (locale === 'zh' ? '发布新博客' : 'Publish New Article')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isEditing
                ? (locale === 'zh' ? '修改文章信息并保存' : 'Update article details')
                : (locale === 'zh' ? '填写文章信息并发布到平台' : 'Fill in article details and publish')}
            </p>
          </div>
          {isEditing && (
            <Badge variant="outline">
              {locale === 'zh' ? '编辑模式' : 'Edit Mode'}
            </Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {locale === 'zh' ? '文章信息' : 'Article Details'}
          </CardTitle>
          <CardDescription>
            {locale === 'zh'
              ? '输入英文标题与内容，系统自动翻译为多种语言版本'
              : 'Enter English title & content; auto-translated to multiple languages'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {!isAdmin && (
              <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                {locale === 'zh'
                  ? '请以管理员账号登录以保存文章'
                  : 'Please sign in as admin to save articles'}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="blog-title">
                {locale === 'zh' ? '英文标题' : 'English Title'}
              </Label>
              <Input
                id="blog-title"
                value={blogTitle}
                onChange={(e) => setBlogTitle(e.target.value)}
                placeholder={
                  locale === 'zh'
                    ? 'How to Turn Long Videos into AI Highlight Shorts'
                    : 'How to Turn Long Videos into AI Highlight Shorts'
                }
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1 grid gap-2">
                <Label htmlFor="blog-category">
                  <Tag className="h-3.5 w-3.5 inline mr-1" />
                  {locale === 'zh' ? '分类' : 'Category'}
                </Label>
                <Input
                  id="blog-category"
                  value={blogCategory}
                  onChange={(e) => setBlogCategory(e.target.value)}
                  placeholder={locale === 'zh' ? 'AI Video Clipping' : 'AI Video Clipping'}
                />
              </div>
              <div className="md:col-span-2">
                <CoverImageUploader
                  value={blogCoverImage}
                  onChange={setBlogCoverImage}
                  accessToken={accessToken}
                  locale={locale}
                  label={locale === 'zh' ? '封面图片（支持本地上传）' : 'Cover Image (Local Upload)'}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>
                {locale === 'zh' ? '文章内容（富文本编辑器）' : 'Article Content (Rich Text Editor)'}
              </Label>
              <RichTextEditor
                content={blogContent}
                onChange={setBlogContent}
                placeholder={locale === 'zh' ? '开始编写文章内容...' : 'Start writing your article...'}
                locale={locale}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button onClick={savePost} disabled={saving || !isAdmin}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {locale === 'zh' ? '保存中...' : 'Saving...'}
                  </>
                ) : isEditing ? (
                  locale === 'zh' ? '保存修改' : 'Save Changes'
                ) : (
                  locale === 'zh' ? '发布文章' : 'Publish Article'
                )}
              </Button>
              {saveStatus && (
                <span className="text-sm text-muted-foreground">{saveStatus}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
