'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getSupabaseClient, isSupabaseConfigured } from '@/storage/database/supabase-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { CheckCircle2, AlertCircle, ExternalLink, Monitor } from 'lucide-react';

function buildRedirectUrl(redirectUri: string, params: Record<string, string>) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export default function DesktopCallbackClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [msg, setMsg] = useState('Preparing your session...');
  const [token, setToken] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');

  const redirectUri = useMemo(() => sp.get('redirect_uri') || '', [sp]);
  const state = useMemo(() => sp.get('state') || '', [sp]);

  useEffect(() => {
    if (redirectUri) {
      const defaultUrl = buildRedirectUrl(redirectUri, { state, access_token: '' });
      setRedirectUrl(defaultUrl);
    }
  }, [redirectUri, state]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!redirectUri) {
        setMsg('Missing redirect_uri parameter');
        setStatus('error');
        return;
      }
      
      try {
        let accessTokenValue = '';
        
        // 方法1: 从Auth Context获取token（如果已经初始化）
        if (accessToken) {
          accessTokenValue = accessToken;
          console.log('[DesktopCallback] Token from Auth Context');
        }
        
        // 方法2: 从localStorage获取
        if (!accessTokenValue && typeof window !== 'undefined') {
          const storedToken = localStorage.getItem('vidshorter_access_token');
          if (storedToken) {
            accessTokenValue = storedToken;
            console.log('[DesktopCallback] Token from localStorage');
          }
        }
        
        // 方法3: 尝试从Supabase session获取
        if (!accessTokenValue && isSupabaseConfigured()) {
          try {
            const client = getSupabaseClient();
            const { data } = await client.auth.getSession();
            if (data?.session?.access_token) {
              accessTokenValue = data.session.access_token;
              console.log('[DesktopCallback] Token from Supabase session');
              // 保存到localStorage供后续使用
              if (typeof window !== 'undefined') {
                localStorage.setItem('vidshorter_access_token', accessTokenValue);
              }
            }
          } catch (e) {
            console.log('[DesktopCallback] Failed to get session:', e);
          }
        }
        
        // 方法4: 如果有用户但没有token，尝试刷新session
        if (!accessTokenValue && user && isSupabaseConfigured()) {
          try {
            const client = getSupabaseClient();
            const { error } = await client.auth.refreshSession();
            if (!error) {
              const { data } = await client.auth.getSession();
              if (data?.session?.access_token) {
                accessTokenValue = data.session.access_token;
                console.log('[DesktopCallback] Token from refreshed session');
                if (typeof window !== 'undefined') {
                  localStorage.setItem('vidshorter_access_token', accessTokenValue);
                }
              }
            }
          } catch (e) {
            console.log('[DesktopCallback] Failed to refresh session:', e);
          }
        }
        
        const url = buildRedirectUrl(redirectUri, { 
          state, 
          access_token: accessTokenValue 
        });
        
        setToken(accessTokenValue);
        setRedirectUrl(url);
        
        if (accessTokenValue) {
          localStorage.setItem('vidshorter_desktop_login', 'true');
          setStatus('ready');
          setMsg('You are signed in successfully!');
          
          setTimeout(() => {
            if (cancelled) return;
            try {
              window.location.href = url;
            } catch {
              // Auto-redirect failed
            }
          }, 2000);
        } else {
          setStatus('error');
          setMsg('Please try opening the desktop app manually');
        }
      } catch (e) {
        console.error('[DesktopCallback] Unexpected error:', e);
        setStatus('error');
        setMsg('Please try opening the desktop app manually');
      }
    })();
    return () => { cancelled = true; };
  }, [redirectUri, state, accessToken, user]);

  const handleOpenDesktop = () => {
    if (!redirectUrl) return;
    try {
      window.location.href = redirectUrl;
    } catch (e) {
      console.error('Failed to open desktop app:', e);
    }
  };

  const handleRetry = () => {
    setStatus('loading');
    setMsg('Retrying...');
    // 刷新页面重新获取token
    router.refresh();
  };

  const shouldShowOpenButton = redirectUrl && redirectUri;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              {status === 'loading' ? (
                <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              ) : status === 'ready' ? (
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              ) : (
                <AlertCircle className="w-8 h-8 text-orange-500" />
              )}
            </div>
          </div>
          <CardTitle className="text-2xl">VidShorter Agent</CardTitle>
          <CardDescription>
            {status === 'ready' ? 'Complete the sign-in process' : 'Complete the sign-in process'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <p className="text-sm text-muted-foreground">{msg}</p>
          
          {status === 'loading' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Getting your session token...</p>
            </div>
          )}
          
          {shouldShowOpenButton && (
            <div className="space-y-4">
              <Button 
                size="lg" 
                className="w-full" 
                onClick={handleOpenDesktop}
              >
                <Monitor className="w-4 h-4 mr-2" />
                Open VidShorter Agent
              </Button>
              <p className="text-xs text-muted-foreground">
                Click the button to go back to the desktop app
              </p>
            </div>
          )}
          
          {status === 'error' && !shouldShowOpenButton && (
            <div className="space-y-4">
              <Button 
                size="lg" 
                variant="outline" 
                className="w-full" 
                onClick={handleRetry}
              >
                Retry
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="w-full" 
                onClick={() => window.location.href = '/login'}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Sign In Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}