# @clipop/blog

Universal blog package: CRUD API client, HTML rich-text sanitization with CSS scope isolation, multi-language translation (via MyMemory Translation API), list & detail pages, cover image uploader, contentEditable-based rich text editor, and an admin blog manager.

Zero brand coupling — all app-specific configuration (app name, default category, target translation locales) is injected via `useAppConfig()` from `@clipop/core`. No `process.env` access in package code.

## Installation

```bash
pnpm add @clipop/blog @clipop/core react @supabase/supabase-js
```

In a monorepo:

```json
{
  "dependencies": {
    "@clipop/blog": "workspace:*",
    "@clipop/core": "workspace:*"
  }
}
```

## Configuration

```tsx
import { AppConfigProvider } from '@clipop/core';

<AppConfigProvider value={{
  appName: 'MyApp',
  appUrl: 'https://myapp.com',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY, // server-only
  blogImageBucket: 'blog-images',
  blogDefaultCategory: 'Tutorials',
  blogTranslationLocales: ['zh', 'ja', 'ko', 'de', 'fr'], // empty = no auto-translate
  defaultLocale: 'en',
  supportedLocales: ['en', 'zh', 'ja'],
}}>
  {children}
</AppConfigProvider>
```

## Host app API routes

The host app must implement these HTTP endpoints (paths are hardcoded in `client.ts`):

| Method | Path                              | Body / Query                                  | Returns                                                                |
|--------|-----------------------------------|-----------------------------------------------|------------------------------------------------------------------------|
| GET    | `/api/blog/posts`                 | `?page=&pageSize=&category=&locale=`           | `{ posts: BlogPost[], total, page, pageSize, isAdmin }`                |
| POST   | `/api/blog/posts`                 | `{ title, category?, content, coverImage?, publish? }` | `{ posts: BlogPost[] }`                                       |
| PATCH  | `/api/blog/posts`                 | `{ id, title?, category?, content?, coverImage?, publish? }` | `{ post: BlogPost }`                                  |
| DELETE | `/api/blog/posts`                 | —                                             | `{ success: boolean }` (clear all — host may also implement `/api/blog/{id}` for single delete) |
| GET    | `/api/blog/posts/{id}`            | —                                             | `{ post: BlogPost, translations: BlogPost[], isAdmin }`                |
| PATCH  | `/api/blog/posts/{id}`            | `{ locale, title, category, content, coverImage?, publish? }` | `{ translation: BlogPost }`                                  |
| DELETE | `/api/blog/{id}`                  | —                                             | `{ ok, deleted, count }` (deletes root + translations)                 |
| POST   | `/api/blog/html-publish`          | `multipart/form-data`: title, category, htmlFile, coverFile?, img_*? | `{ posts: BlogPost[], coverImage, additionalImages }` |
| POST   | `/api/blog/upload-cover`          | `multipart/form-data` with `file` OR JSON `{ file, fileName, mimeType }` | `{ cover_image, storage, path? }`                |
| POST   | `/api/blog/translate`             | `{ sourcePostId, authorId? }`                 | `{ total, successCount, failCount, results }`                          |
| POST   | `/api/blog/posts/{id}/view`       | —                                             | `{ ok: true }` (optional — best-effort view counter)                   |

All write endpoints require `Authorization: Bearer <token>` header. The host app is responsible for verifying the token and checking admin role.

## Database table

```sql
create table if not exists blogs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  content text,
  cover_image text,
  author_id text,
  is_published boolean default false,
  view_count integer default 0,
  locale varchar(10) default 'en',
  parent_id uuid, -- references blogs(id), null for root posts
  created_at timestamptz default now(),
  updated_at timestamptz
);

create index on blogs (created_at desc);
create index on blogs (category);
create index on blogs (parent_id);
create index on blogs (locale);
```

A `blogs` row with `parent_id = NULL` is a root English post. Translation rows have `parent_id` pointing to the root and `locale` set to the target language.

## Client API

```ts
import {
  fetchBlogPosts, fetchBlogPost,
  createBlogPost, updateBlogPost, deleteBlogPost, saveBlogTranslation,
  publishHtmlBlog, uploadBlogCover, translatePost,
} from '@clipop/blog';

// Paginated list
const { posts, total, page, pageSize } = await fetchBlogPosts(config, { page: 1, pageSize: 10 });

// Single post with translations
const { post, translations, isAdmin } = await fetchBlogPost(config, id, token);

// CRUD
await createBlogPost(config, { title, category, content, coverImage, publish: true }, token);
await updateBlogPost(config, { id, title, content, publish: false }, token);
await deleteBlogPost(config, id, token);

// Save translation
await saveBlogTranslation(config, rootId, { locale: 'zh', title, content }, token);

// HTML publish with images
const formData = new FormData();
formData.append('title', 'My Post');
formData.append('category', 'Tutorials');
formData.append('htmlFile', htmlFile);
formData.append('coverFile', coverFile);
await publishHtmlBlog(config, formData, token);

// Cover upload
const { coverImage, storage } = await uploadBlogCover(config, file, token);
// or: await uploadBlogCover(config, base64String, token);

// Trigger server-side translation
const { translated, locales } = await translatePost(config, sourcePostId, undefined, token);
```

