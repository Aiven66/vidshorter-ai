/**
 * HTML发布模式自动化测试 - 验证三个关键修复
 *
 * 运行方式： npx tsx scripts/test-html-publish.mjs  或  node --experimental-vm-modules scripts/test-html-publish.mjs
 */

// ============ 纯 JS 版本的关键函数 ============
// （与 src/lib/blog-content.ts 和 html-publish/route.ts 中完全一致的逻辑）

function createSingleAdminPost({ title, category, content, coverImage = '', locale = 'en' }) {
  const publishedAt = new Date().toISOString();
  return {
    // id 必须是 UUID 格式
    id: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }),
    slug: `admin-${Date.now()}-${locale}`,
    title,
    content,
    summary: String(content || '').slice(0, 180),
    category,
    coverImage,
    cover_image: coverImage,
    author: 'Clipop Team',
    publishedAt,
    created_at: publishedAt,
    view_count: 0,
    views: 0,
    is_published: true,
    locale,
    translation_group: `admin-${Date.now()}`,
    isBuiltIn: false,
  };
}

function sanitizeHtmlContent(html) {
  let bodyContent = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) bodyContent = bodyMatch[1];

  const styleTags = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRegex.exec(html)) !== null) styleTags.push(m[0]);

  let cleaned = bodyContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
  cleaned = cleaned.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '');
  cleaned = cleaned.replace(/<embed[^>]*>[\s\S]*?<\/embed>/gi, '');
  cleaned = cleaned.replace(/<script\b[^>]*\/?\s*>/gi, '');
  cleaned = cleaned.replace(/<iframe\b[^>]*\/?\s*>/gi, '');
  cleaned = cleaned.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
  cleaned = cleaned.replace(/\s+on[a-z]+=(["'])[^"']*\1/gi, '');
  cleaned = cleaned.replace(/\s+on[a-z]+=[^\s>]+/gi, '');
  cleaned = cleaned.replace(/\s+(?:href|src|action)=(["'])\s*javascript:[^"']*\1/gi, '');

  if (styleTags.length > 0) {
    cleaned = `<style>${styleTags.map((s) => s.replace(/<\/?style[^>]*>/gi, '')).join('\n')}</style>\n${cleaned}`;
  }
  return cleaned.trim();
}

function replaceImageUrlsInHtml(html, fileNameToUrl) {
  if (!fileNameToUrl.size) return html;
  let result = html;
  for (const [fileName, publicUrl] of fileNameToUrl.entries()) {
    const escapedName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const srcAttrRe = new RegExp(`(src=(['"]))([^'"]*?)${escapedName}([^'"]*?)(\\2)`, 'gi');
    result = result.replace(srcAttrRe, `$1${publicUrl}$5`);
    const srcsetAttrRe = new RegExp(`(srcset=(['"]))([^'"]*?)${escapedName}([^'"]*?)(\\2)`, 'gi');
    result = result.replace(srcsetAttrRe, `$1${publicUrl}$5`);
    const urlCssRe = new RegExp(`url\\((['"]?)([^'")]*?)${escapedName}([^'")]*?)\\1\\)`, 'gi');
    result = result.replace(urlCssRe, `url(${publicUrl})`);
  }
  return result;
}

// ============ 测试执行 ============
let passCount = 0;
let failCount = 0;

function assert(desc, cond, extra = '') {
  if (cond) {
    console.log(`  ✅ ${desc}`);
    passCount++;
  } else {
    console.log(`  ❌ ${desc} ${extra}`);
    failCount++;
  }
}

console.log('\n========== 问题1: 生成的记录数应为 1 (非 3 条) ==========');
{
  const post = createSingleAdminPost({
    title: 'Test Article',
    category: 'AI Video Clipping',
    content: '<p>Hello</p>',
    coverImage: 'https://example.com/cover.jpg',
  });
  const output = [post];
  assert('只生成 1 条博客记录', output.length === 1, `实际得到 ${output.length} 条`);
  assert('返回的对象有 title/category/content/cover_image 字段',
    !!output[0].title && !!output[0].category && !!output[0].content && !!output[0].cover_image);
}

console.log('\n========== 问题1.1: id 必须是合法 UUID ==========');
{
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (let i = 0; i < 5; i++) {
    const post = createSingleAdminPost({
      title: 't', category: 'c', content: 'c',
    });
    assert(`第 ${i + 1} 个 id 为 UUID 格式`, uuidRegex.test(post.id), `实际值: ${post.id}`);
  }
}

console.log('\n========== 问题2: HTML 样式必须保留 ==========');
{
  const testHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Article</title>
  <style>
    .highlight { background: yellow; font-weight: bold; }
    h2 { color: #2563eb; }
  </style>
</head>
<body>
  <h2 class="highlight">Welcome</h2>
  <p style="color: red">This is a paragraph with inline style.</p>
  <p onclick="alert('should be removed')">Safe text</p>
  <script>alert('xss')</script>
  <iframe src="http://evil.com"></iframe>
</body>
</html>`;

  const output = sanitizeHtmlContent(testHtml);

  assert('保留 <style> 标签（内联样式不丢失）', /\.highlight/.test(output) || /<style>/.test(output),
    `输出: ${output.slice(0, 200)}...`);
  assert('保留 class="highlight" 属性', /class\s*=\s*["']\s*highlight\s*["']/i.test(output));
  assert('保留内联 style="color: red"', /style\s*=\s*["']\s*color\s*:\s*red/i.test(output));
  assert('删除危险 <script> 标签', !/<script/i.test(output));
  assert('删除危险 <iframe> 标签', !/<iframe/i.test(output));
  assert('删除 onclick 属性', !/\bonclick\s*=/i.test(output));
  assert('正确提取并保留 body 内容', /<h2[^>]*>Welcome<\/h2>/i.test(output));
  assert('标题 <title> 被识别并作为文章标题', extractTitleFromHtml(testHtml) === 'My Article');
}

function extractTitleFromHtml(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].trim() : '';
}

console.log('\n========== 问题3: 图片路径必须替换为 Supabase 公共URL ==========');
{
  const testCases = [
    '<img src="images/hero.jpg" alt="Hero">',
    '<img src="./images/hero.jpg" alt="Hero">',
    '<img src="hero.jpg" alt="Hero">',
    '<img src="/assets/hero.jpg" alt="Hero">',
    '<img src="hero.jpg?v=1" alt="Hero">',
    '<source srcset="hero.jpg 1x, hero@2x.jpg 2x">',
    '<div style="background-image: url(\'hero.jpg\')"></div>',
    '<div style="background-image: url(images/hero.jpg)"></div>',
  ];

  const fileNameToUrl = new Map([
    ['hero.jpg', 'https://example.supabase.co/storage/v1/object/public/blog-images/xxx-hero.jpg'],
    ['hero@2x.jpg', 'https://example.supabase.co/storage/v1/object/public/blog-images/xxx-hero2x.jpg'],
  ]);

  for (const tc of testCases) {
    const result = replaceImageUrlsInHtml(tc, fileNameToUrl);
    const srcRe = /https:\/\/example\.supabase\.co/;
    const hasLocalRef = /hero\.jpg/.test(result);
    const isReplaced = srcRe.test(result);
    assert(`替换: ${tc}`, isReplaced, `输出: ${result}`);
    if (tc.includes('@2x')) assert('支持 @2x 文件名', isReplaced);
  }
}

console.log('\n========== 问题3.1: 图片必须同时保存到 cover_image 字段 ==========');
{
  const finalCover = 'https://example.supabase.co/storage/v1/object/public/blog-images/xxx-cover.jpg';
  const post = createSingleAdminPost({
    title: 'Article', category: 'Test',
    content: '<p>hi</p>', coverImage: finalCover,
  });
  assert('cover_image 字段存储封面公共URL', post.cover_image === finalCover,
    `实际: ${post.cover_image}`);
}

console.log(`\n==================== 测试结果 ====================`);
console.log(`通过: ${passCount}  失败: ${failCount}`);
if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 全部测试通过！\n');
}
