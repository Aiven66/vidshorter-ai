'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle, Monitor, ExternalLink, RefreshCw } from 'lucide-react';

interface LoginStatus {
  loggedIn: boolean;
  userId?: string;
  email?: string;
  accessToken?: string;
  error?: string;
}

function DesktopCallbackContent() {
  const sp = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'ready' | 'needs_login' | 'error'>('checking');
  const [msg, setMsg] = useState('Checking authentication status...');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [email, setEmail] = useState('');

  const redirectUri = useMemo(() => sp.get('redirect_uri') || '', [sp]);
  const state = useMemo(() => sp.get('state') || '', [sp]);

  const checkLoginStatus = async (): Promise<LoginStatus> => {
    try {
      const response = await fetch('/api/check-login', {
        method: 'GET',
        credentials: 'include'
      });
      const data = await response.json();
      return data;
    } catch (e) {
      console.error('Failed to check login status:', e);
      return { loggedIn: false, error: 'Failed to check login' };
    }
  };

  useEffect(() => {
    if (!redirectUri) {
      setStatus('error');
      setMsg('Missing redirect_uri parameter');
      return;
    }

    const checkAuth = async () => {
      try {
        const loginStatus = await checkLoginStatus();
        
        if (loginStatus.loggedIn && loginStatus.accessToken) {
          setEmail(loginStatus.email || '');
          
          const url = new URL(redirectUri);
          url.searchParams.set('state', state);
          url.searchParams.set('access_token', loginStatus.accessToken);
          setRedirectUrl(url.toString());
          setStatus('ready');
          setMsg('Authentication successful!');
          
          setTimeout(() => {
            try {
              window.location.href = url.toString();
            } catch (e) {
              console.error('Auto-open failed', e);
            }
          }, 1500);
        } else {
          setStatus('needs_login');
          setMsg(loginStatus.error || 'Please sign in first to continue');
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
      const loginStatus = await checkLoginStatus();
      
      if (loginStatus.loggedIn && loginStatus.accessToken) {
        setEmail(loginStatus.email || '');
        
        const url = new URL(redirectUri);
        url.searchParams.set('state', state);
        url.searchParams.set('access_token', loginStatus.accessToken);
        setRedirectUrl(url.toString());
        setStatus('ready');
        setMsg('Authentication successful!');
      } else {
        setStatus('needs_login');
        setMsg(loginStatus.error || 'Please sign in first to continue');
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
              {email && (
                <p className="text-sm text-foreground">
                  Signed in as: <span className="font-medium">{email}</span>
                </p>
              )}
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