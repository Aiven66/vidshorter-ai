'use client';

/**
 * @clipop/auth - OAuthCallback
 *
 * Drop-in OAuth callback page. On mount:
 *   1. Try `client.auth.getSession()` — Supabase may have already persisted it.
 *   2. If that fails, parse `access_token` / `refresh_token` from the URL hash
 *      and call `setSession` (recoverHashSession).
 *
 * On success:
 *   - If the URL contains `from=desktop`, extract the `next` param and
 *     redirect to `desktopRedirectPath || '/desktop/callback'` carrying `next`.
 *   - Otherwise redirect to `redirectTo || '/'`.
 *
 * Dispatches the `app-auth-session` custom event so the AuthProvider can
 * sync its internal state.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAppConfig } from '../core/config';
import { getSupabaseClient, isSupabaseConfigured } from '../core/supabase';

export interface OAuthCallbackProps {
  /** Where to send the user after a successful web sign-in. Defaults to '/'. */
  redirectTo?: string;
  /** Path used when the request originated from the desktop shell. */
  desktopRedirectPath?: string;
}

type CallbackStatus = 'loading' | 'success' | 'error';

interface RecoveredSession {
  accessToken?: string;
  refreshToken?: string;
}

export function OAuthCallback({
  redirectTo = '/',
  desktopRedirectPath = '/desktop/callback',
}: OAuthCallbackProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const config = useAppConfig();

  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const executedRef = useRef(false);

  useEffect(() => {
    if (executedRef.current) return;
    executedRef.current = true;

    async function handleCallback() {
      try {
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        const fromDesktop = searchParams.get('from') === 'desktop';
        const nextParam = searchParams.get('next') || '';

        if (errorParam) {
          setStatus('error');
          setErrorMessage(errorDescription || errorParam);
          redirectAfterError(fromDesktop, nextParam);
          return;
        }

        if (!isSupabaseConfigured(config)) {
          setStatus('error');
          setErrorMessage('Authentication service is not configured.');
          redirectAfterError(fromDesktop, nextParam);
          return;
        }

        const client = getSupabaseClient(config);
        let session: RecoveredSession = {};

        // Step 1: try getSession — Supabase may have detected the URL itself.
        try {
          const { data } = await client.auth.getSession();
          if (data.session?.access_token) {
            session = {
              accessToken: data.session.access_token,
              refreshToken: data.session.refresh_token,
            };
          }
        } catch {
          /* swallow — fall back to hash recovery */
        }

        // Step 2: recover from URL hash (implicit flow).
        if (!session.accessToken) {
          session = await recoverHashSession(client);
        }

        if (!session.accessToken) {
          setStatus('error');
          setErrorMessage('Failed to obtain session. Please try again.');
          redirectAfterError(fromDesktop, nextParam);
          return;
        }

        // Persist + notify AuthProvider.
        if (typeof window !== 'undefined') {
          localStorage.setItem('app_access_token', session.accessToken);
          if (session.refreshToken) {
            localStorage.setItem('app_refresh_token', session.refreshToken);
          }
          window.dispatchEvent(
            new CustomEvent('app-auth-session', {
              detail: {
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
              },
            }),
          );
          window.dispatchEvent(new Event('app-auth-change'));
        }

        setStatus('success');

        // Route based on flow type.
        const target = fromDesktop
          ? `${desktopRedirectPath}?next=${encodeURIComponent(nextParam)}`
          : redirectTo;
        setTimeout(() => router.replace(target), 400);
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Authentication failed.');
        const fromDesktop = searchParams.get('from') === 'desktop';
        redirectAfterError(fromDesktop, searchParams.get('next') || '');
      }
    }

    function redirectAfterError(fromDesktop: boolean, _next: string) {
      const loginPath = fromDesktop ? '/login?from=desktop' : '/login';
      setTimeout(() => router.replace(loginPath), 1800);
    }

    async function recoverHashSession(client: ReturnType<typeof getSupabaseClient>): Promise<RecoveredSession> {
      if (typeof window === 'undefined') return {};
      const hash = window.location.hash;
      if (!hash) return {};

      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const accessToken = params.get('access_token') || '';
      const refreshToken = params.get('refresh_token') || '';
      if (!accessToken) return {};

      if (refreshToken) {
        try {
          const { data } = await client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (data.session?.access_token) {
            return {
              accessToken: data.session.access_token,
              refreshToken: data.session.refresh_token,
            };
          }
        } catch {
          /* fall through */
        }
      }
      return { accessToken, refreshToken: refreshToken || undefined };
    }

    handleCallback();
  }, [config, redirectTo, desktopRedirectPath, router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="space-y-4 text-center">
        {status === 'loading' && (
          <>
            <svg
              className="mx-auto h-8 w-8 animate-spin text-primary"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-muted-foreground">Completing sign in…</p>
          </>
        )}
        {status === 'success' && (
          <p className="text-muted-foreground">Sign in successful! Redirecting…</p>
        )}
        {status === 'error' && (
          <>
            <p className="text-red-500" role="alert">
              {errorMessage}
            </p>
            <p className="text-sm text-muted-foreground">Redirecting to login…</p>
          </>
        )}
      </div>
    </div>
  );
}

export default OAuthCallback;
