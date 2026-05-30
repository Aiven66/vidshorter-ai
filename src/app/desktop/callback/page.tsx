'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { Monitor, CheckCircle, Loader2 } from 'lucide-react';

function DesktopCallbackContent() {
  const sp = useSearchParams();
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [resolvedToken, setResolvedToken] = useState('');
  const [resolvedUserId, setResolvedUserId] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  const [autoRedirected, setAutoRedirected] = useState(false);

  const redirectUri = useMemo(() => sp.get('redirect_uri') || 'clipop://login-success', [sp]);
  const callbackUrl = useMemo(() => sp.get('callback') || '', [sp]);
  const state = useMemo(() => sp.get('state') || '', [sp]);
  const email = useMemo(() => sp.get('email') || '', [sp]);
  const accessToken = useMemo(() => sp.get('access_token') || '', [sp]);
  const code = useMemo(() => sp.get('code') || '', [sp]);

  useEffect(() => {
    let cancelled = false;

    async function resolveSession() {
      setLoading(true);
      setError('');

      try {
        const client = getSupabaseClient();

        if (code) {
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        const { data: { session } } = await client.auth.getSession();
        const token = accessToken || session?.access_token || '';
        const user = session?.user;

        if (!token || !user) {
          throw new Error('No desktop session was returned. Please try signing in again.');
        }

        if (!cancelled) {
          setResolvedToken(token);
          setResolvedEmail(email || user.email || '');
          setResolvedUserId(user.id || '');
          setResolvedName(user.user_metadata?.name || user.email?.split('@')[0] || '');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to complete desktop sign-in.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolveSession();

    return () => {
      cancelled = true;
    };
  }, [accessToken, code, email]);

  useEffect(() => {
    if (!resolvedToken || autoRedirected) return;

    const timer = setTimeout(() => {
      setAutoRedirected(true);

      if (callbackUrl) {
        const redirectUrl = `${callbackUrl}/api/desktop-login-redirect?token=${encodeURIComponent(resolvedToken)}&email=${encodeURIComponent(resolvedEmail)}&userId=${encodeURIComponent(resolvedUserId)}&name=${encodeURIComponent(resolvedName)}`;
        console.log('[DesktopCallback] Auto-redirecting to callback URL');
        window.location.href = redirectUrl;
      } else {
        const url = new URL(redirectUri);
        url.searchParams.set('state', state);
        url.searchParams.set('token', resolvedToken);
        url.searchParams.set('access_token', resolvedToken);
        url.searchParams.set('email', resolvedEmail);
        url.searchParams.set('userId', resolvedUserId);
        url.searchParams.set('name', resolvedName);
        console.log('[DesktopCallback] Auto-redirecting via deep link');
        window.location.href = url.toString();
      }

      setOpened(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [resolvedToken, callbackUrl, redirectUri, state, resolvedEmail, resolvedUserId, resolvedName, autoRedirected]);

  const handleOpenDesktop = () => {
    if (callbackUrl && resolvedToken) {
      const redirectUrl = `${callbackUrl}/api/desktop-login-redirect?token=${encodeURIComponent(resolvedToken)}&email=${encodeURIComponent(resolvedEmail)}&userId=${encodeURIComponent(resolvedUserId)}&name=${encodeURIComponent(resolvedName)}`;
      window.location.href = redirectUrl;
    } else if (redirectUri) {
      const url = new URL(redirectUri);
      url.searchParams.set('state', state);
      if (resolvedToken) {
        url.searchParams.set('token', resolvedToken);
        url.searchParams.set('access_token', resolvedToken);
        url.searchParams.set('email', resolvedEmail);
        url.searchParams.set('userId', resolvedUserId);
        url.searchParams.set('name', resolvedName);
      }
      window.location.href = url.toString();
    }
    setOpened(true);
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
            {opened ? 'Returning to desktop app...' : loading ? 'Completing sign-in...' : 'Sign-in successful!'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          {(resolvedEmail || email) && (
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-7 w-7 text-green-500" />
              </div>
              <p className="text-sm text-foreground">
                Signed in as: <span className="font-medium">{resolvedEmail || email}</span>
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Completing sign-in...</p>
            </div>
          )}

          {!opened && !loading && resolvedToken && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Automatically returning to desktop app...
              </p>
              <Button
                size="lg"
                className="w-full"
                onClick={handleOpenDesktop}
              >
                <Monitor className="w-4 h-4 mr-2" />
                Open Clipop Agent Now
              </Button>
            </div>
          )}

          {opened && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                If the desktop app didn&apos;t open, please open it manually.
              </p>
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                onClick={handleOpenDesktop}
              >
                Try Again
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
            <p className="text-sm text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    }>
      <DesktopCallbackContent />
    </Suspense>
  );
}
