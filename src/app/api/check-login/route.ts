import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: Request) {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.getUser();
    
    if (error) {
      return NextResponse.json({ loggedIn: false, error: error.message }, { status: 200 });
    }
    
    if (data.user) {
      // 获取token
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData?.session?.access_token || '';
      
      return NextResponse.json({
        loggedIn: true,
        userId: data.user.id,
        email: data.user.email,
        accessToken: token
      }, { status: 200 });
    }
    
    return NextResponse.json({ loggedIn: false }, { status: 200 });
  } catch (e) {
    console.error('check-login API error:', e);
    return NextResponse.json({ loggedIn: false, error: 'Internal server error' }, { status: 500 });
  }
}