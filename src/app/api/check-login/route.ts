import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const client = getSupabaseClient(bearerToken || undefined);
    const { data, error } = bearerToken
      ? await client.auth.getUser(bearerToken)
      : await client.auth.getUser();
    
    if (error) {
      return NextResponse.json({ loggedIn: false, error: error.message }, { status: 200 });
    }
    
    if (data.user) {
      const { data: sessionData } = await client.auth.getSession();
      const token = bearerToken || sessionData?.session?.access_token || '';
      
      const { data: userData } = await client
        .from('users')
        .select('name, role, avatar_url')
        .eq('id', data.user.id)
        .maybeSingle();
      
      return NextResponse.json({
        loggedIn: true,
        userId: data.user.id,
        email: data.user.email,
        name: userData?.name || data.user.user_metadata?.name || null,
        role: userData?.role || 'user',
        avatarUrl: userData?.avatar_url || data.user.user_metadata?.avatar_url || null,
        accessToken: token
      }, { status: 200 });
    }
    
    return NextResponse.json({ loggedIn: false }, { status: 200 });
  } catch (e) {
    console.error('check-login API error:', e);
    return NextResponse.json({ loggedIn: false, error: 'Internal server error' }, { status: 500 });
  }
}
