import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import {
  createLocalizedAdminPosts,
  getBuiltInBlogPosts,
  isPostForLocale,
  normalizeBlogRow,
} from '../src/lib/blog-content';
import { POST as publishBlogPost } from '../src/app/api/blog/posts/route';

const root = process.cwd();

function readProjectFile(filePath: string) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

const navbarSource = readProjectFile('src/components/navbar.tsx');
assert.match(navbarSource, /https:\/\/tally\.so\/r\/5BMYVb/);
assert.match(navbarSource, /MessageSquare/);
assert.match(navbarSource, /target="_blank"/);
assert.match(navbarSource, /nav\.feedback/);

const commonSource = readProjectFile('src/lib/i18n/common.ts');
const zhSource = readProjectFile('src/lib/i18n/locales/zh.ts');
const zhHantSource = readProjectFile('src/lib/i18n/locales/zh-Hant.ts');
assert.match(commonSource, /feedback: 'Feedback'/);
assert.match(zhSource, /feedback: '用户反馈'/);
assert.match(zhHantSource, /feedback: '使用者回饋'/);

// 内置文章已清空（改由管理员通过后台发布），三个语言的列表都应返回空数组
const enPosts = getBuiltInBlogPosts('en');
const zhPosts = getBuiltInBlogPosts('zh');
const zhHantPosts = getBuiltInBlogPosts('zh-Hant');
assert.equal(enPosts.length, 0);
assert.equal(zhPosts.length, enPosts.length);
assert.equal(zhHantPosts.length, enPosts.length);
assert.ok(enPosts.every(post => post.id.endsWith('-en')));

const enRow = normalizeBlogRow({
  id: 'admin-test-en',
  title: 'English admin post',
  category: 'AI Video Clipping',
  content: '<p>English content</p>',
  is_published: true,
});
const legacyRow = normalizeBlogRow({
  id: 'legacy-post-without-locale',
  title: '旧中文文章',
  category: '旧分类',
  content: '<p>中文内容</p>',
  is_published: true,
});
assert.equal(isPostForLocale(enRow, 'en'), true);
assert.equal(isPostForLocale(enRow, 'zh'), false);
// 历史数据没有 locale 字段时按默认语言（英文）归入，避免老文章在列表里消失
assert.equal(legacyRow.locale, 'en');
assert.equal(isPostForLocale(legacyRow, 'en'), true);
assert.equal(isPostForLocale(legacyRow, 'zh'), false);

const generated = createLocalizedAdminPosts({
  title: 'How clipopai Converts Long Videos into Highlight Shorts',
  category: 'AI Video Clipping',
  content: '<p>Paste a long video URL or upload a local video, then let AI find the strongest highlight moments.</p>',
  publish: true,
});
// 只创建英文原文，多语言版本由发布后的翻译流程生成
assert.equal(generated.length, 1);
assert.equal(generated[0].locale, 'en');
assert.equal(generated[0].title, 'How clipopai Converts Long Videos into Highlight Shorts');
assert.equal(generated[0].is_published, true);
assert.ok(generated[0].cover_image, 'cover image must be generated');

const blogListSource = readProjectFile('src/app/blog/page.tsx');
assert.match(blogListSource, /getBuiltInBlogPosts/);
assert.match(blogListSource, /isPostForLocale/);
assert.match(blogListSource, /normalizeBlogRow/);
assert.match(blogListSource, /fallbackPosts/);
assert.doesNotMatch(blogListSource, /clipop_seo_seeded_v2/);
assert.doesNotMatch(blogListSource, /seo-4/);

const blogDetailSource = readProjectFile('src/app/blog/[id]/page.tsx');
assert.match(blogDetailSource, /getBuiltInBlogPost/);
assert.match(blogDetailSource, /getBuiltInBlogPosts/);
assert.match(blogDetailSource, /normalizeBlogRow/);

// 后台博客发布 UI 已迁到 /ax 管理端组件，/admin 只做跳转
const adminSource = readProjectFile('src/app/admin/page.tsx');
assert.match(adminSource, /\/ax\/login/);
const adminBlogSource = readProjectFile('src/components/admin-blog.tsx');
assert.match(adminBlogSource, /\/api\/blog\/posts/);
assert.match(adminBlogSource, /admin@126\.com/);

const routeSource = readProjectFile('src/app/api/blog/posts/route.ts');
assert.match(routeSource, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(routeSource, /createLocalizedAdminPosts/);
assert.match(routeSource, /Admin access required/);
assert.match(routeSource, /from\('blogs'\)/);
assert.match(routeSource, /upsert/);

async function main() {
  const originalServiceEnv = {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE,
    SUPABASE_SERVICE_ROLE_TOKEN: process.env.SUPABASE_SERVICE_ROLE_TOKEN,
  };
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE;
  delete process.env.SUPABASE_SERVICE_ROLE_TOKEN;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  const missingConfigResponse = await publishBlogPost(new NextRequest('https://www.clipopai.com/api/blog/posts', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer demo-token',
    },
    body: JSON.stringify({
      title: 'SEO title',
      category: 'AI Video Clipping',
      content: '<p>SEO content</p>',
    }),
  }));
  assert.equal(missingConfigResponse.status, 503);
  for (const [key, value] of Object.entries(originalServiceEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }

  console.log('Blog multilingual, feedback, and admin publishing checks passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
