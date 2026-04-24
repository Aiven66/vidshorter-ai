import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  if (!bearerToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
  const client = getSupabaseClient(bearerToken);
  const { data: { user } } = await client.auth.getUser();

  if (!user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const country = request.headers.get('x-vercel-ip-country') || request.headers.get('cf-ipcountry') || null;
  const region = request.headers.get('x-vercel-ip-country-region') || null;
  const city = request.headers.get('x-vercel-ip-city') || null;

  try {
    await client
      .from('users')
      .update({
        country,
        region,
        city,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', user.id);
  } catch {}

  return Response.json({ success: true });
}

