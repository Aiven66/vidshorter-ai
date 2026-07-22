/**
 * @clipop/blog - Client API layer
 *
 * All methods call the host app's API routes (hardcoded paths like
 * `/api/blog/...`). The host app is responsible for translating these calls
 * into Supabase queries — see README.md for the route contract.
 */

import type { AppConfig, BlogPost, Locale } from '@clipop/core';

const JSON_HEADERS: HeadersInit = { 'Content-Type': 'application/json' };

export interface BlogPostListResponse {
  posts: BlogPost[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BlogPostDetailResponse {
  post: BlogPost;
  translations: BlogPost[];
  isAdmin?: boolean;
}

export interface CreateBlogPostInput {
  title: string;
  category?: string;
  content: string;
  coverImage?: string;
  publish?: boolean;
}

export interface UpdateBlogPostInput {
  id: string;
  title?: string;
  category?: string;
  content?: string;
  coverImage?: string;
  publish?: boolean;
}

export interface SaveTranslationInput {
  locale: Locale;
  title?: string;
  category?: string;
  content?: string;
  coverImage?: string;
  publish?: boolean;
}

export interface CoverUploadResult {
  coverImage: string;
  storage: 'supabase' | 'base64';
  path?: string;
}

export interface TranslatePostResult {
  translated: number;
  locales: string[];
  results: Array<{ locale: string; success: boolean; error?: string }>;
}

function authHeaders(token?: string | null): HeadersInit {
  if (!token) return { ...JSON_HEADERS };
  return { ...JSON_HEADERS, Authorization: `Bearer ${token}` };
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return path;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `${path}?${qs}` : path;
}

async function handleJsonError(res: Response): Promise<never> {
  let message = `HTTP ${res.status}`;
  try {
    const data = await res.json();
    message = data?.error || message;
  } catch {
    // ignore parse errors
  }
  throw new Error(message);
}

/**
 * Fetch a paginated list of blog posts.
 *
 * Calls: GET /api/blog/posts?page=N&pageSize=N&category=...&locale=...
 */
export async function fetchBlogPosts(
  _config: AppConfig,
  params: {
    page?: number;
    pageSize?: number;
    category?: string;
    locale?: Locale;
  } = {},
): Promise<BlogPostListResponse> {
  const url = buildUrl('/api/blog/posts', {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 10,
    category: params.category,
    locale: params.locale,
  });

  const res = await fetch(url, { headers: JSON_HEADERS });
  if (!res.ok) await handleJsonError(res);
  const data = await res.json() as BlogPostListResponse & { posts?: BlogPost[] };
  return {
    posts: data.posts || [],
    total: data.total ?? 0,
    page: data.page ?? params.page ?? 1,
    pageSize: data.pageSize ?? params.pageSize ?? 10,
  };
}

/**
 * Fetch a single blog post (root + translations).
 *
 * Calls: GET /api/blog/posts/{id}
 */
export async function fetchBlogPost(
  _config: AppConfig,
  id: string,
  token?: string | null,
): Promise<BlogPostDetailResponse> {
  const res = await fetch(`/api/blog/posts/${encodeURIComponent(id)}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) await handleJsonError(res);
  return (await res.json()) as BlogPostDetailResponse;
}

/**
 * Create a new blog post (English root, no parent_id).
 *
 * Calls: POST /api/blog/posts
 */
export async function createBlogPost(
  _config: AppConfig,
  payload: CreateBlogPostInput,
  token: string,
): Promise<BlogPost[]> {
  const res = await fetch('/api/blog/posts', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleJsonError(res);
  const data = await res.json() as { posts?: BlogPost[]; post?: BlogPost };
  if (data.posts) return data.posts;
  if (data.post) return [data.post];
  return [];
}

/**
 * Update an existing blog post (root only).
 *
 * Calls: PATCH /api/blog/posts
 */
export async function updateBlogPost(
  _config: AppConfig,
  payload: UpdateBlogPostInput,
  token: string,
): Promise<BlogPost> {
  const res = await fetch('/api/blog/posts', {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleJsonError(res);
  const data = await res.json() as { post: BlogPost };
  return data.post;
}

/**
 * Delete a blog post (root + all translations).
 *
 * Calls: DELETE /api/blog/{id}
 */
export async function deleteBlogPost(
  _config: AppConfig,
  id: string,
  token: string,
): Promise<void> {
  const res = await fetch(`/api/blog/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) await handleJsonError(res);
}

/**
 * Save (create or update) a translation for a root post.
 *
 * Calls: PATCH /api/blog/posts/{rootId}
 */
export async function saveBlogTranslation(
  _config: AppConfig,
  rootId: string,
  payload: SaveTranslationInput,
  token: string,
): Promise<BlogPost> {
  const res = await fetch(`/api/blog/posts/${encodeURIComponent(rootId)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleJsonError(res);
  const data = await res.json() as { translation: BlogPost };
  return data.translation;
}

/**
 * Publish a complete HTML article (multipart/form-data upload).
 *
 * Calls: POST /api/blog/html-publish
 *
 * `formData` should contain at minimum:
 *   - title: string
 *   - category: string
 *   - htmlFile: File (UTF-8 HTML file)
 *   - coverFile?: File (cover image)
 *   - img_*?: File (additional images referenced in HTML)
 */
export async function publishHtmlBlog(
  _config: AppConfig,
  formData: FormData,
  token: string,
): Promise<BlogPost[]> {
  const res = await fetch('/api/blog/html-publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) await handleJsonError(res);
  const data = await res.json() as { posts?: BlogPost[]; post?: BlogPost };
  if (data.posts) return data.posts;
  if (data.post) return [data.post];
  return [];
}

/**
 * Upload a blog cover image (or accept a base64 data URL fallback).
 *
 * Calls: POST /api/blog/upload-cover (multipart/form-data)
 *
 * Accepts a File or a base64 string (sent as JSON).
 */
export async function uploadBlogCover(
  _config: AppConfig,
  file: File | string,
  token: string,
): Promise<CoverUploadResult> {
  if (typeof file === 'string') {
    const res = await fetch('/api/blog/upload-cover', {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, fileName: 'cover.png' }),
    });
    if (!res.ok) await handleJsonError(res);
    const data = await res.json() as { cover_image: string; storage: string; path?: string };
    return { coverImage: data.cover_image, storage: data.storage as 'supabase' | 'base64', path: data.path };
  }

  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/blog/upload-cover', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) await handleJsonError(res);
  const data = await res.json() as { cover_image: string; storage: string; path?: string };
  return { coverImage: data.cover_image, storage: data.storage as 'supabase' | 'base64', path: data.path };
}

/**
 * Trigger server-side translation of a root post to all configured target locales.
 *
 * Calls: POST /api/blog/translate
 */
export async function translateBlogPost(
  config: AppConfig,
  sourcePostId: string,
  authorId?: string,
  token?: string | null,
): Promise<TranslatePostResult> {
  const headers: HeadersInit = token ? { ...JSON_HEADERS, Authorization: `Bearer ${token}` } : JSON_HEADERS;
  const res = await fetch('/api/blog/translate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ sourcePostId, authorId }),
  });
  if (!res.ok) await handleJsonError(res);
  const data = await res.json() as {
    total: number;
    successCount: number;
    failCount: number;
    results: Array<{ locale: string; success: boolean; error?: string }>;
  };
  const successes = (data.results || []).filter((r) => r.success);
  return {
    translated: successes.length,
    locales: successes.map((r) => r.locale),
    results: data.results || [],
  };
}

// Used by the unused import warning suppression in some bundlers.
export const _internal = { buildUrl, authHeaders, JSON_HEADERS };
