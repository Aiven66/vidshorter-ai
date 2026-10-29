import assert from 'node:assert/strict';
import {
  buildBlogUrl,
  getBuiltInBlogPost,
  getBuiltInBlogPosts,
  isPostForLocale,
  normalizeBlogRow,
  normalizeLocale,
  slugifyTitle,
} from '../src/lib/blog-content';
import { locales } from '../src/lib/i18n/index';

async function main() {
  // 内置文章已清空（内容由管理员从后台发布），这里保证不会悄悄回退到旧种子数据。
  for (const locale of locales) {
    assert.deepEqual(getBuiltInBlogPosts(normalizeLocale(locale)), [], `${locale}: built-in posts must stay empty`);
  }
  assert.equal(getBuiltInBlogPost('legacy-seed-id', 'en'), null, 'unknown built-in id must resolve to null');

  // locale 归一化：繁体后缀必须先于 zh 命中，未知值回退 en。
  assert.equal(normalizeLocale('zh-Hant'), 'zh-Hant');
  assert.equal(normalizeLocale('zh-TW'), 'zh-Hant');
  assert.equal(normalizeLocale('zh-HK'), 'zh-Hant');
  assert.equal(normalizeLocale('zh-CN'), 'zh');
  assert.equal(normalizeLocale('zh'), 'zh');
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale(''), 'en');
  assert.equal(normalizeLocale('not-a-locale'), 'en');

  // 博客 URL 可稳定生成：ASCII / CJK 保留，空标题回退 untitled。
  assert.equal(
    buildBlogUrl({ id: '1234abcd-0000-0000-0000-000000000000', title: 'Hello World' }),
    '/blog/hello-world-1234abcd.html',
  );
  assert.equal(
    buildBlogUrl({ id: 'abcd1234-0000-0000-0000-000000000000', title: '中文标题' }),
    '/blog/中文标题-abcd1234.html',
  );
  assert.equal(slugifyTitle(''), 'untitled');
  assert.equal(slugifyTitle('  ***  '), 'untitled');

  // 数据库行归一化：显式 locale 生效，摘要从 HTML 抽取，默认已发布。
  const zhHant = normalizeBlogRow({ id: 'row-a', title: 'Traditional', content: '<p>你好</p>', locale: 'zh-Hant' });
  assert.equal(zhHant.locale, 'zh-Hant');
  assert.equal(zhHant.is_published, true);
  assert.equal(zhHant.isBuiltIn, false);
  assert.ok((zhHant.summary || '').length > 0);

  const zh = normalizeBlogRow({ id: 'row-b', title: 'Simplified', content: '<p>内容</p>', locale: 'zh' });
  assert.equal(zh.locale, 'zh');
  assert.equal(isPostForLocale(zh, 'zh'), true);
  assert.equal(isPostForLocale(zhHant, 'zh'), false);
  assert.equal(isPostForLocale(zh, 'zh-Hant'), false);

  console.log(`Blog routing checks passed for ${locales.length} locales.`);
}

main();
