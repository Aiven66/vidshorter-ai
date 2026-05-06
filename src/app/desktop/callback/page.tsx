'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle, Monitor, ExternalLink, RefreshCw } from 'lucide-react';
import { getSupabaseClient } from '@/storage/database/supabase-client';

function DesktopCallbackContent() {
  const sp = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'ready' | 'needs_login' | 'error'>('checking');
  const [msg, setMsg] = useState('Checking authentication status...');
  const [redirectUrl, setRedirectUrl] = useState('');

  const redirectUri = useMemo(() => sp.get('redirect_uri') || '', [sp]);
  const state = useMemo(() => sp.get('state') || '', [sp]);

  const checkAuthAndGetToken = async () => {
    let token = '';
    
    // 来源1: URL参数 - 登录页面直接传递的token（最可靠）
    const urlToken = sp.get('access_token');
    if (urlToken) {
      token = urlToken;
      console.log('[DesktopCallback] Got token from URL parameter');
      if (typeof window !== 'undefined') {
        localStorage.setItem('vidshorter_access_token', token);
      }
      return token;
    }
    
    // 来源2: localStorage - 登录页面保存的token
    if (!token && typeof window !== 'undefined') {
      const stored = localStorage.getItem('vidshorter_access_token');
      if (stored) {
        token = stored;
        console.log('[DesktopCallback] Got token from localStorage');
      }
    }
    
    // 来源3: Supabase session
    if (!token) {
      try {
        const client = getSupabaseClient();
        const { data } = await client.auth.getSession();
        if (data?.session?.access_token) {
          token = data.session.access_token;
          if (typeof window !== 'undefined') {
            localStorage.setItem('vidshorter_access_token', token);
          }
          console.log('[DesktopCallback] Got token from Supabase session');
        }
      } catch (e) {
        console.error('[DesktopCallback] Failed to get session:', e);
      }
    }
    
    return token;
  };

  useEffect(() => {
    if (!redirectUri) {
      setStatus('error');
      setMsg('Missing redirect_uri parameter');
      return;
    }

    const checkAuth = async () => {
      try {
        const token = await checkAuthAndGetToken();
        
        if (token) {
          // 构建深度链接
          const url = new URL(redirectUri);
          url.searchParams.set('state', state);
          url.searchParams.set('access_token', token);
          setRedirectUrl(url.toString());
          setStatus('ready');
          setMsg('Authentication successful!');
          
          // 尝试自动打开桌面客户端
          setTimeout(() => {
            try {
              window.location.href = url.toString();
            } catch (e) {
              console.error('Auto-open failed', e);
            }
          }, 1500);
        } else {
          setStatus('needs_login');
          setMsg('Please sign in first to continue');
        }
      } catch (e) {
        console.error('[DesktopCallback] Error', e);
        setStatus('error');
        setMsg('Something went wrong');
      }
    };

    checkAuth();
  }, [redirectUri, state]);

  const handleOpenDesktop = () => {
    if (!redirectUrl) return;
    try {
      window.location.href = redirectUrl;
    } catch (e) {
      console.error('Failed to open desktop', e);
    }
  };

  const handleGoToLogin = () => {
    const params = new URLSearchParams();
    params.set('desktop', '1');
    params.set('redirect_uri', redirectUri);
    params.set('state', state);
    router.push(`/login?${params.toString()}`);
  };

  const handleRetry = async () => {
    setStatus('checking');
    setMsg('Checking authentication status...');
    
    try {
      const token = await checkAuthAndGetToken();
      
      if (token) {
        const url = new URL(redirectUri);
        url.searchParams.set('state', state);
        url.searchParams.set('access_token', token);
        setRedirectUrl(url.toString());
        setStatus('ready');
        setMsg('Authentication successful!');
      } else {
        setStatus('needs_login');
        setMsg('Please sign in first to continue');
      }
    } catch (e) {
      console.error('[DesktopCallback] Retry failed:', e);
      setStatus('error');
      setMsg('Retry failed, please try again');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              {status === 'checking' ? (
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
            {status === 'ready' ? 'Complete the sign-in process' : 'Sign in to continue'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <p className="text-sm text-muted-foreground">{msg}</p>
          
          {status === 'checking' && (
            <p className="text-xs text-muted-foreground">Please wait while we verify your session...</p>
          )}
          
          {status === 'ready' && (
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
                Click the button to return to the desktop app
              </p>
            </div>
          )}
          
          {status === 'needs_login' && (
            <div className="space-y-4">
              <Button 
                size="lg" 
                variant="outline" 
                className="w-full" 
                onClick={handleRetry}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Check
              </Button>
              <Button 
                size="lg" 
                className="w-full" 
                onClick={handleGoToLogin}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Sign In First
              </Button>
              <p className="text-xs text-muted-foreground">
                Please sign in before returning to the desktop app
              </p>
            </div>
          )}
          
          {status === 'error' && (
            <div className="space-y-4">
              <Button 
                size="lg" 
                variant="outline" 
                className="w-full" 
                onClick={handleRetry}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="w-full" 
                onClick={() => window.location.href = '/'}
              >
                Go Home
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
                <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              </div>
            </div>
            <CardTitle className="text-2xl">VidShorter Agent</CardTitle>
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