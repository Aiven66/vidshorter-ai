import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSingleAdminPost } from '@/lib/blog-content';

const TRUSTED_ADMIN_EMAILS = new Set([
  'admin@vidshorter.ai',
  'admin@126.com',
  'admin@clipop.ai',
]);

function getServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_TOKEN ||
    ''
  );
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function getAdminUser(
  client: ReturnType<typeof createClient>,
  token: string
) {
  const demoPayload = decodeJwtPayload(token);
  if (
    typeof demoPayload?.email === 'string' &&
    TRUSTED_ADMIN_EMAILS.has(demoPayload.email.toLowerCase()) &&
    demoPayload?.role === 'admin'
  ) {
    return {
      id: typeof demoPayload.sub === 'string' ? demoPayload.sub : 'demo-admin-id',
      email: demoPayload.email,
      name: typeof demoPayload.name === 'string' ? demoPayload.name : 'Admin',
      role: 'admin',
    };
  }

  try {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData.user?.email) return null;

    const { data: userRow } = await client
      .from('users')
      .select('id, email, name, role')
      .eq('id', authData.user.id)
      .maybeSingle();

    const email = authData.user.email.toLowerCase();
    const role = userRow?.role || (TRUSTED_ADMIN_EMAILS.has(email) ? 'admin' : 'user');
    if (role !== 'admin') return null;

    return {
      id: userRow?.id || authData.user.id,
      email: authData.user.email,
      name: userRow?.name || authData.user.user_metadata?.name || 'Admin',
      role,
    };
  } catch {
    return null;
  }
}

function extractTitleFromHtml(html: string): string {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match ? match[1].trim() : '';
}

