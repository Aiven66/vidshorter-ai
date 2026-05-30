'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  buildDesktopCallbackPath,
  getDesktopCallbackFromPath,
  getDesktopCallbackFromSearch,
  getSafeNextPath,
  isDesktopAuthRequest,
  rememberDesktopAuth,
} from '@/lib/desktop-auth';

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
        const requestedNext = getSafeNextPath(searchParams.get('next'));
        const callbackUrl = getDesktopCallbackFromSearch(searchParams) || getDesktopCallbackFromPath(requestedNext);
        const isDesktopFlow = isDesktopAuthRequest(searchParams) || requestedNext.startsWith('/desktop/callback');
        const loginErrorPath = isDesktopFlow
          ? `/login?from=desktop${callbackUrl ? `&callback=${encodeURIComponent(callbackUrl)}` : ''}`
          : '/login';
        const loginErrorUrl = (message: string) =>
          `${loginErrorPath}${loginErrorPath.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`;

        if (isDesktopFlow) {
          rememberDesktopAuth(callbackUrl);
        }

        if (error) {
          setStatus('error');
          setErrorMessage(errorDescription || error);
          setTimeout(() => router.replace(loginErrorUrl(errorDescription || error)), 2000);
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
          setTimeout(() => router.replace(loginErrorUrl('no_auth_data')), 2000);
          return;
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY || '';

        if (!supabaseUrl || !supabaseKey) {
          setStatus('error');
          setErrorMessage('Authentication service is not configured.');
          setTimeout(() => router.replace(loginErrorUrl('config_error')), 2000);
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

        let sessionForRedirect: { accessToken?: string; refreshToken?: string } = {};

        if (code) {
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            setStatus('error');
            setErrorMessage(exchangeError.message);
            setTimeout(() => router.replace(loginErrorUrl(exchangeError.message)), 2000);
            return;
          }
          if (exchangeData.session) {
            sessionForRedirect = {
              accessToken: exchangeData.session.access_token,
              refreshToken: exchangeData.session.refresh_token,
            };
          }
          if (exchangeData.session?.user) {
            try {
              const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('id', exchangeData.session.user.id)
                .maybeSingle();

              if (!existingUser) {
                await supabase.from('users').insert({
                  id: exchangeData.session.user.id,
                  email: exchangeData.session.user.email!,
                  name: exchangeData.session.user.user_metadata?.name || exchangeData.session.user.email?.split('@')[0],
                  role: 'user',
                  google_id: exchangeData.session.user.app_metadata?.provider === 'google' ? exchangeData.session.user.id : null,
                });
                await supabase.from('credits').insert({ user_id: exchangeData.session.user.id, balance: 100 });
                await supabase.from('subscriptions').insert({
                  user_id: exchangeData.session.user.id,
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
            setTimeout(() => router.replace(loginErrorUrl('session_failed')), 2000);
            return;
          }

          if (session) {
            sessionForRedirect = {
              accessToken: session.access_token,
              refreshToken: session.refresh_token,
            };
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

        const next = isDesktopFlow
          ? (requestedNext !== '/' ? requestedNext : buildDesktopCallbackPath(callbackUrl))
          : requestedNext;

        let redirectUrl = next;
        if (isDesktopFlow && sessionForRedirect.accessToken) {
          const nextUrl = new URL(next, window.location.origin);
          nextUrl.searchParams.set('access_token', sessionForRedirect.accessToken);
          if (sessionForRedirect.refreshToken) {
            nextUrl.searchParams.set('refresh_token', sessionForRedirect.refreshToken);
          }
          redirectUrl = nextUrl.pathname + '?' + nextUrl.searchParams.toString();
        }

        setTimeout(() => router.replace(redirectUrl), 500);
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Authentication failed.');
        const fallbackNext = getSafeNextPath(searchParams.get('next'));
        const fallbackCallbackUrl = getDesktopCallbackFromSearch(searchParams) || getDesktopCallbackFromPath(fallbackNext);
        const fallbackDesktopFlow = isDesktopAuthRequest(searchParams) || fallbackNext.startsWith('/desktop/callback');
        const fallbackLoginPath = fallbackDesktopFlow
          ? `/login?from=desktop${fallbackCallbackUrl ? `&callback=${encodeURIComponent(fallbackCallbackUrl)}` : ''}`
          : '/login';
        setTimeout(() => {
          router.replace(`${fallbackLoginPath}${fallbackLoginPath.includes('?') ? '&' : '?'}error=callback_failed`);
        }, 2000);
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
