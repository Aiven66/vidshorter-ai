'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getSupabaseClient, isSupabaseConfigured } from '@/storage/database/supabase-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle, ExternalLink, Monitor } from 'lucide-react';

function buildRedirectUrl(redirectUri: string, params: Record<string, string>) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export default function DesktopCallbackClient() {
  const sp = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [msg, setMsg] = useState('Preparing your session...');
  const [token, setToken] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');

  const redirectUri = useMemo(() => sp.get('redirect_uri') || '', [sp]);
  const state = useMemo(() => sp.get('state') || '', [sp]);

  // 无论什么情况，先构建一个默认的 redirectUrl
  useEffect(() => {
    if (redirectUri) {
      // 即使还没有token，也先准备一个基础的重定向URL
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
        let accessToken = '';
        
        // 先尝试获取session
        if (isSupabaseConfigured()) {
          try {
            const client = getSupabaseClient();
            const { data } = await client.auth.getSession();
            accessToken = data?.session?.access_token || '';
          } catch {
            // 忽略错误，继续尝试
          }
        }
        
        // 构建最终的重定向URL
        const url = buildRedirectUrl(redirectUri, { 
          state, 
          access_token: accessToken 
        });
        
        setToken(accessToken);
        setRedirectUrl(url);
        
        if (accessToken) {
          localStorage.setItem('vidshorter_desktop_login', 'true');
          setStatus('ready');
          setMsg('You are signed in successfully!');
          
          // Try to auto-redirect after 2 seconds
          setTimeout(() => {
            if (cancelled) return;
            try {
              window.location.href = url;
            } catch {
              // Auto-redirect failed, user needs to click manually
            }
          }, 2000);
        } else {
          // 即使没有token，也让用户尝试打开桌面端
          setStatus('error');
          setMsg('Please try opening the desktop app manually');
        }
      } catch {
        setStatus('error');
        setMsg('Please try opening the desktop app manually');
      }
    })();
    return () => { cancelled = true; };
  }, [redirectUri, state]);

  const handleOpenDesktop = () => {
    if (!redirectUrl) return;
    try {
      window.location.href = redirectUrl;
    } catch (e) {
      console.error('Failed to open desktop app:', e);
    }
  };

  // 始终显示按钮
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
          
          {!shouldShowOpenButton && (
            <div className="space-y-4">
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
