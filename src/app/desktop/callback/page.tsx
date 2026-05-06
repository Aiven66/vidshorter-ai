'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle, Monitor, ExternalLink, RefreshCw } from 'lucide-react';

function DesktopCallbackContent() {
  const sp = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'ready' | 'needs_login' | 'error'>('checking');
  const [msg, setMsg] = useState('Checking authentication status...');
  const [deeplink, setDeeplink] = useState('');
  const [email, setEmail] = useState('');

  // 直接从 URL 参数获取完整的深度链接
  const deeplinkParam = useMemo(() => sp.get('deeplink') || '', [sp]);
  const emailParam = useMemo(() => sp.get('email') || '', [sp]);

  useEffect(() => {
    if (deeplinkParam) {
      // 有完整的深度链接，直接显示成功状态
      setDeeplink(deeplinkParam);
      if (emailParam) {
        setEmail(emailParam);
      }
      setStatus('ready');
      setMsg('Authentication successful!');
      
      // 尝试自动打开桌面客户端
      setTimeout(() => {
        try {
          window.location.href = deeplinkParam;
        } catch (e) {
          console.error('Auto-open failed', e);
        }
      }, 1500);
    } else {
      // 没有深度链接，说明没有从登录页面跳转过来
      setStatus('needs_login');
      setMsg('Please sign in first to continue');
    }
  }, [deeplinkParam, emailParam]);

  const handleOpenDesktop = () => {
    if (!deeplink) return;
    try {
      window.location.href = deeplink;
    } catch (e) {
      console.error('Failed to open desktop', e);
    }
  };

  const handleGoToLogin = () => {
    router.push('/');
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
            <p className="text-xs text-muted-foreground">Please wait...</p>
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
                className="w-full" 
                onClick={handleGoToLogin}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Go to Home
              </Button>
              <p className="text-xs text-muted-foreground">
                Please use desktop app to login
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