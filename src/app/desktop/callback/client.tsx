'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabaseClient, isSupabaseConfigured } from '@/storage/database/supabase-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function buildRedirectUrl(redirectUri: string, params: Record<string, string>) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export default function DesktopCallbackClient() {
  const sp = useSearchParams();
  const [msg, setMsg] = useState('Signing you in...');

  const redirectUri = useMemo(() => sp.get('redirect_uri') || '', [sp]);
  const state = useMemo(() => sp.get('state') || '', [sp]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!redirectUri) { setMsg('Missing redirect_uri'); return; }
      if (!isSupabaseConfigured()) { setMsg('Auth service not configured'); return; }
      try {
        const client = getSupabaseClient();
        const { data } = await client.auth.getSession();
        const token = data?.session?.access_token || '';
        if (!token) { setMsg('No session found. Please sign in again.'); return; }
        const url = buildRedirectUrl(redirectUri, { state, access_token: token });
        if (cancelled) return;
        window.location.href = url;
      } catch {
        setMsg('Failed to complete desktop sign-in');
      }
    })();
    return () => { cancelled = true; };
  }, [redirectUri, state]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>VidShorter Agent</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          {msg}
        </CardContent>
      </Card>
    </div>
  );
}