function detectLocaleFromHtml(html: string): 'en' | 'zh' | 'zh-Hant' {
  const htmlLang = html.match(/<html[^>]*\slang=(['"]?)([^'">\s]+)\1/i);
  if (htmlLang) {
    const lang = htmlLang[2].toLowerCase();
    if (lang.startsWith('zh') && (lang.includes('tw') || lang.includes('hk') || lang.includes('hant'))) return 'zh-Hant';
    if (lang.startsWith('zh')) return 'zh';
    if (lang.startsWith('en')) return 'en';
  }
  return 'en';
}

/**
 * 安全的 HTML 处理：
 * - 提取 body 内容
 * - 保留 <style> 标签但添加 .blog-article-scope 前缀（CSS scope 隔离）
 * - 删除危险元素：<script>/<iframe>/<object>/<embed>
 * - 删除 onclick 等事件属性
 * - 删除 href/src/action="javascript:..."
 * - 删除 <link>、<meta>、<base> 等 head 元素
 */
function sanitizeHtmlContent(html: string): string {
  let bodyContent = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    bodyContent = bodyMatch[1];
  }

  // 保留 <style> 标签但给所有选择器添加 .blog-article-scope 前缀
  // 这样样式只作用于文章内容区域，不会污染页头页尾
  let cleaned = bodyContent.replace(
    /<style([^>]*)>([\s\S]*?)<\/style>/gi,
    (_match, attrs: string, cssContent: string) => {
      const scopedCss = scopeCssSelectors(cssContent, '.blog-article-scope');
      return `<style${attrs}>${scopedCss}</style>`;
    }
  );

  // 删除 <link>（外部 CSS 引用会泄漏到全局）
  cleaned = cleaned.replace(/<link\b[^>]*\/?\s*>/gi, '');
  cleaned = cleaned.replace(/<meta\b[^>]*\/?\s*>/gi, '');
  cleaned = cleaned.replace(/<base\b[^>]*\/?\s*>/gi, '');
  cleaned = cleaned.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');

  // 删除危险元素
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
  cleaned = cleaned.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '');
  cleaned = cleaned.replace(/<embed[^>]*>[\s\S]*?<\/embed>/gi, '');
  cleaned = cleaned.replace(/<script\b[^>]*\/?\s*>/gi, '');
  cleaned = cleaned.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // 删除危险属性：onclick/onerror/onload/onmouseover 等 on*
  cleaned = cleaned.replace(/\s+on[a-z]+=(["'])[^"']*\1/gi, '');
  cleaned = cleaned.replace(/\s+on[a-z]+=[^\s>]+/gi, '');

  // 删除 href/src/action="javascript:"
  cleaned = cleaned.replace(/\s+(?:href|src|action)=(["'])\s*javascript:[^"']*\1/gi, '');

  return cleaned.trim();
}

/**
 * 给 CSS 选择器添加 scope 前缀，使样式只作用于指定容器内
 * 例如：h1 { color: red; } → .blog-article-scope h1 { color: red; }
 *       .my-class { ... } → .blog-article-scope .my-class { ... }
 *       body { ... } → .blog-article-scope { ... }
 *       @media (...) { h1 { ... } } → @media (...) { .blog-article-scope h1 { ... } }
 */
function scopeCssSelectors(css: string, scope: string): string {
  // 处理 @media / @supports / @layer 等嵌套规则
  let result = css.replace(
    /(@(?:media|supports|layer|container|keyframes|font-face)[^{]*)\{([\s\S]*?)\}\s*\}/gi,
    (match, atRule: string, innerContent: string) => {
      // @keyframes 和 @font-face 不需要 scope
      if (/@(keyframes|font-face)/i.test(atRule)) return match;
      // 对 @media / @supports / @layer / @container 内的选择器递归处理
      const scopedInner = scopeCssSelectors(innerContent, scope);
      return `${atRule}{${scopedInner}}`;
    }
  );

  // 处理普通 CSS 规则：选择器 { 声明 }
  result = result.replace(
    /([^{}@/]+)\{([^{}]*)\}/g,
    (match, selectors: string, declarations: string) => {
      // 跳过空规则
      if (!selectors.trim() || !declarations.trim()) return match;

      // 对每个选择器添加 scope 前缀
      const scopedSelectors = selectors
        .split(',')
        .map((sel: string) => {
          let s = sel.trim();
          if (!s) return s;

          // 将 body/html/:root 等全局选择器替换为 scope 容器
          if (/^(body|html|:root)$/i.test(s)) {
            return scope;
          }
          // 以 body/html/:root 开头的复合选择器
          s = s.replace(/^(body|html|:root)\s+/gi, '');

          return `${scope} ${s}`;
        })
        .join(', ');

      return `${scopedSelectors}{${declarations}}`;
    }
  );

  return result;
}

/**
 * 更鲁棒的图片文件名匹配与 URL 替换
 * 支持：相对路径、仅文件名、带查询参数、data: URL
 * 并且：后处理步骤对所有残留的非 http/非 data 图片做模糊匹配或安全处理
 */
function replaceImageUrlsInHtml(
  html: string,
  fileNameToUrl: Map<string, string>
): string {
  let result = html;

  // 1. 基于上传文件名的精确 + 前缀路径匹配（仅当有上传图片时执行）
  //    例如：filename = "hero.png" 匹配 src="hero.png", "./images/hero.png",
  //          "/assets/hero.png?v=2" 等
  if (fileNameToUrl.size > 0) {
    for (const [fileName, publicUrl] of fileNameToUrl.entries()) {
      const escapedName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const srcAttrRe = new RegExp(
        `(src=(['"]))([^'"]*?)${escapedName}([^'"]*?)(\\2)`,
        'gi'
      );
      result = result.replace(srcAttrRe, `$1${publicUrl}$5`);

      const srcsetAttrRe = new RegExp(
        `(srcset=(['"]))([^'"]*?)${escapedName}([^'"]*?)(\\2)`,
        'gi'
      );
      result = result.replace(srcsetAttrRe, `$1${publicUrl}$5`);

      const urlCssRe = new RegExp(`url\\((['"]?)([^'")]*?)${escapedName}([^'")]*?)\\1\\)`, 'gi');
      result = result.replace(urlCssRe, `url(${publicUrl})`);
    }
  }

  // 2. 替换 HTML 中的 data: URL 内联图片（如果有上传配图，优先用上传的 URL）
  if (fileNameToUrl.size > 0) {
    const uploadedUrls = Array.from(fileNameToUrl.values());
    let imgIdx = 0;
    result = result.replace(
      /src=(['"])data:image\/[^'"]+?\1/gi,
      (match) => {
        if (imgIdx < uploadedUrls.length) {
          const url = uploadedUrls[imgIdx++];
          return `src="${url}"`;
        }
        return match;
      }
    );
  }

  // 3. 后处理（始终运行）：将所有残留的 src="相对路径" 图片做模糊匹配
  //    - 不匹配任何上传图片 → 用 alt 文本占位（避免红色裂图）
  //    - 不匹配任何上传图片 → 删除该 src（保留 alt 文本作为占位）
  const basenameToUrl = new Map<string, string>();
  for (const [fileName, publicUrl] of fileNameToUrl.entries()) {
    const base = fileName
      .toLowerCase()
      .replace(/^.*[\\/]/, '')
      .replace(/[^a-z0-9]/gi, '');
    if (base) basenameToUrl.set(base, publicUrl);
  }

  result = result.replace(
    /<img\b([^>]*?)src=(['"])([^'"]+?)\2([^>]*)>/gi,
    (match, before, _quote, src, after) => {
      // 已经是 http/https/data: URL，保留不动
      if (/^(https?:|data:)/i.test(src)) return match;

      // 相对/本地路径，尝试模糊匹配
      const srcBase = src
        .toLowerCase()
        .replace(/^.*[\\/]/, '')
        .replace(/\?.*$/, '')
        .replace(/[^a-z0-9]/gi, '');
      if (srcBase && basenameToUrl.has(srcBase)) {
        return `<img${before}src="${basenameToUrl.get(srcBase)}"${after}>`;
      }

      // 无法匹配的图片：删除 src，用 alt 文本代替，避免显示红色裂图
      const altMatch = match.match(/\salt=(['"])([^'"]*?)\1/i);
      const altText = altMatch ? altMatch[2] : '';
      if (altText) {
        return `<div class="text-center text-sm text-muted-foreground my-2 italic">[image: ${altText}]</div>`;
      }
      return ''; // 无 alt 文本直接移除
    }
  );

  return result;
}

/**
 * 将 HTML 中的 data: URL 图片提取并上传到 Storage，返回替换后的 HTML
 */
async function uploadDataUrlImages(
  client: ReturnType<typeof createClient>,
  html: string
): Promise<{ html: string; uploadedUrls: string[] }> {
  const dataUrlRegex = /src=(['"])data:image\/([^;]+);base64,([^'"]+?)\1/gi;
  const matches = [...html.matchAll(dataUrlRegex)];

  if (matches.length === 0) return { html, uploadedUrls: [] };

  const uploadedUrls: string[] = [];
  let result = html;

  for (const match of matches) {
    const quote = match[1];
    const mimeType = `image/${match[2]}`;
    const base64Data = match[3];
    const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
    const fileName = `inline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;

    try {
      const buffer = Buffer.from(base64Data, 'base64');
      await ensureBucket(client, 'blog-images');
      const uniqueName = `images/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;

      const { error: uploadError } = await client.storage
        .from('blog-images')
        .upload(uniqueName, buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (!uploadError) {
        const { data: publicData } = client.storage.from('blog-images').getPublicUrl(uniqueName);
        if (publicData?.publicUrl) {
          uploadedUrls.push(publicData.publicUrl);
          // 替换整个 src="data:..." 为 src="publicUrl"
          const fullMatch = match[0];
          result = result.replace(fullMatch, `src=${quote}${publicData.publicUrl}${quote}`);
          continue;
        }
      }
      // 上传失败，保留原始 data: URL
    } catch {
      // 保留原始 data: URL
    }
  }

  return { html: result, uploadedUrls };
}

/**
 * 确保存储桶存在且为公开读，不存在则自动创建
 */
async function ensureBucket(
  client: ReturnType<typeof createClient>,
  bucket: string
): Promise<boolean> {
  try {
    const { data: buckets, error: listError } = await client.storage.listBuckets();
    if (listError) {
      console.error('List buckets error:', listError);
      return false;
    }
    const exists = (buckets || []).some((b) => b.name === bucket);
    if (exists) return true;

    const { error: createError } = await client.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024, // 10MB
    });
    if (createError) {
      console.error('Create bucket error:', createError);
      return false;
    }
    console.log(`Created storage bucket: ${bucket}`);
    return true;
  } catch (err) {
    console.error('Ensure bucket exception:', err);
    return false;
  }
}

async function uploadImageToStorage(
  client: ReturnType<typeof createClient>,
  bucket: string,
  file: File,
  prefix: string = ''
): Promise<string | null> {
  try {
    // 先确保 bucket 存在
    await ensureBucket(client, bucket);

    const bytes = await file.arrayBuffer();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff'].includes(ext) ? ext : 'jpg';
    const uniqueName = `${prefix || ''}${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^a-z0-9._-]/gi, '_')}`;

    const { error: uploadError } = await client.storage
      .from(bucket)
      .upload(uniqueName, Buffer.from(bytes), {
        contentType: file.type || `image/${safeExt}`,
        upsert: true,
      });

    if (uploadError) {
      console.error('Image upload error:', uploadError);
      // 如果上传失败，尝试 fallback 到 base64
      const base64 = Buffer.from(bytes).toString('base64');
      return `data:${file.type || `image/${safeExt}`};base64,${base64}`;
    }

    const { data: publicData } = client.storage.from(bucket).getPublicUrl(uniqueName);
    return publicData?.publicUrl || null;
  } catch (err) {
    console.error('Image upload exception:', err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adminUser = await getAdminUser(client, token);
  if (!adminUser) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    let title = (formData.get('title') as string || '').trim();
    let category = (formData.get('category') as string || '').trim();
    const htmlFile = formData.get('htmlFile') as File | null;
    const coverFile = formData.get('coverFile') as File | null;

    const additionalImages: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('img_') && value instanceof File && value.size > 0) {
        additionalImages.push(value);
      }
    }

    if (!htmlFile) {
      return NextResponse.json({ error: 'HTML file is required' }, { status: 400 });
    }

    const htmlContent = await htmlFile.text();
    if (!htmlContent.trim()) {
      return NextResponse.json({ error: 'HTML content is empty' }, { status: 400 });
    }

    if (!title) {
      title = extractTitleFromHtml(htmlContent) || 'Untitled Article';
    }
    if (!category) {
      category = 'AI Video Clipping';
    }

    const locale = detectLocaleFromHtml(htmlContent);

    // 确保 author 存在（通过 email 查，UUID 不会冲突
    let authorId: string;
    try {
      const { data: existingAuthor } = await client
        .from('users')
        .select('id')
        .eq('email', adminUser.email)
        .maybeSingle();

      if (existingAuthor?.id) {
        authorId = existingAuthor.id as string;
      } else {
        const newUuid = crypto.randomUUID();
        const { data: inserted } = await client
          .from('users')
          .insert({
            id: newUuid,
            email: adminUser.email,
            name: adminUser.name,
            role: adminUser.role,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .maybeSingle();
        authorId = (inserted?.id as string) || newUuid;
      }
    } catch {
      authorId = '00000000-0000-0000-0000-000000000001';
    }

    // ====== 1. 处理内容：提取 body + 保留 style ======
    let processedHtml = sanitizeHtmlContent(htmlContent);

    // ====== 2. 上传封面图片 ======
    let coverImageUrl = '';
    if (coverFile && coverFile.size > 0) {
      const result = await uploadImageToStorage(client, 'blog-images', coverFile, 'covers/');
      if (result) coverImageUrl = result;
    }

    // ====== 3. 上传配图 + 构建 filename -> URL 映射 ======
    const uploadedImageUrls: string[] = [];
    const fileNameToUrl: Map<string, string> = new Map();

    for (const file of additionalImages) {
      const result = await uploadImageToStorage(client, 'blog-images', file, 'images/');
      if (result) {
        uploadedImageUrls.push(result);
        fileNameToUrl.set(file.name, result);
      }
    }

    // ====== 4. 在 HTML 中替换图片引用（文件名 -> Storage URL + 后处理清理残留相对路径） ======
    processedHtml = replaceImageUrlsInHtml(processedHtml, fileNameToUrl);

    // ====== 4.5 上传 HTML 中内联的 data: URL 图片到 Storage ======
    const dataUrlResult = await uploadDataUrlImages(client, processedHtml);
    processedHtml = dataUrlResult.html;
    if (dataUrlResult.uploadedUrls.length > 0) {
      uploadedImageUrls.push(...dataUrlResult.uploadedUrls);
    }

    // 如果没有上传单独的封面，但有配图，用第一张配图作为封面
    const finalCover = coverImageUrl || uploadedImageUrls[0] || '';

    // ====== 5. 生成并插入博客记录 ======
    const post = createSingleAdminPost({
      title,
      category,
      content: processedHtml,
      coverImage: finalCover,
      publish: true,
      locale,
    });

    const row = {
      id: post.id,
      title: post.title,
      category: post.category,
      content: post.content,
      cover_image: post.cover_image || finalCover,
      author_id: authorId,
      is_published: true,
      view_count: 0,
      created_at: post.created_at,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = await client
      .from('blogs')
      .insert([row]);

    if (dbError) {
      console.error('DB error:', dbError);
      return NextResponse.json(
        { error: `DB error: ${dbError.message || String(dbError)}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      posts: [post],
      imageUploaded: uploadedImageUrls.length + (coverImageUrl ? 1 : 0),
      coverImage: finalCover,
      additionalImages: uploadedImageUrls,
      title,
      category,
      locale,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err) || 'Failed to publish article';
    console.error('Publish error:', message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
