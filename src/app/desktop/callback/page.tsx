'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { Monitor, CheckCircle, Loader2 } from 'lucide-react';

function DesktopCallbackContent() {
  const sp = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [resolvedToken, setResolvedToken] = useState('');
  const [resolvedUserId, setResolvedUserId] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  const [autoSendStatus, setAutoSendStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [retryCount, setRetryCount] = useState(0);

  const callbackUrl = useMemo(() => sp.get('callback') || sessionStorage.getItem('clipop_desktop_callback') || '', [sp]);

  useEffect(() => {
    sessionStorage.setItem('clipop_desktop_auth', '1');
    if (callbackUrl) {
      sessionStorage.setItem('clipop_desktop_callback', callbackUrl);
    }
  }, [callbackUrl]);

  useEffect(() => {
    let cancelled = false;

    async function resolveSession() {
      setLoading(true);
      setError('');

      try {
        const client = getSupabaseClient();

        const codeParam = sp.get('code') || '';

        let hashAccessToken = '';
        let hashRefreshToken = '';
        try {
          const hash = window.location.hash;
          if (hash) {
            const hashParams = new URLSearchParams(hash.substring(1));
            hashAccessToken = hashParams.get('access_token') || '';
            hashRefreshToken = hashParams.get('refresh_token') || '';
          }
        } catch {}

        const queryAccessToken = sp.get('access_token') || '';
        const queryRefreshToken = sp.get('refresh_token') || '';

        const accessTokenParam = queryAccessToken || hashAccessToken;
        const refreshTokenParam = queryRefreshToken || hashRefreshToken;

        console.log('[DesktopCallback] Params - code:', !!codeParam, 'accessToken:', !!accessTokenParam, 'refreshToken:', !!refreshTokenParam, 'callback:', !!callbackUrl);

        if (accessTokenParam && refreshTokenParam) {
          console.log('[DesktopCallback] Setting session from hash tokens...');
          const { error: sessionError } = await client.auth.setSession({
            access_token: accessTokenParam,
            refresh_token: refreshTokenParam,
          });
          if (sessionError) {
            console.log('[DesktopCallback] setSession error:', sessionError.message);
          } else {
            console.log('[DesktopCallback] setSession success');
          }
        }

        if (codeParam) {
          console.log('[DesktopCallback] Exchanging code for session...');
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(codeParam);
          if (exchangeError) {
            console.log('[DesktopCallback] Code exchange error:', exchangeError.message);
            throw exchangeError;
          }
          console.log('[DesktopCallback] Code exchange success');
        }

        const { data: { session } } = await client.auth.getSession();
        const token = accessTokenParam || session?.access_token || '';
        const user = session?.user;

        console.log('[DesktopCallback] Session check - token:', !!token, 'user:', !!user);

        if (!token) {
          throw new Error('No authentication token found. Please try signing in again.');
        }

        if (!user && token) {
          try {
            const { data: { user: authUser } } = await client.auth.getUser(token);
            if (authUser) {
              if (!cancelled) {
                setResolvedToken(token);
                setResolvedEmail(authUser.email || '');
                setResolvedUserId(authUser.id || '');
                setResolvedName(authUser.user_metadata?.name || authUser.email?.split('@')[0] || '');
              }
              return;
            }
          } catch (e) {
            console.log('[DesktopCallback] getUser error:', e);
          }
        }

        if (!user) {
          throw new Error('No session found. Please try signing in again.');
        }

        if (!cancelled) {
          setResolvedToken(token);
          setResolvedEmail(user.email || '');
          setResolvedUserId(user.id || '');
          setResolvedName(user.user_metadata?.name || user.email?.split('@')[0] || '');

          try {
            const { data: existingUser } = await client
              .from('users')
              .select('id')
              .eq('id', user.id)
              .maybeSingle();
            if (!existingUser) {
              await client.from('users').insert({
                id: user.id,
                email: user.email!,
                name: user.user_metadata?.name || user.email?.split('@')[0],
                role: 'user',
                google_id: user.app_metadata?.provider === 'google' ? user.id : null,
              });
              await client.from('credits').insert({ user_id: user.id, balance: 100 });
              await client.from('subscriptions').insert({ user_id: user.id, plan_type: 'free', status: 'active' });
            }
          } catch {}
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Failed to complete sign-in.';
          console.log('[DesktopCallback] Resolve error:', msg);
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolveSession();

    return () => {
      cancelled = true;
    };
  }, [sp, callbackUrl, retryCount]);

  useEffect(() => {
    if (!resolvedToken || autoSendStatus !== 'idle') return;

    const tryAutoSend = async () => {
      setAutoSendStatus('sending');

      if (callbackUrl) {
        try {
          console.log('[DesktopCallback] Auto-send: fetch POST to callbackUrl');
          const res = await fetch(`${callbackUrl}/api/desktop-auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: resolvedToken,
              email: resolvedEmail,
              userId: resolvedUserId,
              name: resolvedName,
            }),
          });
          const data = await res.json();
          if (data.ok) {
            console.log('[DesktopCallback] ✅ Auto-send success');
            setAutoSendStatus('sent');
            return;
          }
        } catch (e) {
          console.log('[DesktopCallback] ❌ Auto-send failed (expected: mixed content):', e);
        }
      }

      console.log('[DesktopCallback] Auto-send failed, showing button for user');
      setAutoSendStatus('failed');
    };

    const timer = setTimeout(tryAutoSend, 500);
    return () => clearTimeout(timer);
  }, [resolvedToken, callbackUrl, autoSendStatus, resolvedEmail, resolvedUserId, resolvedName]);

  const handleOpenDesktop = () => {
    if (callbackUrl) {
      try {
        const redirectUrl = `${callbackUrl}/api/desktop-login-redirect?token=${encodeURIComponent(resolvedToken)}&email=${encodeURIComponent(resolvedEmail)}&userId=${encodeURIComponent(resolvedUserId)}&name=${encodeURIComponent(resolvedName)}`;
        console.log('[DesktopCallback] Button clicked - Redirecting to callback URL');
        window.location.href = redirectUrl;
        return;
      } catch (e) {
        console.log('[DesktopCallback] Redirect failed, trying deep link:', e);
      }
    }

    const deepLink = `clipop://login-success?token=${encodeURIComponent(resolvedToken)}&email=${encodeURIComponent(resolvedEmail)}&userId=${encodeURIComponent(resolvedUserId)}&name=${encodeURIComponent(resolvedName)}`;
    console.log('[DesktopCallback] Button clicked - Opening deep link:', deepLink);
    window.location.href = deepLink;
  };

  const handleRetry = () => {
    setError('');
    setRetryCount(prev => prev + 1);
  };

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
          {resolvedEmail && !error && !loading && (
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-7 w-7 text-green-500" />
              </div>
              <p className="text-sm text-foreground">
                Signed in as: <span className="font-medium">{resolvedEmail}</span>
              </p>
            </div>
          )}

          {error && (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Retry
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Completing sign-in...</p>
            </div>
          )}

          {!loading && resolvedToken && !error && (
            <div className="space-y-4">
              {autoSendStatus === 'sending' && (
                <p className="text-sm text-muted-foreground animate-pulse">
                  Returning to desktop app...
                </p>
              )}
              {autoSendStatus === 'sent' && (
                <p className="text-sm text-green-600">
                  ✅ Returning to desktop app...
                </p>
              )}
              {autoSendStatus === 'failed' && (
                <p className="text-sm text-amber-600">
                  ⚠️ Click the button below to return to the desktop app.
                </p>
              )}
              <Button
                size="lg"
                className="w-full"
                onClick={handleOpenDesktop}
              >
                <Monitor className="w-4 h-4 mr-2" />
                Open Clipop Agent
              </Button>
              <p className="text-sm text-muted-foreground">
                If the desktop app didn&apos;t open, please switch to it manually.
              </p>
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
