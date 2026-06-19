import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBuiltInBlogPosts } from '@/lib/blog-content';

const ADMIN_EMAILS = new Set(['admin@vidshorter.ai', 'admin@126.com', 'admin@clipop.ai']);
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

function isAdminJwt(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  if (payload.role === 'admin') return true;
  const email = typeof payload.email === 'string' ? payload.email : '';
  if (email && ADMIN_EMAILS.has(email.trim().toLowerCase())) return true;
  if (payload.user_metadata && typeof payload.user_metadata === 'object') {
    const meta = payload.user_metadata as Record<string, unknown>;
    const metaEmail = typeof meta.email === 'string' ? meta.email : '';
    if (metaEmail && ADMIN_EMAILS.has(metaEmail.trim().toLowerCase())) return true;
  }
  return false;
}

async function getOrCreateSystemUser(client: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await client
    .from('users')
    .select('id')
    .eq('id', SYSTEM_USER_ID)
    .maybeSingle();

  if (data?.id) return data.id as string;

  await client
    .from('users')
    .insert({
      id: SYSTEM_USER_ID,
      email: 'system@clipop.ai',
      name: 'Clipop System',
      role: 'user',
      is_active: false,
    })
    .catch(() => {});

  return SYSTEM_USER_ID;
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  const hasAdminJwt = token && isAdminJwt(token);
  if (!hasAdminJwt) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const authorId = await getOrCreateSystemUser(client);

    const { data: existingPosts, error: fetchError } = await client
      .from('blogs')
      .select('id');

    if (fetchError) throw fetchError;
    const existingIds = new Set((existingPosts || []).map(row => row.id as string));

    const allBuiltInPosts = [
      ...getBuiltInBlogPosts('en'),
      ...getBuiltInBlogPosts('zh'),
      ...getBuiltInBlogPosts('zh-Hant'),
    ];
    const newPosts = allBuiltInPosts.filter(post => !existingIds.has(post.id));

    if (newPosts.length === 0) {
      return NextResponse.json({
        message: 'All built-in posts are already in database',
        totalBuiltIn: allBuiltInPosts.length,
        alreadyExists: existingIds.size,
      });
    }

    const rows = newPosts.map(post => ({
      id: post.id,
      title: post.title,
      category: post.category,
      content: post.content,
      cover_image: post.coverImage || post.cover_image,
      author_id: authorId,
      is_published: true,
      view_count: post.view_count || post.views || 0,
      created_at: post.created_at || post.publishedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client.from('blogs').insert(rows);
    if (error) throw error;

    return NextResponse.json({
      message: `Successfully synced ${newPosts.length} posts to database`,
      synced: newPosts.length,
      totalBuiltIn: allBuiltInPosts.length,
      posts: newPosts.map(p => ({ id: p.id, title: p.title, locale: p.locale })),
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync built-in posts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const revalidate = 0;
export const dynamic = 'force-dynamic';
