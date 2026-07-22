'use client';

/**
 * @clipop/blog - Admin Blog Manager
 *
 * Lists all blog posts (including unpublished) with edit/delete/publish
 * actions. Provides a "New Post" form (title + category + cover uploader +
 * rich text editor + publish checkbox) and a "Translate" button that triggers
 * the host app's /api/blog/translate endpoint.
 *
 * No shadcn/ui — pure native HTML + Tailwind.
 */

import { useEffect, useState, useCallback } from 'react';
import { useAppConfig, type BlogPost, type Locale } from '@clipop/core';
import {
  fetchBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  translateBlogPost,
} from './client';
import { CoverUploader } from './cover-uploader';
import { RichTextEditor } from './rich-text-editor';

export interface AdminBlogManagerProps {
  /** Bearer token for API calls. */
  token: string;
  /** Display locale. Default: config.defaultLocale. */
  locale?: Locale;
  /** Override the editor's placeholder text. */
  editorPlaceholder?: string;
}

interface EditorState {
  id: string | null;
  title: string;
  category: string;
  content: string;
  coverImage: string;
  published: boolean;
}

const EMPTY_EDITOR: EditorState = {
  id: null,
  title: '',
  category: '',
  content: '',
  coverImage: '',
  published: true,
};

export function AdminBlogManager({
  token,
  locale,
  editorPlaceholder,
}: AdminBlogManagerProps) {
  const config = useAppConfig();
  const displayLocale = locale || config.defaultLocale || 'en';
  const isZh = displayLocale === 'zh';

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBlogPosts(config, { page: 1, pageSize: 100, locale: displayLocale });
      setPosts(result.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  }, [config, displayLocale]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const showFeedback = useCallback((kind: 'success' | 'error', message: string) => {
    setFeedback({ kind, message });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  const handleNewPost = useCallback(() => {
    setEditor({
      ...EMPTY_EDITOR,
      category: config.blogDefaultCategory || '',
      published: true,
    });
    setEditorOpen(true);
  }, [config.blogDefaultCategory]);

  const handleEdit = useCallback((post: BlogPost) => {
    setEditor({
      id: post.id,
      title: post.title,
      category: post.category,
      content: post.content,
      coverImage: post.coverImage || '',
      published: post.isPublished !== false,
    });
    setEditorOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editor.title.trim() || !editor.content.trim()) {
      showFeedback('error', isZh ? '标题和内容必填' : 'Title and content are required');
      return;
    }

    setSaving(true);
    try {
      if (editor.id) {
        await updateBlogPost(config, {
          id: editor.id,
          title: editor.title,
          category: editor.category || config.blogDefaultCategory,
          content: editor.content,
          coverImage: editor.coverImage,
          publish: editor.published,
        }, token);
        showFeedback('success', isZh ? '更新成功' : 'Updated');
      } else {
        await createBlogPost(config, {
          title: editor.title,
          category: editor.category || config.blogDefaultCategory,
          content: editor.content,
          coverImage: editor.coverImage,
          publish: editor.published,
        }, token);
        showFeedback('success', isZh ? '创建成功' : 'Created');
      }
      setEditorOpen(false);
      await loadPosts();
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [editor, config, token, isZh, showFeedback, loadPosts]);

  const handleDelete = useCallback(
    async (post: BlogPost) => {
      if (!confirm(isZh ? `确定删除「${post.title}」？` : `Delete "${post.title}"?`)) return;
      try {
        await deleteBlogPost(config, post.id, token);
        showFeedback('success', isZh ? '已删除' : 'Deleted');
        await loadPosts();
      } catch (err) {
        showFeedback('error', err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [config, token, isZh, showFeedback, loadPosts],
  );

  const handleTogglePublish = useCallback(
    async (post: BlogPost) => {
      try {
        await updateBlogPost(config, {
          id: post.id,
          publish: !post.isPublished,
        }, token);
        await loadPosts();
      } catch (err) {
        showFeedback('error', err instanceof Error ? err.message : 'Update failed');
      }
    },
    [config, token, loadPosts, showFeedback],
  );

  const handleTranslate = useCallback(
    async (post: BlogPost) => {
      setTranslating(post.id);
      try {
        const result = await translateBlogPost(config, post.id, post.authorId || undefined, token);
        const successCount = result.translated;
        showFeedback(
          'success',
          isZh
            ? `翻译完成：${successCount} 种语言`
            : `Translated to ${successCount} languages`,
        );
      } catch (err) {
        showFeedback('error', err instanceof Error ? err.message : 'Translation failed');
      } finally {
        setTranslating(null);
      }
    },
    [config, token, isZh, showFeedback],
  );

  const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(isZh ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-lg p-3 text-sm ${
            feedback.kind === 'success'
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isZh ? '博客管理' : 'Blog Manager'}</h1>
        <button
          type="button"
          onClick={handleNewPost}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          + {isZh ? '新文章' : 'New Post'}
        </button>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 w-full animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {isZh ? '暂无文章' : 'No posts yet'}
        </div>
      )}

      {!loading && !error && posts.length > 0 && (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="h-16 w-16 flex-none overflow-hidden rounded">
                  <img
                    src={post.coverImage || 'https://picsum.photos/seed/admin-default/100/100'}
                    alt={post.title}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="line-clamp-2 font-medium">{post.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {post.category && (
                      <span className="rounded-full bg-secondary px-2 py-0.5">{post.category}</span>
                    )}
                    <span>{formatDate(post.createdAt)}</span>
                    <span>{post.viewCount ?? 0} views</span>
                    {post.isPublished ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">
                        {isZh ? '已发布' : 'Published'}
                      </span>
                    ) : (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-yellow-700">
                        {isZh ? '草稿' : 'Draft'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTranslate(post)}
                  disabled={translating === post.id}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                >
                  {translating === post.id
                    ? isZh ? '翻译中...' : 'Translating...'
                    : isZh ? '翻译' : 'Translate'}
                </button>
                <button
                  type="button"
                  onClick={() => handleTogglePublish(post)}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                >
                  {post.isPublished
                    ? isZh ? '取消发布' : 'Unpublish'
                    : isZh ? '发布' : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => handleEdit(post)}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                >
                  {isZh ? '编辑' : 'Edit'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(post)}
                  className="rounded border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/5"
                >
                  {isZh ? '删除' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setEditorOpen(false)}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editor.id ? (isZh ? '编辑文章' : 'Edit Post') : (isZh ? '新文章' : 'New Post')}
              </h2>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{isZh ? '标题' : 'Title'}</label>
                <input
                  type="text"
                  value={editor.title}
                  onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={isZh ? '输入标题' : 'Enter title'}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{isZh ? '分类' : 'Category'}</label>
                <input
                  type="text"
                  value={editor.category}
                  onChange={(e) => setEditor({ ...editor, category: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={config.blogDefaultCategory || (isZh ? '输入分类' : 'Enter category')}
                />
              </div>

              <CoverUploader
                value={editor.coverImage}
                onChange={(url) => setEditor({ ...editor, coverImage: url })}
                token={token}
                locale={isZh ? 'zh' : 'en'}
                label={isZh ? '封面图片' : 'Cover Image'}
              />

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{isZh ? '正文' : 'Content'}</label>
                <RichTextEditor
                  value={editor.content}
                  onChange={(html) => setEditor({ ...editor, content: html })}
                  locale={isZh ? 'zh' : 'en'}
                  placeholder={editorPlaceholder}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editor.published}
                  onChange={(e) => setEditor({ ...editor, published: e.target.checked })}
                />
                {isZh ? '立即发布' : 'Publish immediately'}
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
                >
                  {isZh ? '取消' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? (isZh ? '保存中...' : 'Saving...') : isZh ? '保存' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
