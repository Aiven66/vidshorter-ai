'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function handleCallback() {
      try {
        const code = searchParams.get('code');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
          setStatus('error');
          setErrorMessage(errorDescription || error);
          setTimeout(() => router.replace(`/login?error=${encodeURIComponent(errorDescription || error)}`), 2000);
          return;
        }

        let hashFragment = '';
        if (typeof window !== 'undefined') {
          hashFragment = window.location.hash;
        }

        const hasAccessToken = hashFragment.includes('access_token') || hashFragment.includes('id_token');

        if (!code && !hasAccessToken) {
          setStatus('error');
          setErrorMessage('No authentication data received. Please try again.');
          setTimeout(() => router.replace('/login?error=no_auth_data'), 2000);
          return;
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY || '';

        if (!supabaseUrl || !supabaseKey) {
          setStatus('error');
          setErrorMessage('Authentication service is not configured.');
          setTimeout(() => router.replace('/login?error=config_error'), 2000);
          return;
        }

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey, {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
          },
        });

        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            setStatus('error');
            setErrorMessage(exchangeError.message);
            setTimeout(() => router.replace(`/login?error=${encodeURIComponent(exchangeError.message)}`), 2000);
            return;
          }
          if (data.session?.user) {
            try {
              const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('id', data.session.user.id)
                .maybeSingle();

              if (!existingUser) {
                await supabase.from('users').insert({
                  id: data.session.user.id,
                  email: data.session.user.email!,
                  name: data.session.user.user_metadata?.name || data.session.user.email?.split('@')[0],
                  role: 'user',
                  google_id: data.session.user.app_metadata?.provider === 'google' ? data.session.user.id : null,
                });
                await supabase.from('credits').insert({ user_id: data.session.user.id, balance: 100 });
                await supabase.from('subscriptions').insert({
                  user_id: data.session.user.id,
                  plan_type: 'free',
                  status: 'active',
                });
              }
            } catch (dbError) {
              console.error('[AUTH CALLBACK] Database error (non-fatal):', dbError);
            }
          }
        } else {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !session) {
            setStatus('error');
            setErrorMessage(sessionError?.message || 'Failed to get session.');
            setTimeout(() => router.replace('/login?error=session_failed'), 2000);
            return;
          }

          try {
            const { data: existingUser } = await supabase
              .from('users')
              .select('id')
              .eq('id', session.user.id)
              .maybeSingle();

            if (!existingUser) {
              await supabase.from('users').insert({
                id: session.user.id,
                email: session.user.email!,
                name: session.user.user_metadata?.name || session.user.email?.split('@')[0],
                role: 'user',
                google_id: session.user.app_metadata?.provider === 'google' ? session.user.id : null,
              });
              await supabase.from('credits').insert({ user_id: session.user.id, balance: 100 });
              await supabase.from('subscriptions').insert({
                user_id: session.user.id,
                plan_type: 'free',
                status: 'active',
              });
            }
          } catch (dbError) {
            console.error('[AUTH CALLBACK] Database error (non-fatal):', dbError);
          }
        }

        setStatus('success');
        const next = searchParams.get('next') || '/';
        setTimeout(() => router.replace(next), 500);
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Authentication failed.');
        setTimeout(() => router.replace('/login?error=callback_failed'), 2000);
      }
    }

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Completing sign in...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="h-8 w-8 mx-auto text-green-500">✓</div>
            <p className="text-muted-foreground">Sign in successful! Redirecting...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="h-8 w-8 mx-auto text-red-500">✗</div>
            <p className="text-red-500">{errorMessage}</p>
            <p className="text-sm text-muted-foreground">Redirecting to login...</p>
          </>
        )}
      </div>
    </div>
  );
}
