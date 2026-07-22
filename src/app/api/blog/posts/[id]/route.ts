import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Force dynamic — prevents Next.js from trying to statically generate this API route at build time.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

async function getAdminUser(
  client: ReturnType<typeof createClient>,
  token: string,
  url: string
) {
  const demoPayload = decodeJwtPayload(token);
  const adminEmails = ['admin@126.com', 'admin@vidshorter.ai', 'admin@clipop.ai'];
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

  try {
    // 用 anon key 创建 auth client 来验证用户 token
    // service role client 不能验证用户 token（auth.getUser 会失败）
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.COZE_SUPABASE_ANON_KEY || '';
    if (!anonKey) return null;

    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user?.email) return null;

    const { data: userRow } = await client
      .from('users')
      .select('id,email,name,role')
      .eq('id', authData.user.id)
      .maybeSingle();

    const email = authData.user.email.toLowerCase();
    const role = userRow?.role || (adminEmails.includes(email) ? 'admin' : 'user');
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let isAdmin = false;
  if (token) {
    const admin = await getAdminUser(client, token, url).catch(() => null);
    if (admin) isAdmin = true;
  }

  try {
    // 获取 root 文章（parent_id 为空或自己就是 root）
    const { data: rootPost, error: rootError } = await client
      .from('blogs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (rootError) throw rootError;
    if (!rootPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const parentId = rootPost.parent_id || rootPost.id;

    // 非管理员只能看已发布
    if (!isAdmin && !rootPost.is_published) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 获取翻译版本（parent_id 列不存在时返回空数组）
    let translations: any[] = [];
    try {
      let translationsQuery = client
        .from('blogs')
        .select('id,title,category,content,cover_image,locale,is_published,created_at,updated_at,parent_id')
        .eq('parent_id', parentId)
        .neq('id', parentId)
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        translationsQuery = translationsQuery.eq('is_published', true);
      }

      const { data: transData, error: transError } = await translationsQuery;
      if (!transError && transData) translations = transData;
    } catch {
      // parent_id 列可能不存在，忽略
    }

    return NextResponse.json({
      post: rootPost,
      translations,
      isAdmin,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to get post.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH 保存某个语言版本的翻译内容
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const adminUser = await getAdminUser(client, token, url);
  if (!adminUser) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null) as {
      locale?: string;
      title?: string;
      category?: string;
      content?: string;
      coverImage?: string;
      publish?: boolean;
    } | null;

    if (!body?.locale || body.locale === 'en') {
      return NextResponse.json({ error: 'Use /api/blog/posts PATCH for English root post' }, { status: 400 });
    }

    const targetLocale = body.locale;
    const parentId = id;

    // 查询是否已有该 locale 的翻译
    const { data: existing } = await client
      .from('blogs')
      .select('id')
      .eq('parent_id', parentId)
      .eq('locale', targetLocale)
      .neq('id', parentId)
      .maybeSingle();

    const updates: Record<string, unknown> = {
      title: body.title?.trim(),
      category: body.category?.trim() || 'AI Video Clipping',
      content: body.content?.trim(),
      updated_at: new Date().toISOString(),
    };
    if (body.coverImage !== undefined) updates.cover_image = body.coverImage.trim();
    if (body.publish !== undefined) updates.is_published = body.publish;

    if (existing?.id) {
      const { data, error } = await client
        .from('blogs')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ translation: data });
    }

    // 创建新的翻译行
    const { data: root } = await client
      .from('blogs')
      .select('author_id')
      .eq('id', parentId)
      .maybeSingle();

    if (!root) {
      return NextResponse.json({ error: 'Root post not found' }, { status: 404 });
    }

    const newId = crypto.randomUUID();
    const row = {
      id: newId,
      ...updates,
      cover_image: updates.cover_image || '',
      author_id: root.author_id,
      is_published: body.publish !== false,
      view_count: 0,
      locale: targetLocale,
      parent_id: parentId,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('blogs')
      .insert([row])
      .select()
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ translation: data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save translation.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
