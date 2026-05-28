import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function getSupabaseCredentials() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.COZE_SUPABASE_URL ||
    '';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.COZE_SUPABASE_ANON_KEY ||
    '';
  return { url, anonKey };
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  console.log('[AUTH CALLBACK] Received callback request');
  console.log('[AUTH CALLBACK] Code:', code ? 'Present' : 'Missing');
  console.log('[AUTH CALLBACK] Origin:', origin);

  if (!code) {
    console.log('[AUTH CALLBACK] No code parameter, redirecting to login');
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const { url, anonKey } = getSupabaseCredentials();

  if (!url || !anonKey) {
    console.log('[AUTH CALLBACK] Missing Supabase credentials');
    return NextResponse.redirect(`${origin}/login?error=config_error`);
  }

  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (e) {
            console.log('[AUTH CALLBACK] Cookie set error (non-fatal in middleware):', e);
          }
        },
      },
    });

    console.log('[AUTH CALLBACK] Exchanging code for session...');
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.log('[AUTH CALLBACK] Exchange error:', error.message);
      return NextResponse.redirect(
        `${origin}/login?error=auth_callback_error&message=${encodeURIComponent(error.message)}`
      );
    }

    if (!data?.session) {
      console.log('[AUTH CALLBACK] No session in exchange result');
      return NextResponse.redirect(`${origin}/login?error=no_session`);
    }

    console.log('[AUTH CALLBACK] Session created for:', data.session.user?.email);

    const user = data.session.user;

    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!existingUser) {
        console.log('[AUTH CALLBACK] Creating new user profile');
        await supabase.from('users').insert({
          id: user.id,
          email: user.email!,
          name: user.user_metadata?.name || user.email?.split('@')[0],
          role: 'user',
          google_id: user.app_metadata?.provider === 'google' ? user.id : null,
        });
        await supabase.from('credits').insert({ user_id: user.id, balance: 100 });
        await supabase.from('subscriptions').insert({
          user_id: user.id,
          plan_type: 'free',
          status: 'active',
        });
      }
    } catch (dbError) {
      console.log('[AUTH CALLBACK] Database error (non-fatal):', dbError);
    }

    console.log('[AUTH CALLBACK] Redirecting to:', `${origin}${next}`);
    return NextResponse.redirect(`${origin}${next}`);
  } catch (e) {
    console.log('[AUTH CALLBACK] Exception:', e);
    return NextResponse.redirect(
      `${origin}/login?error=auth_callback_error&message=${encodeURIComponent(e instanceof Error ? e.message : 'Unknown error')}`
    );
  }
}
