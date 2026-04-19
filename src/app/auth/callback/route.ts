import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const client = getSupabaseClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // Get user and create profile if needed
      const { data: { user } } = await client.auth.getUser();
      
      if (user) {
        // Check if user exists in our users table
        const { data: existingUser } = await client
          .from('users')
          .select('id')
          .eq('id', user.id)
          .maybeSingle();

        if (!existingUser) {
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
            balance: 300,
          });

          // Create subscription record
          await client.from('subscriptions').insert({
            user_id: user.id,
            plan_type: 'free',
            status: 'active',
          });
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
