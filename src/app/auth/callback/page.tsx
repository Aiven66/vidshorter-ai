'use client';

import { useEffect, useRef, useState } from 'react';
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const executedRef = useRef(false);

  useEffect(() => {
    if (executedRef.current) return;
    executedRef.current = true;

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
            detectSessionInUrl: false,
            flowType: 'implicit',
          },
        });

        let sessionForRedirect: { accessToken?: string; refreshToken?: string } = {};

        const persistSessionUser = async (session: any) => {
          if (!session?.user) return;

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
        };

        const applySession = async (session: any) => {
          if (!session?.access_token) return false;
          sessionForRedirect = {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
          };
          await persistSessionUser(session);
          return true;
        };

        const getSessionWithRetry = async () => {
          for (let attempt = 0; attempt < 8; attempt += 1) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) return session;
            await sleep(150 + attempt * 100);
          }
          return null;
        };

        const recoverStoredSession = async () => {
          if (typeof window === 'undefined') return false;

          const storedAccessToken = localStorage.getItem('clipop_access_token') || '';
          const storedRefreshToken = localStorage.getItem('clipop_refresh_token') || '';
          if (!storedAccessToken) return false;

          if (storedRefreshToken) {
            const { data } = await supabase.auth.setSession({
              access_token: storedAccessToken,
              refresh_token: storedRefreshToken,
            });
            if (await applySession(data.session)) return true;
          }

          try {
            const { data: { user } } = await supabase.auth.getUser(storedAccessToken);
            if (user) {
              sessionForRedirect = {
                accessToken: storedAccessToken,
                refreshToken: storedRefreshToken || undefined,
              };
              await persistSessionUser({ user });
              return true;
            }
          } catch {}

          return false;
        };

        const recoverHashSession = async () => {
          if (!hashFragment) return false;

          const hashParams = new URLSearchParams(hashFragment.replace(/^#/, ''));
          const hashAccessToken = hashParams.get('access_token') || '';
          const hashRefreshToken = hashParams.get('refresh_token') || '';
          if (!hashAccessToken) return false;

          if (hashRefreshToken) {
            const { data, error: setSessionError } = await supabase.auth.setSession({
              access_token: hashAccessToken,
              refresh_token: hashRefreshToken,
            });
            if (setSessionError) {
              console.log('[AUTH CALLBACK] setSession from hash error:', setSessionError.message);
            }
            if (await applySession(data.session)) return true;
          }

          try {
            const { data: { user } } = await supabase.auth.getUser(hashAccessToken);
            if (user) {
              sessionForRedirect = {
                accessToken: hashAccessToken,
                refreshToken: hashRefreshToken || undefined,
              };
              await persistSessionUser({ user });
              return true;
            }
          } catch {}

          sessionForRedirect = {
            accessToken: hashAccessToken,
            refreshToken: hashRefreshToken || undefined,
          };
          return true;
        };

        await recoverHashSession();

        if (!sessionForRedirect.accessToken && code) {
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.log('[AUTH CALLBACK] exchangeCodeForSession error:', exchangeError.message);
          }
          await applySession(exchangeData.session);
        }

        if (!sessionForRedirect.accessToken) {
          console.log('[AUTH CALLBACK] No session from exchangeCode, trying getSession...');
          await applySession(await getSessionWithRetry());
        }

        if (!sessionForRedirect.accessToken) {
          console.log('[AUTH CALLBACK] No session from getSession, trying stored token recovery...');
          await recoverStoredSession();
        }

        if (!sessionForRedirect.accessToken) {
          console.log('[AUTH CALLBACK] No session found at all');
          setStatus('error');
          setErrorMessage('Failed to obtain session. Please try again.');
          setTimeout(() => router.replace(loginErrorUrl('no_session')), 2000);
          return;
        }

        if (typeof window !== 'undefined') {
          localStorage.setItem('clipop_access_token', sessionForRedirect.accessToken);
          if (sessionForRedirect.refreshToken) {
            localStorage.setItem('clipop_refresh_token', sessionForRedirect.refreshToken);
          }
          window.dispatchEvent(new CustomEvent('clipop-auth-session', {
            detail: {
              accessToken: sessionForRedirect.accessToken,
              refreshToken: sessionForRedirect.refreshToken,
            },
          }));
          window.dispatchEvent(new Event('clipop-auth-change'));
          if (isDesktopFlow) {
            rememberDesktopAuth(callbackUrl);
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
