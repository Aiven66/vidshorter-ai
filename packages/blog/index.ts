/**
 * @clipop/blog - Public API
 *
 * Universal blog package: CRUD client, HTML sanitization + CSS scoping,
 * multi-language translation (MyMemory), list/detail pages, cover uploader,
 * rich text editor, and admin blog manager.
 *
 * All branding/app configuration is injected via AppConfigProvider from
 * '@clipop/core'.
 */

export {
  fetchBlogPosts,
  fetchBlogPost,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  saveBlogTranslation,
  publishHtmlBlog,
  uploadBlogCover,
  translateBlogPost as translatePost,
  type BlogPostListResponse,
  type BlogPostDetailResponse,
  type CreateBlogPostInput,
  type UpdateBlogPostInput,
  type SaveTranslationInput,
  type CoverUploadResult,
  type TranslatePostResult,
} from './client';

export {
  sanitizeHtmlContent,
  scopeCssSelectors,
  sanitizeAndScopeHtml,
} from './sanitize';

export {
  translateText,
  translateBlogPost,
  translateBlogPostToAllLocales,
  PROTECTED_KEYWORDS,
  type TranslationResult,
} from './translate';

export {
  BlogListPage,
  type BlogListPageProps,
} from './blog-list-page';

export {
  BlogDetailPage,
  type BlogDetailPageProps,
} from './blog-detail-page';

export {
  CoverUploader,
  type CoverUploaderProps,
} from './cover-uploader';

export {
  RichTextEditor,
  type RichTextEditorProps,
} from './rich-text-editor';

export {
  AdminBlogManager,
  type AdminBlogManagerProps,
} from './admin-blog-manager';
