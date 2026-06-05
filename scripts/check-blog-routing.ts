import assert from 'node:assert/strict';
import { getBuiltInBlogPost, getBuiltInBlogPosts, normalizeBlogRow, normalizeLocale } from '../src/lib/blog-content';
import { locales } from '../src/lib/i18n/index';

async function main() {
  for (const locale of locales) {
    const activeLocale = normalizeLocale(locale);
    const posts = getBuiltInBlogPosts(activeLocale);

    assert.ok(posts.length >= 16, `${locale} should expose built-in blog posts`);

    for (const post of posts) {
      const detail = getBuiltInBlogPost(post.id, activeLocale);
      assert.ok(detail, `${locale} detail should resolve ${post.id}`);
      assert.equal(detail?.locale, activeLocale, `${post.id} should resolve in current locale`);
      assert.equal(detail?.translation_group, post.translation_group, `${post.id} should keep translation group`);
    }
  }

  const englishPost = getBuiltInBlogPosts('en')[0];
  const zhDetailFromEnglishId = getBuiltInBlogPost(englishPost.id, 'zh');
  assert.ok(zhDetailFromEnglishId, 'Chinese detail should resolve an English suffixed id by slug');
  assert.equal(zhDetailFromEnglishId?.locale, 'zh');
  assert.equal(zhDetailFromEnglishId?.translation_group, englishPost.translation_group);

  const traditionalPost = getBuiltInBlogPosts('zh-Hant')[0];
  const normalizedRow = normalizeBlogRow({ id: traditionalPost.id, title: traditionalPost.title });
  assert.equal(normalizedRow.locale, 'zh-Hant', 'zh-Hant suffix should be inferred before zh');

  const englishPosts = getBuiltInBlogPosts('en');
  const categoryCounts = new Map<string, number>();
  for (const post of englishPosts) {
    categoryCounts.set(post.category, (categoryCounts.get(post.category) || 0) + 1);
  }
  assert.ok(
    [...categoryCounts.values()].some(count => count >= 2),
    'related-post recommendations should have same-category candidates'
  );

  console.log(`Blog routing checks passed for ${locales.length} locales.`);
}

main();
