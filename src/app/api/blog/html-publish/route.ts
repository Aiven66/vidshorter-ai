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
  const metaCharset = html.match(/<meta[^>]*lang=(['"]?)([^'">\s]+)\1/i);
  if (metaCharset) {
    const lang = metaCharset[2].toLowerCase();
    if (lang.startsWith('zh') && (lang.includes('tw') || lang.includes('hk') || lang.includes('hant'))) return 'zh-Hant';
    if (lang.startsWith('zh')) return 'zh';
    if (lang.startsWith('en')) return 'en';
  }
  return 'en';
}

/**
 * 安全的HTML处理：
 * - 如果有 <body>，提取 body 内容
 * - 保留 <style>（在 <head> 中提取的样式也会被注入到内容顶部）
 * - 保留所有内联 style、class、data-* 属性
 * - 删除危险元素 <script>/<iframe>/<object>/<embed>
 * - 删除 onclick/onerror 等事件处理器属性
 */
function sanitizeHtmlContent(html: string): string {
  let bodyContent = html;

  // 先提取 body
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    bodyContent = bodyMatch[1];
  }

  // 提取 <style> 内容（包括 head 里的）
  const styleTags: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch;
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    styleTags.push(styleMatch[0]);
  }

  // 删除危险元素
  let cleaned = bodyContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
  cleaned = cleaned.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '');
  cleaned = cleaned.replace(/<embed[^>]*>[\s\S]*?<\/embed>/gi, '');
  // 自闭合的 <script>
  cleaned = cleaned.replace(/<script\b[^>]*\/?\s*>/gi, '');
  cleaned = cleaned.replace(/<iframe\b[^>]*\/?\s*>/gi, '');
  cleaned = cleaned.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // 删除危险属性：onclick/onerror/onload/onmouseover 等 on*
  cleaned = cleaned.replace(
    /\s+on[a-z]+=(["'])[^"']*\1/gi,
    ''
  );
  cleaned = cleaned.replace(
    /\s+on[a-z]+=[^\s>]+/gi,
    ''
  );

  // 删除 form action="javascript:"
  cleaned = cleaned.replace(
    /\s+(?:href|src|action)=(["'])\s*javascript:[^"']*\1/gi,
    ''
  );

  // 将提取到的 <style> 注入到内容最前面，便于样式生效
  if (styleTags.length > 0) {
    cleaned = `<style>${styleTags.map(s => s.replace(/<\/?style[^>]*>/gi, '')).join('\n')}</style>\n${cleaned}`;
  }

  return cleaned.trim();
}

/**
 * 更鲁棒的图片文件名匹配与URL替换：
 * - 支持 src="images/cover.jpg"（相对路径）
 * - 支持 src="./images/cover.jpg"（相对路径含 ./）
 * - 支持 src="cover.jpg"（仅文件名）
 * - 支持 srcset 中的多路径
 */
function replaceImageUrlsInHtml(
  html: string,
  fileNameToUrl: Map<string, string>
): string {
  if (fileNameToUrl.size === 0) return html;

  let result = html;

  // 为每个文件执行替换：匹配所有可能的相对路径 + 文件名
  for (const [fileName, publicUrl] of fileNameToUrl.entries()) {
    const escapedName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. 替换 <img src="...">、<source srcset="..."> 中的完整URL/相对URL
    // pattern: src="(prefix)filename" 或 src="(prefix)filename?query"
    const srcAttrRe = new RegExp(
      `(src=(['"]))([^'"]*?)${escapedName}([^'"]*?)(\\2)`,
      'gi'
    );
    result = result.replace(srcAttrRe, `$1${publicUrl}$5`);

    // 2. 替换 srcset 中的类似格式
    const srcsetAttrRe = new RegExp(
      `(srcset=(['"]))([^'"]*?)${escapedName}([^'"]*?)(\\2)`,
      'gi'
    );
    result = result.replace(srcsetAttrRe, `$1${publicUrl}$5`);

    // 3. 替换 background-image / url("...") 中的引用
    const urlCssRe = new RegExp(`url\\((['"]?)([^'")]*?)${escapedName}([^'")]*?)\\1\\)`, 'gi');
    result = result.replace(urlCssRe, `url(${publicUrl})`);
  }

  return result;
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

    // Resolve author_id (always lookup by email to get a real UUID)
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
        // Generate a proper UUID for the admin if they don't exist in users table
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
      // Last resort: use a fixed system UUID
      authorId = '00000000-0000-0000-0000-000000000001';
    }

    // ====== 图片上传与替换 ======
    // 1) 先处理内容（保留 <style>，删除危险元素）
    let processedHtml = sanitizeHtmlContent(htmlContent);

    // 2) 上传封面图片到 Supabase Storage
    let coverImageUrl = '';
    try {
      if (coverFile && coverFile.size > 0) {
        const coverBytes = await coverFile.arrayBuffer();
        const ext = coverFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) ? ext : 'jpg';
        const coverPath = `blog/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-cover.${safeExt}`;

        const { error: uploadError } = await client.storage
          .from('blog-images')
          .upload(coverPath, Buffer.from(coverBytes), {
            contentType: coverFile.type || `image/${safeExt}`,
            upsert: true,
          });

        if (!uploadError) {
          const { data: publicData } = client.storage.from('blog-images').getPublicUrl(coverPath);
          coverImageUrl = publicData?.publicUrl || '';
        }
      }
    } catch {
      coverImageUrl = '';
    }

    // 3) 上传其他配图，并保存 文件名 -> 公共URL 映射
    const uploadedImageUrls: string[] = [];
    const fileNameToUrl: Map<string, string> = new Map();

    try {
      for (const file of additionalImages) {
        try {
          const bytes = await file.arrayBuffer();
          const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
          const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) ? ext : 'jpg';
          const path = `blog/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

          const { error: uploadError } = await client.storage
            .from('blog-images')
            .upload(path, Buffer.from(bytes), {
              contentType: file.type || `image/${safeExt}`,
              upsert: true,
            });

          if (!uploadError) {
            const { data: publicData } = client.storage.from('blog-images').getPublicUrl(path);
            const publicUrl = publicData?.publicUrl || '';
            if (publicUrl) {
              uploadedImageUrls.push(publicUrl);
              fileNameToUrl.set(file.name, publicUrl);
            }
          }
        } catch {
          // skip this image
        }
      }
    } catch {
      // ignore
    }

    // 4) 在 HTML 中替换图片引用：文件名 -> Supabase 公共URL
    if (fileNameToUrl.size > 0) {
      processedHtml = replaceImageUrlsInHtml(processedHtml, fileNameToUrl);
    }

    // 5) 如没有上传独立封面，用第一张配图作为封面
    const finalCover = coverImageUrl || uploadedImageUrls[0] || '';

    // ====== 生成1条博客记录（HTML上传模式：不自动生成3语言版本） ======
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
      cover_image: post.cover_image,
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