## HTML sanitization & CSS scope

```ts
import { sanitizeHtmlContent, scopeCssSelectors, sanitizeAndScopeHtml } from '@clipop/blog';

// Strip dangerous tags & attributes
const clean = sanitizeHtmlContent(rawHtml);

// Scope CSS selectors inside a <style> block
const scoped = scopeCssSelectors('h1 { color: red; } .foo { margin: 0; }', 'blog-article-scope');
// → '.blog-article-scope h1 { color: red; } .blog-article-scope .foo { margin: 0; }'

// Combined helper: sanitize + scope all <style> blocks in one pass
const ready = sanitizeAndScopeHtml(rawHtml, 'blog-article-scope');
```

`sanitizeHtmlContent`:
- Extracts `<body>` contents if present
- Removes `<script>`, `<iframe>`, `<object>`, `<embed>`, `<noscript>` elements
- Removes `<link>`, `<meta>`, `<base>`, `<title>` elements
- Strips all `on*` event handler attributes (`onclick`, `onerror`, etc.)
- Removes `href="javascript:..."`, `src="javascript:..."`, `action="javascript:..."` attributes
- Preserves `<style>` blocks (callers should run `scopeCssSelectors` to isolate)

`scopeCssSelectors`:
- Adds `.{scopeClass}` prefix to every selector
- Replaces `body`, `html`, `:root` with `.{scopeClass}`
- Recursively scopes selectors inside `@media`, `@supports`, `@layer`, `@container`
- Skips `@keyframes` and `@font-face` (kept unchanged)

## Translation utilities

```ts
import { translateText, translateBlogPost, translateBlogPostToAllLocales, PROTECTED_KEYWORDS } from '@clipop/blog';

// Translate a plain-text string
const zh = await translateText('Hello world', 'en', 'zh');

// Translate a blog post (title + category + HTML content)
const result = await translateBlogPost(config, { title, category, content }, 'zh', 'en');
// result.title, result.category, result.content, result.success, result.error

// Translate to all configured target locales
const all = await translateBlogPostToAllLocales(config, { title, category, content }, 'en');
```

Translation limits (MyMemory free tier):
- 5000 chars/day without email
- Each request max 500 chars (longer text is chunked on sentence boundaries)
- 1000ms delay between requests (built-in throttle)
- On error returns original text
- Brand keywords (`YouTube`, `Google`, `SaaS`, `SEO`, `API`, etc.) are protected from translation

## Components

### `<BlogListPage>`

```tsx
import { BlogListPage } from '@clipop/blog';

<BlogListPage
  locale="zh"
  pageSize={10}
  onPostClick={(post) => router.push(`/blog/${post.id}`)}
  onPageChange={(page) => console.log('Page:', page)}
/>;
```

Renders a category-filterable grid of post cards with pagination. Empty state shows "No posts yet".

### `<BlogDetailPage>`

```tsx
import { BlogDetailPage } from '@clipop/blog';

<BlogDetailPage
  id={postId}
  locale="zh"
  onBack={() => router.push('/blog')}
  onRelatedPostClick={(post) => router.push(`/blog/${post.id}`)}
/>;
```

Fetches root + translations, picks the best version for the requested locale (fallback English → any), renders content with `dangerouslySetInnerHTML` inside a `.blog-article-scope` container. Loads up to 4 related posts by category.

### `<CoverUploader>`

```tsx
import { CoverUploader } from '@clipop/blog';

<CoverUploader
  value={coverImage}
  onChange={setCoverImage}
  token={authToken}
  label="Cover Image"
  locale="en"
  maxFileSize={5 * 1024 * 1024} // 5MB
/>;
```

Click-to-select or drag-and-drop image upload. On server upload failure, falls back to base64 data URL via FileReader.

### `<RichTextEditor>`

```tsx
import { RichTextEditor } from '@clipop/blog';

<RichTextEditor
  value={content}
  onChange={setContent}
  locale="en"
  placeholder="Start writing your article..."
/>;
```

Toolbar: bold, italic, underline, H1, H2, link, bullet list, ordered list, blockquote. Uses `document.execCommand` (deprecated but still works in all major browsers as of 2025). No external dependencies.

### `<AdminBlogManager>`

```tsx
import { AdminBlogManager } from '@clipop/blog';

<AdminBlogManager token={authToken} locale="zh" />;
```

Full admin UI:
- Lists all posts (published + drafts) with edit / delete / publish / translate buttons
- "New Post" opens a modal with title + category + cover uploader + rich text editor + publish checkbox
- "Translate" button triggers server-side `/api/blog/translate` for the source post

## License

MIT
