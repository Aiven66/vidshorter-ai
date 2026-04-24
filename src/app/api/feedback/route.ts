import { NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  if (!isSupabaseConfigured() || !bearerToken) {
    return Response.json({ success: true, demo: true });
  }

  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
  const client = getSupabaseClient(bearerToken);
  const { data: { user } } = await client.auth.getUser();
  if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const rating = typeof body.rating === 'number' ? Math.max(1, Math.min(5, Math.floor(body.rating))) : null;

  if (!content) return Response.json({ error: 'content is required' }, { status: 400 });

  try {
    await client.from('feedbacks').insert({
      user_id: user.id,
      content,
      rating,
      status: 'new',
    });
  } catch {
    return Response.json({ error: 'Failed to submit feedback' }, { status: 500 });
  }

  return Response.json({ success: true });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  if (!isSupabaseConfigured() || !bearerToken) {
    return Response.json({ feedbacks: [], demo: true });
  }

  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
  const client = getSupabaseClient(bearerToken);
  const { data: { user } } = await client.auth.getUser();
  if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await client
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit') || '50', 10) || 50));

  const { data } = await client
    .from('feedbacks')
    .select('id,user_id,content,rating,status,created_at,users(email,name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  return Response.json({ feedbacks: data || [] });
}
