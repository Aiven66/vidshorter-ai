import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { translateBlogPost, TRANSLATION_TARGET_LOCALES } from '@/lib/blog-translate';
import type { Locale } from '@/lib/i18n';
import { createSingleAdminPost } from '@/lib/blog-content';

function getServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_TOKEN ||
    ''
  );
}

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split('.')[1];
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function getAdminUser(client: ReturnType<typeof createClient>, token: string) {
  const demoPayload = decodeJwtPayload(token);
  const adminEmails = ['admin@126.com', 'admin@vidshorter.ai'];
  if (
    demoPayload?.email &&
    adminEmails.includes(demoPayload.email as string) &&
    (demoPayload?.role === 'admin' || demoPayload?.iss === 'clipop-demo')
  ) {
    return {
      id: typeof demoPayload.sub === 'string' ? demoPayload.sub : 'demo-admin-id',
      email: demoPayload.email as string,
      name: typeof demoPayload.name === 'string' ? demoPayload.name : 'Admin',
      role: 'admin',
    };
  }

  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user?.email) return null;

  const { data: userRow } = await client
    .from('users')
    .select('id,email,name,role')
    .eq('id', authData.user.id)
    .maybeSingle();

  const role = userRow?.role || (adminEmails.includes(authData.user.email) ? 'admin' : 'user');
  if (role !== 'admin') return null;

  return {
    id: userRow?.id || authData.user.id,
    email: authData.user.email,
    name: userRow?.name || authData.user.user_metadata?.name || 'Admin',
    role,
  };
}

async function ensureAuthor(client: ReturnType<typeof createClient>, user: { id: string; email: string; name: string; role: string }) {
  const { data: existingByEmail } = await client
    .from('users')
    .select('id')
    .eq('email', user.email)
    .maybeSingle();

  if (existingByEmail?.id) return existingByEmail.id as string;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);
  const safeId = isUuid ? user.id : crypto.randomUUID();

  const { data, error } = await client
    .from('users')
    .insert({
      id: safeId,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return (data?.id as string) || safeId;
}

/**
 * POST /api/blog/translate
 * 翻译博客文章到所有目标语言并保存到数据库
 *
 * 请求体：
 * - sourcePostId: 源英文文章 ID（必须）
 * - authorId: 作者 ID（可选，默认从当前管理员获取）
 *
 * 翻译结果以 parent_id 关联到源英文文章，前台按 locale 过滤。
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
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
    const body = await req.json() as {
      title?: string;
      category?: string;
      content?: string;
      coverImage?: string;
      sourcePostId?: string;
      authorId?: string;
    };

    const sourcePostId = body.sourcePostId;
    if (!sourcePostId) {
      return NextResponse.json({ error: 'sourcePostId is required' }, { status: 400 });
    }

    // 获取源英文文章
    const { data: sourcePost, error: sourceError } = await client
      .from('blogs')
      .select('id,title,category,content,cover_image,author_id,locale,parent_id')
      .eq('id', sourcePostId)
      .maybeSingle();

    if (sourceError || !sourcePost) {
      return NextResponse.json({ error: 'Source post not found' }, { status: 404 });
    }

    const title = String(sourcePost.title || '').trim();
    const category = String(sourcePost.category || 'AI Video Clipping').trim();
    const content = String(sourcePost.content || '').trim();
    const coverImage = String(sourcePost.cover_image || '');
    const authorId = body.authorId || sourcePost.author_id;

    if (!title || !content) {
      return NextResponse.json({ error: 'Source post title and content are empty' }, { status: 400 });
    }

    // 获取或创建 author
    const finalAuthorId = authorId || await ensureAuthor(client, adminUser);

    // 删除该文章已有的旧翻译（避免重复）
    await client
      .from('blogs')
      .delete()
      .eq('parent_id', sourcePostId)
      .neq('id', sourcePostId);

    // 翻译到所有目标语言
    const results: { locale: string; postId: string; title: string; success: boolean; error?: string }[] = [];
    const errors: string[] = [];

    for (const targetLocale of TRANSLATION_TARGET_LOCALES) {
      try {
        const result = await translateBlogPost(title, category, content, targetLocale, 'en');

        if (result.success) {
          const post = createSingleAdminPost({
            title: result.title,
            category: result.category,
            content: result.content,
            coverImage: coverImage || undefined,
            publish: true,
            locale: targetLocale,
          });

          const row = {
            id: post.id,
            title: post.title,
            category: post.category,
            content: post.content,
            cover_image: post.cover_image || coverImage,
            author_id: finalAuthorId,
            is_published: true,
            view_count: 0,
            locale: targetLocale,
            parent_id: sourcePostId,
            created_at: post.created_at,
            updated_at: new Date().toISOString(),
          };

          const { error: dbError } = await client
            .from('blogs')
            .insert([row]);

          if (dbError) {
            errors.push(`${targetLocale}: DB error - ${dbError.message}`);
            results.push({ locale: targetLocale, postId: '', title: result.title, success: false, error: dbError.message });
          } else {
            results.push({ locale: targetLocale, postId: post.id, title: result.title, success: true });
          }
        } else {
          errors.push(`${targetLocale}: ${result.error || 'Translation failed'}`);
          results.push({ locale: targetLocale, postId: '', title: result.title, success: false, error: result.error });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${targetLocale}: ${msg}`);
        results.push({ locale: targetLocale, postId: '', title, success: false, error: msg });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return NextResponse.json({
      total: TRANSLATION_TARGET_LOCALES.length,
      successCount,
      failCount: TRANSLATION_TARGET_LOCALES.length - successCount,
      results,
      errors: errors.length > 0 ? errors : undefined,
      sourcePostId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to translate blog post.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
