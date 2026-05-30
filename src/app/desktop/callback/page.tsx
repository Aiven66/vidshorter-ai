'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { Monitor, CheckCircle, Loader2 } from 'lucide-react';
import { useLocale } from '@/lib/locale-context';

function DesktopCallbackContent() {
  const sp = useSearchParams();
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [resolvedToken, setResolvedToken] = useState('');
  const [resolvedUserId, setResolvedUserId] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  const [autoSendStatus, setAutoSendStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [retryCount, setRetryCount] = useState(0);

  const callbackUrl = useMemo(() => sp.get('callback') || sessionStorage.getItem('clipop_desktop_callback') || '', [sp]);
  const emailParam = useMemo(() => sp.get('email') || '', [sp]);
  const codeParam = useMemo(() => sp.get('code') || '', [sp]);

  const queryAccessToken = useMemo(() => sp.get('access_token') || '', [sp]);

  const hashAccessToken = useMemo(() => {
    if (typeof window === 'undefined') return '';
    try {
      const hash = window.location.hash;
      if (!hash) return '';
      const hashParams = new URLSearchParams(hash.substring(1));
      return hashParams.get('access_token') || '';
    } catch {
      return '';
    }
  }, []);

  const accessTokenParam = queryAccessToken || hashAccessToken;

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

        console.log('[DesktopCallback] Session check - token:', !!token, 'user:', !!user, 'accessTokenParam:', !!accessTokenParam);

        if (!token || !user) {
          throw new Error('No session found. Please try signing in again.');
        }

        if (!cancelled) {
          setResolvedToken(token);
          setResolvedEmail(emailParam || user.email || '');
          setResolvedUserId(user.id || '');
          setResolvedName(user.user_metadata?.name || user.email?.split('@')[0] || '');
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
  }, [accessTokenParam, codeParam, emailParam, retryCount]);

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
  }, [resolvedToken, callbackUrl, autoSendStatus]);

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
          {(resolvedEmail || emailParam) && !error && !loading && (
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-7 w-7 text-green-500" />
              </div>
              <p className="text-sm text-foreground">
                Signed in as: <span className="font-medium">{resolvedEmail || emailParam}</span>
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
