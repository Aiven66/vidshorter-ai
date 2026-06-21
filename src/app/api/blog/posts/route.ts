import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLocalizedAdminPosts } from '@/lib/blog-content';

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
  // 支持 admin@126.com 和 admin@vidshorter.ai 两个管理员邮箱
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
  // Always look up by email first to get the real UUID from the database
  const { data: existingByEmail } = await client
    .from('users')
    .select('id')
    .eq('email', user.email)
    .maybeSingle();

  if (existingByEmail?.id) return existingByEmail.id as string;

  // If user doesn't exist, create with a proper UUID (never use demo-admin-id)
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

// ==================== GET: List all published blog posts (admin) ====================
export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

  // 解析分页参数
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
  const pageSize = parseInt(req.nextUrl.searchParams.get('pageSize') || '10');

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let isAdmin = false;
  if (token) {
    const admin = await getAdminUser(client, token).catch(() => null);
    if (admin) isAdmin = true;
  }

  try {
    let query = client
      .from('blogs')
      .select('*');

    if (!isAdmin) {
      query = query.eq('is_published', true);
    }

    // 获取总数（无分页限制）
    const { data: allData, error: countError } = await query
      .order('created_at', { ascending: false })
      .limit(1000); // 限制最大数量防止性能问题

    if (countError) throw countError;

    const total = (allData || []).length;

    // 分页查询
    const startIdx = (page - 1) * pageSize;
    const paginatedData = (allData || []).slice(startIdx, startIdx + pageSize);

    return NextResponse.json({ posts: paginatedData || [], total, isAdmin });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to list posts.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ==================== POST: Create/publish new blog article ====================
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return NextResponse.json({
      error: 'Blog publishing is not configured. Please add SUPABASE_SERVICE_ROLE_KEY.',
    }, { status: 503 });
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const adminUser = await getAdminUser(client, token);
  if (!adminUser) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as {
    title?: string;
    category?: string;
    content?: string;
    coverImage?: string;
    publish?: boolean;
  } | null;

  const title = body?.title?.trim();
  const category = body?.category?.trim() || 'AI Video Clipping';
  const content = body?.content?.trim();

  if (!title || !content) {
    return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
  }

  try {
    const authorId = await ensureAuthor(client, adminUser);
    const localizedPosts = createLocalizedAdminPosts({
      title,
      category,
      content,
      coverImage: body?.coverImage?.trim(),
      publish: body?.publish !== false,
    });

    const rows = localizedPosts.map(post => ({
      id: post.id,
      title: post.title,
      category: post.category,
      content: post.content,
      cover_image: post.cover_image,
      author_id: authorId,
      is_published: post.is_published !== false,
      view_count: post.view_count || 0,
      locale: post.locale || 'en',
      created_at: post.created_at,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client
      .from('blogs')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      // 如果 locale 列不存在，尝试不包含 locale 重试
      if (error.message?.includes('locale') || error.message?.includes('column')) {
        const rowsWithoutLocale = rows.map(row => {
          const { locale: _locale, ...rest } = row;
          return rest;
        });
        const { error: retryError } = await client
          .from('blogs')
          .upsert(rowsWithoutLocale, { onConflict: 'id' });
        if (retryError) throw retryError;
      } else {
        throw error;
      }
    }

    return NextResponse.json({ posts: localizedPosts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to publish blog posts.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ==================== PATCH: Update existing blog article ====================
export async function PATCH(req: NextRequest) {
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

  const body = await req.json().catch(() => null) as {
    id?: string;
    title?: string;
    category?: string;
    content?: string;
    coverImage?: string;
    publish?: boolean;
  } | null;

  const postId = body?.id?.trim();
  if (!postId) {
    return NextResponse.json({ error: 'Post ID is required for update' }, { status: 400 });
  }

  try {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body?.title?.trim()) updates.title = body.title.trim();
    if (body?.category?.trim()) updates.category = body.category.trim();
    if (body?.content?.trim()) updates.content = body.content.trim();
    if (body?.coverImage !== undefined) updates.cover_image = body.coverImage.trim();
    if (body?.publish !== undefined) updates.is_published = body.publish;

    const { data, error } = await client
      .from('blogs')
      .update(updates)
      .eq('id', postId)
      .select('id,title,category,content,cover_image,is_published,view_count,created_at,updated_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({ post: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update blog post.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ==================== DELETE: Clear all blog articles ====================
export async function DELETE(req: NextRequest) {
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
    // 先查询所有文章 ID，再逐批删除
    // .neq('id', '') 对 UUID 列不生效，必须先查后删
    const { data: allRows, error: selectError } = await client
      .from('blogs')
      .select('id');

    if (selectError) throw selectError;

    if (!allRows || allRows.length === 0) {
      return NextResponse.json({ success: true, message: 'No articles to delete' });
    }

    const ids = allRows.map((row: { id: string }) => row.id);

    // Supabase delete 支持 .in() 批量删除
    const { error: deleteError } = await client
      .from('blogs')
      .delete()
      .in('id', ids);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true, message: `Deleted ${ids.length} article(s)` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete all blog articles.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
