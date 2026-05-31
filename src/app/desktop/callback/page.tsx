'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  getDesktopCallbackFromSearch,
  isDesktopAuthRequest,
  openDesktopLocalCallback,
  rememberDesktopAuth,
  syncDesktopAuthAndOpen,
  type DesktopAuthPayload,
} from '@/lib/desktop-auth';
import { Monitor, CheckCircle, Loader2, ExternalLink } from 'lucide-react';

function DesktopCallbackContent() {
  const sp = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<DesktopAuthPayload>({});
  const [retryCount, setRetryCount] = useState(0);

  const callbackUrl = useMemo(() => getDesktopCallbackFromSearch(sp), [sp]);
  const isDesktop = isDesktopAuthRequest(sp);

  const publishDesktopAuth = useCallback((nextPayload: DesktopAuthPayload) => {
    setPayload(nextPayload);

    if (nextPayload.token) {
      localStorage.setItem('clipop_access_token', nextPayload.token);
    }
    if (nextPayload.refreshToken) {
      localStorage.setItem('clipop_refresh_token', nextPayload.refreshToken);
    }

    window.dispatchEvent(new CustomEvent('clipop-desktop-login', { detail: nextPayload }));
    window.dispatchEvent(new Event('clipop-auth-change'));
  }, []);

  useEffect(() => {
    rememberDesktopAuth(callbackUrl);
  }, [callbackUrl]);

  const resolveAndSetPayload = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const client = getSupabaseClient();

      const queryAccessToken = sp.get('access_token') || '';
      const queryRefreshToken = sp.get('refresh_token') || '';
      const codeParam = sp.get('code') || '';

      let hashAccessToken = '';
      let hashRefreshToken = '';
      try {
        const hash = window.location.hash;
        if (hash) {
          const hp = new URLSearchParams(hash.substring(1));
          hashAccessToken = hp.get('access_token') || '';
          hashRefreshToken = hp.get('refresh_token') || '';
        }
      } catch {}

      const accessToken = queryAccessToken || hashAccessToken;
      const refreshToken = queryRefreshToken || hashRefreshToken;

      console.log('[DesktopCallback] accessToken:', !!accessToken, 'refreshToken:', !!refreshToken, 'code:', !!codeParam);

      if (accessToken && refreshToken) {
        console.log('[DesktopCallback] Calling setSession...');
        const { error: se } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (se) {
          console.log('[DesktopCallback] setSession error:', se.message);
        } else {
          console.log('[DesktopCallback] setSession success');
        }
      }

      if (codeParam) {
        console.log('[DesktopCallback] Exchanging code...');
        const { error: ce } = await client.auth.exchangeCodeForSession(codeParam);
        if (ce) {
          console.log('[DesktopCallback] Code exchange error:', ce.message);
        }
      }

      const { data: { session } } = await client.auth.getSession();

      if (session?.user) {
        console.log('[DesktopCallback] Got session user:', session.user.email);
        publishDesktopAuth({
          token: accessToken || session.access_token,
          refreshToken: refreshToken || session.refresh_token,
          email: session.user.email || '',
          userId: session.user.id || '',
          name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || '',
        });
        setLoading(false);
        return;
      }

      if (accessToken) {
        console.log('[DesktopCallback] No session, trying getUser with token...');
        try {
          const { data: { user: authUser } } = await client.auth.getUser(accessToken);
          if (authUser) {
            publishDesktopAuth({
              token: accessToken,
              refreshToken: refreshToken || undefined,
              email: authUser.email || '',
              userId: authUser.id || '',
              name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || '',
            });
            setLoading(false);
            return;
          }
        } catch {}
      }

      if (accessToken) {
        console.log('[DesktopCallback] Token exists but no user resolved, using token as-is');
        publishDesktopAuth({
          token: accessToken,
          refreshToken: refreshToken || undefined,
        });
        setLoading(false);
        return;
      }

      console.log('[DesktopCallback] No token found, checking session only...');
      if (!session) {
        setError('No authentication token found. Please try signing in again.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to complete sign-in.';
      console.log('[DesktopCallback] Error:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [sp, retryCount, publishDesktopAuth]);

  useEffect(() => {
    resolveAndSetPayload();
  }, [resolveAndSetPayload]);

  const handleOpenDesktop = async () => {
    const result = await syncDesktopAuthAndOpen(callbackUrl, payload);
    console.log('[DesktopCallback] Local sync and desktop deep link:', {
      hasDeepLink: !!result.deepLink,
      hasRedirectUrl: !!result.redirectUrl,
      localSyncOk: result.localSync.ok,
      localSyncError: result.localSync.error,
    });
  };

  const handleLocalSync = () => {
    const redirectUrl = openDesktopLocalCallback(callbackUrl, payload);
    console.log('[DesktopCallback] Returning via local callback fallback:', {
      hasRedirectUrl: !!redirectUrl,
    });
  };

  const handleRetry = () => {
    setError('');
    setRetryCount(prev => prev + 1);
  };

  const hasToken = !!payload.token;
  const shouldShowButton = isDesktop || hasToken || payload.email;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Monitor className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Clipop Agent</CardTitle>
          <CardDescription>
            {loading ? 'Completing sign-in...' : error ? 'Sign-in failed' : 'Sign-in successful!'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          {payload.email && !loading && (
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-7 w-7 text-green-500" />
              </div>
              <p className="text-sm text-foreground">
                Signed in as: <span className="font-medium">{payload.email}</span>
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Completing sign-in...</p>
            </div>
          )}

          {error && !loading && (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && shouldShowButton && (
            <div className="space-y-4">
              <Button
                size="lg"
                className="w-full text-base"
                onClick={handleOpenDesktop}
              >
                <Monitor className="w-5 h-5 mr-2" />
                Open Clipop Agent
              </Button>
              {callbackUrl && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleLocalSync}
                >
                  Sync via local callback
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                If the desktop app didn't open, please switch to it manually or click the button again.
              </p>
            </div>
          )}

          {!loading && !hasToken && !payload.email && !error && !isDesktop && (
            <div className="space-y-4">
              <p className="text-sm text-amber-600">
                Sign-in completed but token not detected. Please return to the desktop app.
              </p>
              <Button
                size="lg"
                className="w-full"
                onClick={handleOpenDesktop}
                variant="outline"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Try Open Desktop App
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DesktopCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Monitor className="w-8 h-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">Clipop Agent</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground mt-2">Loading...</p>
          </CardContent>
        </Card>
      </div>
    }>
      <DesktopCallbackContent />
    </Suspense>
  );
}
