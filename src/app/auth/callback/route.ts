import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  console.log('[AUTH CALLBACK] Received callback request');
  console.log('[AUTH CALLBACK] Code:', code ? 'Present' : 'Missing');
  console.log('[AUTH CALLBACK] Origin:', origin);
  console.log('[AUTH CALLBACK] Next:', next);

  if (code) {
    console.log('[AUTH CALLBACK] Attempting to exchange code for session');
    
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      
      console.log('[AUTH CALLBACK] Exchange result - Error:', error);
      console.log('[AUTH CALLBACK] Exchange result - Data:', data);

      if (!error && data?.session) {
        console.log('[AUTH CALLBACK] Session created successfully');
        
        // Get user and create profile if needed
        const { data: { user } } = await client.auth.getUser();
        
        if (user) {
          console.log('[AUTH CALLBACK] Got user:', user.email);
          
          // Check if user exists in our users table
          const { data: existingUser } = await client
            .from('users')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();

          if (!existingUser) {
            console.log('[AUTH CALLBACK] Creating new user profile');
            // Create user profile
            await client.from('users').insert({
              id: user.id,
              email: user.email!,
              name: user.user_metadata?.name || user.email?.split('@')[0],
              role: 'user',
              google_id: user.app_metadata?.provider === 'google' ? user.id : null,
            });

            // Create credits record
            await client.from('credits').insert({
              user_id: user.id,
              balance: 100,
            });

            // Create subscription record
            await client.from('subscriptions').insert({
              user_id: user.id,
              plan_type: 'free',
              status: 'active',
            });
          } else {
            console.log('[AUTH CALLBACK] User profile already exists');
          }
        }

        console.log('[AUTH CALLBACK] Redirecting to:', `${origin}${next}`);
        return NextResponse.redirect(`${origin}${next}`);
      } else {
        console.log('[AUTH CALLBACK] Exchange failed or no session:', error?.message);
      }
    } catch (e) {
      console.log('[AUTH CALLBACK] Exception during exchange:', e);
    }
  }

  // Return the user to an error page with instructions
  console.log('[AUTH CALLBACK] Redirecting to login with error');
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
