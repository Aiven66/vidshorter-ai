'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  Upload,
  X,
  FileCode,
  Sparkles,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
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

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(10); // 每页10条

  // ========= Traditional editor mode state =========
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [blogTitle, setBlogTitle] = useState('');
  const [blogCategory, setBlogCategory] = useState('AI Video Clipping');
  const [blogCoverImage, setBlogCoverImage] = useState('');
  const [blogContent, setBlogContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // ========= HTML upload mode state =========
  const [createMode, setCreateMode] = useState<'traditional' | 'html'>('traditional');
  const [htmlTitle, setHtmlTitle] = useState('');
  const [htmlCategory, setHtmlCategory] = useState('AI Video Clipping');
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<string>('');
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string>('');
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);
  const [additionalPreviews, setAdditionalPreviews] = useState<string[]>([]);
  const [htmlSaving, setHtmlSaving] = useState(false);
  const [htmlStatus, setHtmlStatus] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const additionalInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);

  // 拖拽状态
  const [htmlDragOver, setHtmlDragOver] = useState(false);
  const [coverDragOver, setCoverDragOver] = useState(false);
  const [additionalDragOver, setAdditionalDragOver] = useState(false);
  // 拖拽计数器（解决子元素触发 dragLeave 的问题）
  const htmlDragCountRef = useRef(0);
  const coverDragCountRef = useRef(0);
  const additionalDragCountRef = useRef(0);

  const isAdmin = user?.role === 'admin' || user?.email === 'admin@126.com' || user?.email === 'admin@clipop.ai' || user?.email === 'admin@vidshorter.ai';

  const fetchPosts = useCallback(async (page: number = 1) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/blog/posts?page=${page}&pageSize=${pageSize}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      let dbPosts: BlogPost[] = [];
      let total = 0;
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
        total = data.total || dbPosts.length;
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

      // 计算分页
      const startIdx = (page - 1) * pageSize;
      const endIdx = startIdx + pageSize;
      const paginatedPosts = uniquePosts.slice(startIdx, endIdx);

      setPosts(paginatedPosts);
      setTotalCount(uniquePosts.length);
      setCurrentPage(page);
    } catch (err) {
      const activeLocale = normalizeLocale(locale);
      const fallbackPosts = [...getStoredBlogPosts(activeLocale), ...getBuiltInBlogPosts(activeLocale)];
      fallbackPosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const startIdx = (page - 1) * pageSize;
      const endIdx = startIdx + pageSize;
      const paginatedPosts = fallbackPosts.slice(startIdx, endIdx);

      setPosts(paginatedPosts);
      setTotalCount(fallbackPosts.length);
      setCurrentPage(page);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [accessToken, locale, pageSize]);

  useEffect(() => {
    if (view === 'list') {
      setCurrentPage(1);
      fetchPosts(1);
    }
  }, [view, fetchPosts]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchPosts(page);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

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
    // Reset HTML mode state
    setHtmlTitle('');
    setHtmlCategory('AI Video Clipping');
    setHtmlFile(null);
    setHtmlPreview('');
    setCoverImageFile(null);
    setCoverImagePreview('');
    setAdditionalImages([]);
    setAdditionalPreviews([]);
    setHtmlStatus(null);
    setView('new');
  }

  async function openEditForm(post: BlogPost) {
    setEditingPost(post);
    setBlogTitle(post.title);
    setBlogCategory(post.category);
    setBlogCoverImage(post.cover_image || '');
    setBlogContent(post.content || '');
    setSaveStatus(null);

    // 如果 content 为空，从数据库加载完整内容
    if (!post.content && accessToken) {
      try {
        const res = await fetch(`/api/blog/posts`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          const fullPost = (data.posts || []).find((p: any) => p.id === post.id);
          if (fullPost?.content) {
            setBlogContent(fullPost.content);
          }
        }
      } catch {
        // 静默失败，使用空内容
      }
    }

    setView('edit');
  }

  async function handleDeletePost(postId: string, postTitle: string) {
    if (!isAdmin) {
      setError(locale === 'zh' ? '需要管理员权限' : 'Admin access required');
      return;
    }
    const confirmMessage =
      locale === 'zh'
        ? `确认删除文章"${postTitle}"？此操作无法撤销。`
        : `Confirm delete "${postTitle}"? This cannot be undone.`;
    if (!window.confirm(confirmMessage)) return;

    try {
      // 使用 accessToken（来自 useAuth hook）而非 localStorage，确保 token 一致
      if (!accessToken) {
        throw new Error(locale === 'zh' ? '未登录或 token 失效' : 'Not logged in or token expired');
      }

      const res = await fetch(`/api/blog/${encodeURIComponent(postId)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          body?.error || (locale === 'zh' ? '删除失败' : 'Delete failed')
        );
      }

      const stored = getStoredBlogPosts().filter((p) => p.id !== postId);
      saveAdminBlogPosts(stored);

      await fetchPosts();
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err) || (locale === 'zh' ? '删除失败' : 'Delete failed');
      setError(message);
    }
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

  // ======================================================
  // ========= HTML upload mode handlers ========================
  // ======================================================

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error || new Error('read failed'));
    });
  }

  function extractTitleFromHtml(html: string): string {
    const match = html.match(/<title>([^<]+)<\/title>/i);
    return match ? match[1].trim() : '';
  }

  function extractCategoryFromHtml(html: string): string {
    const metaMatch = html.match(/<meta\s+name=["']category["']\s+content=["']([^"']+)["']/i);
    if (metaMatch) return metaMatch[1].trim();
    const tagMatch = html.match(/<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i);
    if (tagMatch) {
      const keywords = tagMatch[1].split(',').map(k => k.trim()).filter(k => k);
      if (keywords.length > 0) return keywords[0];
    }
    return '';
  }

  function handleHtmlFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setHtmlFile(file);
    file.text().then((text) => {
      setHtmlPreview(text);
      const title = extractTitleFromHtml(text);
      const category = extractCategoryFromHtml(text);
      if (title) setHtmlTitle(title);
      if (category) setHtmlCategory(category);
    });
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverImageFile(file);
    readFileAsDataUrl(file).then((url) => setCoverImagePreview(url));
  }

  function handleAdditionalImagesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setAdditionalImages((prev) => [...prev, ...files]);
    Promise.all(files.map((f) => readFileAsDataUrl(f))).then((urls) => {
      setAdditionalPreviews((prev) => [...prev, ...urls]);
    });
  }

  function removeAdditionalImage(index: number) {
    setAdditionalImages((prev) => prev.filter((_f, i) => i !== index));
    setAdditionalPreviews((prev) => prev.filter((_u, i) => i !== index));
  }

  function moveAdditionalImage(index: number, direction: 'up' | 'down') {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= additionalImages.length) return;
    setAdditionalImages((prev) => {
      const arr = [...prev];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
    setAdditionalPreviews((prev) => {
      const arr = [...prev];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  }

  // 拖拽处理函数（使用计数器解决子元素触发 dragLeave 的问题）
  function createDragHandlers(
    setDragOver: (v: boolean) => void,
    dragCountRef: React.MutableRefObject<number>,
    onDrop: (e: React.DragEvent) => void
  ) {
    return {
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCountRef.current++;
        setDragOver(true);
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // 必须持续 preventDefault 才能让 drop 事件触发
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCountRef.current--;
        if (dragCountRef.current <= 0) {
          dragCountRef.current = 0;
          setDragOver(false);
        }
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCountRef.current = 0;
        setDragOver(false);
        onDrop(e);
      },
    };
  }

  const htmlDragHandlers = createDragHandlers(setHtmlDragOver, htmlDragCountRef, (e: React.DragEvent) => {
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.html') || file.name.endsWith('.htm') || file.name.endsWith('.txt'))) {
      setHtmlFile(file);
      file.text().then((text) => {
        setHtmlPreview(text);
        const title = extractTitleFromHtml(text);
        const category = extractCategoryFromHtml(text);
        if (title) setHtmlTitle(title);
        if (category) setHtmlCategory(category);
      });
    }
  });

  const coverDragHandlers = createDragHandlers(setCoverDragOver, coverDragCountRef, (e: React.DragEvent) => {
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setCoverImageFile(file);
      readFileAsDataUrl(file).then((url) => setCoverImagePreview(url));
    }
  });

  const additionalDragHandlers = createDragHandlers(setAdditionalDragOver, additionalDragCountRef, (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setAdditionalImages((prev) => [...prev, ...files]);
    Promise.all(files.map((f) => readFileAsDataUrl(f))).then((urls) => {
      setAdditionalPreviews((prev) => [...prev, ...urls]);
    });
  });

  function resetHtmlMode() {
    setHtmlFile(null);
    setHtmlPreview('');
    setCoverImageFile(null);
    setCoverImagePreview('');
    setAdditionalImages([]);
    setAdditionalPreviews([]);
  }

  async function handlePublishHtml() {
    if (!isAdmin || !accessToken) {
      setHtmlStatus(locale === 'zh' ? '需要管理员权限' : 'Admin access required');
      return;
    }
    if (!htmlFile || !htmlPreview.trim()) {
      setHtmlStatus(locale === 'zh' ? '请上传 HTML 内容文件' : 'HTML file required');
      return;
    }

    setHtmlSaving(true);
    setHtmlStatus(null);
    try {
      const formData = new FormData();
      // 标题可选，如果用户没有输入则由后端从HTML提取
      if (htmlTitle.trim()) {
        formData.append('title', htmlTitle.trim());
      }
      // 分类可选，如果用户没有输入则由后端从HTML提取
      if (htmlCategory.trim()) {
        formData.append('category', htmlCategory.trim());
      }
      formData.append('htmlFile', htmlFile, htmlFile.name || 'article.html');
      if (coverImageFile) formData.append('coverFile', coverImageFile, coverImageFile.name || 'cover.jpg');
      additionalImages.forEach((file, idx) => {
        formData.append(`img_${idx}`, file, file.name || `img-${idx}.jpg`);
      });

      const res = await fetch('/api/blog/html-publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.posts)) saveAdminBlogPosts(data.posts);
        setHtmlStatus(
          locale === 'zh'
            ? `已发布 ${data.posts?.length || 1} 篇文章（上传 ${data.imageUploaded || 0} 张图）`
            : `Published ${data.posts?.length || 1} article(s) (${data.imageUploaded || 0} images uploaded)`
        );
        setTimeout(() => {
          setView('list');
          setHtmlStatus(null);
        }, 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        setHtmlStatus(
          locale === 'zh'
            ? `发布失败：${data.error || res.statusText}`
            : `Publish failed: ${data.error || res.statusText}`
        );
      }
    } catch (err) {
      setHtmlStatus(err instanceof Error ? err.message : (locale === 'zh' ? '发布失败' : 'Publish failed'));
    } finally {
      setHtmlSaving(false);
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

                    <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditForm(post)}
                        className="flex items-center gap-1"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {locale === 'zh' ? '编辑' : 'Edit'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeletePost(post.id, post.title)}
                        className="flex items-center gap-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {locale === 'zh' ? '删除' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 分页组件 */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {locale === 'zh' ? '上一页' : 'Prev'}
            </Button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const startPage = Math.max(1, currentPage - 2);
              const pageNum = startPage + i;
              if (pageNum > totalPages) return null;
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handlePageChange(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}

            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1"
            >
              {locale === 'zh' ? '下一页' : 'Next'}
              <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
            </Button>

            <span className="text-sm text-muted-foreground ml-2">
              {locale === 'zh' ? `第 ${currentPage}/${totalPages} 页` : `Page ${currentPage}/${totalPages}`}
            </span>
          </div>
        )}
      </div>
    );
  }

  // ============ NEW / EDIT POST VIEW ============
  const isEditing = view === 'edit';

  function renderTraditionalForm() {
    return (
      <>
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
      </>
    );
  }

  function renderHtmlUploadForm() {
    return (
      <>
        <div className="grid gap-2">
          <Label htmlFor="html-title">
            {locale === 'zh' ? '文章标题' : 'Article Title'}
            <span className="ml-2 text-xs text-muted-foreground">
              ({locale === 'zh' ? '自动从HTML读取，可编辑' : 'Auto-detected from HTML, editable'})
            </span>
          </Label>
          <Input
            id="html-title"
            value={htmlTitle}
            onChange={(e) => setHtmlTitle(e.target.value)}
            placeholder={
              locale === 'zh'
                ? '上传HTML文件后自动填充标题'
                : 'Title will be auto-filled after uploading HTML'
            }
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="html-category">
            <Tag className="h-3.5 w-3.5 inline mr-1" />
            {locale === 'zh' ? '分类' : 'Category'}
            <span className="ml-2 text-xs text-muted-foreground">
              ({locale === 'zh' ? '自动从HTML读取，可编辑' : 'Auto-detected from HTML, editable'})
            </span>
          </Label>
          <Input
            id="html-category"
            value={htmlCategory}
            onChange={(e) => setHtmlCategory(e.target.value)}
            placeholder={locale === 'zh' ? 'AI Video Clipping' : 'AI Video Clipping'}
          />
        </div>

        {/* HTML 文件拖拽上传区 */}
        <div className="grid gap-2">
          <Label>{locale === 'zh' ? '上传 HTML 内容文件' : 'Upload HTML content file'}</Label>
          <input
            ref={htmlInputRef}
            type="file"
            accept=".html,.htm,.txt"
            onChange={handleHtmlFileChange}
            className="hidden"
          />
          <div
            {...htmlDragHandlers}
            onClick={() => htmlInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              htmlDragOver
                ? 'border-primary bg-primary/5'
                : htmlFile
                  ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20'
                  : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            {htmlFile ? (
              <div className="flex items-center justify-center gap-3 pointer-events-none">
                <FileCode className="h-8 w-8 text-green-600" />
                <div className="text-left">
                  <p className="font-medium text-sm">{htmlFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(htmlFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            ) : (
              <div className="pointer-events-none">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">
                  {locale === 'zh' ? '拖拽 HTML 文件到此处' : 'Drag & drop HTML file here'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {locale === 'zh' ? '或点击选择文件 (.html, .htm, .txt)' : 'or click to select file (.html, .htm, .txt)'}
                </p>
              </div>
            )}
          </div>
          {htmlFile && (
            <div className="flex items-center gap-2 mt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setHtmlFile(null);
                  setHtmlPreview('');
                  if (htmlInputRef.current) htmlInputRef.current.value = '';
                }}
                className="flex items-center gap-1 text-destructive hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
                {locale === 'zh' ? '清除文件' : 'Clear file'}
              </Button>
            </div>
          )}
          {htmlPreview && !htmlFile && (
            <div className="mt-2 p-3 border border-border rounded-md max-h-32 overflow-y-auto text-xs text-muted-foreground bg-muted/20 whitespace-pre-wrap break-words">
              {htmlPreview.slice(0, 500)}{htmlPreview.length > 500 ? '...' : ''}
            </div>
          )}
        </div>

        {/* 封面图片拖拽上传区 */}
        <div className="grid gap-2">
          <Label>{locale === 'zh' ? '封面图片' : 'Cover image'}</Label>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverChange}
            className="hidden"
          />
          <div
            {...coverDragHandlers}
            onClick={() => coverInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              coverDragOver
                ? 'border-primary bg-primary/5'
                : coverImagePreview
                  ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20'
                  : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            {coverImagePreview ? (
              <div className="flex items-center gap-4 pointer-events-none">
                <img
                  src={coverImagePreview}
                  alt="cover preview"
                  className="h-20 w-32 object-cover rounded-md border border-border"
                />
                <div className="text-left flex-1">
                  <p className="font-medium text-sm">{coverImageFile?.name || 'Cover image'}</p>
                  {coverImageFile && (
                    <p className="text-xs text-muted-foreground">
                      {(coverImageFile.size / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="pointer-events-none">
                <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">
                  {locale === 'zh' ? '拖拽封面图片到此处' : 'Drag & drop cover image here'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {locale === 'zh' ? '或点击选择图片' : 'or click to select image'}
                </p>
              </div>
            )}
          </div>
          {coverImageFile && (
            <div className="flex items-center gap-2 mt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCoverImageFile(null);
                  setCoverImagePreview('');
                  if (coverInputRef.current) coverInputRef.current.value = '';
                }}
                className="flex items-center gap-1 text-destructive hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
                {locale === 'zh' ? '清除封面' : 'Clear cover'}
              </Button>
            </div>
          )}
        </div>

        {/* 配图拖拽上传区（支持多文件） */}
        <div className="grid gap-2">
          <Label>
            {locale === 'zh' ? '其他配图（可选，支持多选）' : 'Additional images (optional, multi-select)'}
          </Label>
          <input
            ref={additionalInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleAdditionalImagesChange}
            className="hidden"
          />
          <div
            {...additionalDragHandlers}
            onClick={() => additionalInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              additionalDragOver
                ? 'border-primary bg-primary/5'
                : additionalPreviews.length > 0
                  ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20'
                  : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            {additionalPreviews.length > 0 ? (
              <div className="flex items-center gap-3 pointer-events-none">
                <div className="flex -space-x-2">
                  {additionalPreviews.slice(0, 4).map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt={`img-${idx}`}
                      className="h-12 w-12 object-cover rounded-md border-2 border-background"
                    />
                  ))}
                </div>
                <div className="text-left flex-1">
                  <p className="font-medium text-sm">
                    {locale === 'zh'
                      ? `已选择 ${additionalImages.length} 张配图`
                      : `${additionalImages.length} image(s) selected`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {locale === 'zh' ? '点击继续添加或拖入更多图片' : 'Click or drag to add more images'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="pointer-events-none">
                <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">
                  {locale === 'zh' ? '拖拽配图到此处（可多张）' : 'Drag & drop images here (multi)'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {locale === 'zh' ? '或点击选择多张图片' : 'or click to select multiple images'}
                </p>
              </div>
            )}
          </div>

          {/* 配图预览列表（带排序和删除） */}
          {additionalPreviews.length > 0 && (
            <div className="mt-3 space-y-2">
              {additionalPreviews.map((url, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-2 rounded-md border border-border bg-background hover:bg-muted/30 transition-colors"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-grab" />
                  <img
                    src={url}
                    alt={`image-${idx}`}
                    className="h-14 w-14 object-cover rounded-md border border-border flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {additionalImages[idx]?.name || `image-${idx + 1}`}
                    </p>
                    {additionalImages[idx] && (
                      <p className="text-xs text-muted-foreground">
                        {(additionalImages[idx].size / 1024).toFixed(1)} KB
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => moveAdditionalImage(idx, 'up')}
                      disabled={idx === 0}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => moveAdditionalImage(idx, 'down')}
                      disabled={idx === additionalPreviews.length - 1}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAdditionalImage(idx)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowPreviewModal(true)}
            disabled={!htmlFile && !htmlPreview}
            className="flex items-center gap-2"
          >
            <Eye className="h-4 w-4" />
            {locale === 'zh' ? '预览发布效果' : 'Preview'}
          </Button>
          <Button
            type="button"
            onClick={handlePublishHtml}
            disabled={htmlSaving || !isAdmin}
            className="flex items-center gap-2"
          >
            {htmlSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {locale === 'zh' ? '发布中...' : 'Publishing...'}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {locale === 'zh' ? '发布文章' : 'Publish Article'}
              </>
            )}
          </Button>
          {htmlStatus && (
            <span className="text-sm text-muted-foreground">{htmlStatus}</span>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => {
            setView('list');
            setSaveStatus(null);
            setHtmlStatus(null);
            setShowPreviewModal(false);
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

      {/* Tab switcher - only on new post */}
      {!isEditing && (
        <div className="mb-4 p-1 inline-flex items-center gap-1 bg-muted rounded-md">
          <button
            type="button"
            onClick={() => setCreateMode('traditional')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              createMode === 'traditional'
                ? 'bg-background text-foreground shadow'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {locale === 'zh' ? '传统编辑器' : 'Traditional Editor'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCreateMode('html')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              createMode === 'html'
                ? 'bg-background text-foreground shadow'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-2">
              <FileCode className="h-4 w-4" />
              {locale === 'zh' ? 'HTML 上传模式' : 'HTML Upload Mode'}
            </span>
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {locale === 'zh' ? '文章信息' : 'Article Details'}
          </CardTitle>
          <CardDescription>
            {!isEditing && createMode === 'html'
              ? (locale === 'zh'
                  ? '上传 HTML 文件与配图，发布后自动支持多语言版本'
                  : 'Upload HTML file and images; auto-translated to multiple languages')
              : (locale === 'zh'
                  ? '输入英文标题与内容，系统自动翻译为多种语言版本'
                  : 'Enter English title & content; auto-translated to multiple languages')}
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

            {isEditing || createMode === 'traditional'
              ? renderTraditionalForm()
              : renderHtmlUploadForm()}
          </div>
        </CardContent>
      </Card>

      {/* Preview Modal */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="bg-background border border-border rounded-lg w-full max-w-3xl my-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-border bg-background rounded-t-lg">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">
                  {locale === 'zh' ? '发布预览' : 'Publish Preview'}
                </h2>
                <span className="text-xs text-muted-foreground">
                  — {htmlTitle || (locale === 'zh' ? '(未填写标题)' : '(title not set)')}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPreviewModal(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Preview Content - 模拟博客详情页样式 */}
            <div className="p-6 md:p-8">
              {/* 封面图 */}
              {(coverImagePreview || additionalPreviews[0]) && (
                <div className="mb-6 rounded-lg overflow-hidden border border-border">
                  <img
                    src={coverImagePreview || additionalPreviews[0]}
                    alt="cover"
                    className="w-full h-auto max-h-72 object-cover"
                  />
                </div>
              )}

              {/* 标题 */}
              {htmlTitle && (
                <h1 className="text-2xl md:text-3xl font-bold mb-3 leading-tight">{htmlTitle}</h1>
              )}

              {/* 元信息 */}
              <div className="flex items-center gap-3 text-sm text-muted-foreground mb-6 pb-6 border-b border-border">
                {htmlCategory && (
                  <Badge variant="secondary">{htmlCategory}</Badge>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date().toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </span>
              </div>

              {/* HTML 内容 - 使用 blog-article-scope 隔离样式 */}
              {htmlPreview ? (
                <div className="blog-article-scope prose prose-sm md:prose-base max-w-none prose-headings:font-bold prose-a:text-primary prose-img:rounded-md prose-img:border prose-img:border-border">
                  <div dangerouslySetInnerHTML={{ __html: htmlPreview }} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {locale === 'zh' ? '请先上传 HTML 内容文件' : 'Please upload HTML content file first'}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 flex items-center justify-end gap-2 p-4 border-t border-border bg-background rounded-b-lg">
              <Button variant="outline" onClick={() => setShowPreviewModal(false)}>
                {locale === 'zh' ? '关闭' : 'Close'}
              </Button>
              <Button
                onClick={() => {
                  setShowPreviewModal(false);
                  handlePublishHtml();
                }}
                disabled={htmlSaving || !isAdmin}
              >
                {htmlSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {locale === 'zh' ? '发布中...' : 'Publishing...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {locale === 'zh' ? '立即发布' : 'Publish Now'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
