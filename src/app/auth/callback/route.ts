import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClientForMiddleware } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  console.log('[AUTH CALLBACK] Received callback request');
  console.log('[AUTH CALLBACK] Code:', code ? 'Present' : 'Missing');
  console.log('[AUTH CALLBACK] Origin:', origin);
  console.log('[AUTH CALLBACK] Next:', next);
  console.log('[AUTH CALLBACK] Full URL:', request.url);

  if (code) {
    console.log('[AUTH CALLBACK] Attempting to exchange code for session');

    try {
      const { supabase, response } = await createSupabaseServerClientForMiddleware(request);

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      console.log('[AUTH CALLBACK] Exchange result - Error:', error);
      console.log('[AUTH CALLBACK] Exchange result - Has session:', !!data?.session);

      if (error) {
        console.log('[AUTH CALLBACK] Exchange error:', error.message);
        const redirectUrl = new URL('/login', origin);
        redirectUrl.searchParams.set('error', 'auth_callback_error');
        redirectUrl.searchParams.set('message', error.message);
        return NextResponse.redirect(redirectUrl);
      }

      if (data?.session) {
        console.log('[AUTH CALLBACK] Session created successfully for:', data.session.user?.email);

        const user = data.session.user;

        if (user) {
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

              await supabase.from('credits').insert({
                user_id: user.id,
                balance: 100,
              });

              await supabase.from('subscriptions').insert({
                user_id: user.id,
                plan_type: 'free',
                status: 'active',
              });
            } else {
              console.log('[AUTH CALLBACK] User profile already exists');
            }
          } catch (dbError) {
            console.log('[AUTH CALLBACK] Database error (non-fatal):', dbError);
          }
        }

        console.log('[AUTH CALLBACK] Redirecting to:', `${origin}${next}`);
        const redirectResponse = NextResponse.redirect(`${origin}${next}`);

        response.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value, cookie as any);
        });

        return redirectResponse;
      } else {
        console.log('[AUTH CALLBACK] No session in exchange result');
      }
    } catch (e) {
      console.log('[AUTH CALLBACK] Exception during exchange:', e);
    }
  }

  console.log('[AUTH CALLBACK] Redirecting to login with error');
  const redirectUrl = new URL('/login', origin);
  redirectUrl.searchParams.set('error', 'auth_callback_error');
  return NextResponse.redirect(redirectUrl);
}
