import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import {
  createLocalizedAdminPosts,
  getBuiltInBlogPosts,
  isPostForLocale,
  normalizeBlogRow,
  stripHtml,
} from '../src/lib/blog-content';
import { locales } from '../src/lib/i18n';
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

const enPosts = getBuiltInBlogPosts('en');
const zhPosts = getBuiltInBlogPosts('zh');
const zhHantPosts = getBuiltInBlogPosts('zh-Hant');
assert.ok(enPosts.length >= 10);
assert.equal(zhPosts.length, enPosts.length);
assert.equal(zhHantPosts.length, enPosts.length);
assert.ok(enPosts.every(post => post.id.endsWith('-en')));
assert.ok(zhPosts.every(post => post.id.endsWith('-zh')));
assert.ok(zhHantPosts.every(post => post.id.endsWith('-zh-Hant')));
assert.ok(enPosts.every(post => !/[一-龥]/.test(post.title + stripHtml(post.content))));
assert.ok(zhPosts.some(post => /短视频|长视频|高光/.test(post.title + stripHtml(post.content))));
assert.ok(enPosts.every(post => /clipopai/i.test(post.title + stripHtml(post.content))));

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
assert.equal(isPostForLocale(legacyRow, 'en'), false);

const generated = createLocalizedAdminPosts({
  title: 'How clipopai Converts Long Videos into Highlight Shorts',
  category: 'AI Video Clipping',
  content: '<p>Paste a long video URL or upload a local video, then let AI find the strongest highlight moments.</p>',
  publish: true,
});
assert.equal(generated.length, locales.length);
assert.ok(generated.some(post => post.locale === 'en' && post.title === 'How clipopai Converts Long Videos into Highlight Shorts'));
assert.ok(generated.some(post => post.locale === 'zh' && /AI 高光短视频指南/.test(post.title)));
assert.ok(generated.some(post => post.locale === 'zh-Hant' && /AI 高光短影片指南/.test(post.title)));
assert.ok(generated.every(post => post.is_published === true));
assert.equal(new Set(generated.map(post => post.cover_image)).size, 1);

const blogListSource = readProjectFile('src/app/blog/page.tsx');
assert.match(blogListSource, /getBuiltInBlogPosts/);
assert.match(blogListSource, /isPostForLocale/);
assert.match(blogListSource, /normalizeBlogRow/);
assert.match(blogListSource, /fallbackPosts/);
assert.doesNotMatch(blogListSource, /clipop_seo_seeded_v2/);
assert.doesNotMatch(blogListSource, /seo-4/);

const blogDetailSource = readProjectFile('src/app/blog/[id]/page.tsx');
assert.match(blogDetailSource, /getBuiltInBlogPost/);
assert.match(blogDetailSource, /isPostForLocale/);
assert.match(blogDetailSource, /fallbackPost/);

const adminSource = readProjectFile('src/app/admin/page.tsx');
assert.match(adminSource, /Publish Blog Article/);
assert.match(adminSource, /createLocalizedAdminPosts/);
assert.match(adminSource, /\/api\/blog\/posts/);
assert.match(adminSource, /admin@126\.com/);

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
