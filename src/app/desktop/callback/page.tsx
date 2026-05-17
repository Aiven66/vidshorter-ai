'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { Monitor } from 'lucide-react';

function DesktopCallbackContent() {
  const sp = useSearchParams();
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [resolvedToken, setResolvedToken] = useState('');
  const [resolvedUserId, setResolvedUserId] = useState('');
  const [resolvedName, setResolvedName] = useState('');

  const redirectUri = useMemo(() => sp.get('redirect_uri') || 'clipop://login-success', [sp]);
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

  const handleOpenDesktop = () => {
    if (!redirectUri) return;
    
    const url = new URL(redirectUri);
    url.searchParams.set('state', state);
    if (resolvedToken) {
      url.searchParams.set('token', resolvedToken);
      url.searchParams.set('access_token', resolvedToken);
      url.searchParams.set('email', resolvedEmail);
      url.searchParams.set('userId', resolvedUserId);
      url.searchParams.set('name', resolvedName);
    }
    
    try {
      window.location.href = url.toString();
      setOpened(true);
    } catch (e) {
      console.error('Failed to open desktop', e);
    }
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
            {opened ? 'Opening desktop app...' : loading ? 'Completing sign-in...' : 'Complete the sign-in process'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          {(resolvedEmail || email) && (
            <p className="text-sm text-foreground">
              Signed in as: <span className="font-medium">{resolvedEmail || email}</span>
            </p>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          
          {!opened ? (
            <div className="space-y-4">
              <Button 
                size="lg" 
                className="w-full" 
                onClick={handleOpenDesktop}
                disabled={loading || !resolvedToken}
              >
                <Monitor className="w-4 h-4 mr-2" />
                Open Clipop Agent
              </Button>
              <p className="text-xs text-muted-foreground">
                Click the button to return to the desktop app
              </p>
            </div>
          ) : (
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
