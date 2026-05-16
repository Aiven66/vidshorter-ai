import { NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  if (!isSupabaseConfigured() || !bearerToken) {
    return Response.json({ users: [], demo: true });
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
  const limit = Math.max(1, Math.min(500, parseInt(searchParams.get('limit') || '100', 10) || 100));

  const { data } = await client
    .from('users')
    .select('id,email,name,role,is_active,country,region,city,created_at,subscriptions(plan_type,status),credits(balance,last_reset_at)')
    .order('created_at', { ascending: false })
    .limit(limit);

  return Response.json({ users: data || [] });
}

