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
  if (
    demoPayload?.email === 'admin@126.com' &&
    demoPayload?.role === 'admin' &&
    demoPayload?.iss === 'clipop-demo'
  ) {
    return {
      id: typeof demoPayload.sub === 'string' ? demoPayload.sub : 'demo-admin-id',
      email: 'admin@126.com',
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

  const role = userRow?.role || (authData.user.email === 'admin@126.com' ? 'admin' : 'user');
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

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Admin check is optional - list is public, but we still allow filtering if admin
  let isAdmin = false;
  if (token) {
    const admin = await getAdminUser(client, token).catch(() => null);
    if (admin) isAdmin = true;
  }

  try {
    let query = client
      .from('blogs')
      .select('id,title,category,content,cover_image,author_id,is_published,view_count,created_at,updated_at');

    // Non-admin: only published posts
    if (!isAdmin) {
      query = query.eq('is_published', true);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;
    return NextResponse.json({ posts: data || [], isAdmin });
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
      created_at: post.created_at,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client
      .from('blogs')
      .upsert(rows, { onConflict: 'id' });

    if (error) throw error;

    return NextResponse.json({ posts: localizedPosts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to publish blog posts.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
