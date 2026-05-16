'use client';

import { Suspense, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Video, CheckCircle } from 'lucide-react';

function LoginContent() {
  const { t } = useLocale();
  const { signIn, signInWithGoogle, user, loading: authLoading, accessToken } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [sentToDesktop, setSentToDesktop] = useState(false);

  const fromDesktop = sp.get('from') === 'desktop' || sp.get('desktop') === '1';
  const callbackUrl = sp.get('callback') || '';

  const showDesktopSuccess = fromDesktop && (loginSuccess || (!authLoading && !!user));

  const sendTokenToDesktop = async (token: string | null) => {
    if (!token || sentToDesktop) return;

    console.log('[DesktopAuth] sendTokenToDesktop starting...');
    setSentToDesktop(true);

    if (callbackUrl) {
      try {
        console.log('[DesktopAuth] Method 1: HTTP POST to callbackUrl:', callbackUrl);
        const res = await fetch(`${callbackUrl}/api/desktop-auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            email: user?.email || email,
            userId: user?.id || '',
            name: user?.name || '',
          }),
        });
        const data = await res.json();
        console.log('[DesktopAuth] HTTP callback response:', data);
        if (data.ok) {
          console.log('[DesktopAuth] ✅ Method 1 success');
          return;
        }
      } catch (e) {
        console.log('[DesktopAuth] ❌ Method 1 failed:', e);
      }
    }

    try {
      console.log('[DesktopAuth] Method 2: Deep link');
      const deepLink = `vidshorter://login-success?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user?.email || email)}&userId=${encodeURIComponent(user?.id || '')}&name=${encodeURIComponent(user?.name || '')}`;
      console.log('[DesktopAuth] Deep link URL:', deepLink);
      window.location.href = deepLink;
    } catch (e) {
      console.log('[DesktopAuth] ❌ Method 2 failed:', e);
    }
  };

  useEffect(() => {
    if (showDesktopSuccess && !sentToDesktop) {
      const token = currentToken || accessToken;
      console.log('[DesktopAuth] showDesktopSuccess is true, token present:', !!token);
      if (token) {
        console.log('[DesktopAuth] Calling sendTokenToDesktop from useEffect...');
        sendTokenToDesktop(token);
      }
    }
  }, [showDesktopSuccess, sentToDesktop]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn(email, password);
    
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    if (fromDesktop) {
      const token = result.token || accessToken;
      console.log('[DesktopAuth] Login complete, token received:', !!token);
      setCurrentToken(token);
      setLoginSuccess(true);
      setLoading(false);
      if (token) {
        sendTokenToDesktop(token);
      }
    } else {
      router.push('/dashboard');
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else if (fromDesktop) {
      setLoginSuccess(true);
      setLoading(false);
    }
  };

  const handleReturnToDesktop = () => {
    const token = currentToken || accessToken;
    
    const deepLink = `vidshorter://login-success?token=${encodeURIComponent(token || '')}&email=${encodeURIComponent(user?.email || email)}&userId=${encodeURIComponent(user?.id || '')}&name=${encodeURIComponent(user?.name || '')}`;
    console.log('[DesktopAuth] Button clicked - Opening deep link:', deepLink);
    
    const startTime = Date.now();
    const fallbackTimeout = 2000;
    
    const fallback = () => {
      if (Date.now() - startTime < fallbackTimeout) return;
      console.log('[DesktopAuth] Deep link timeout, fallback to HTTP');
      if (callbackUrl) {
        const redirectUrl = `${callbackUrl}/api/desktop-login-redirect?token=${encodeURIComponent(token || '')}&email=${encodeURIComponent(user?.email || email)}&userId=${encodeURIComponent(user?.id || '')}&name=${encodeURIComponent(user?.name || '')}`;
        window.location.href = redirectUrl;
      }
    };
    
    setTimeout(fallback, fallbackTimeout);
    
    window.location.href = deepLink;
  };

  if (showDesktopSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 font-bold text-xl mb-4">
              <Video className="h-6 w-6 text-primary" />
              <span>VidShorter AI</span>
            </div>
            <CardTitle>Login Successful!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-500" />
              </div>
              <p className="text-center text-muted-foreground">
                You have successfully logged in as <strong>{user?.email || email}</strong>. Click the button below to return to the desktop app.
              </p>
            </div>
            <Button className="w-full h-12 text-lg" onClick={handleReturnToDesktop}>
              Return to VidShorter Agent
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              If the desktop app doesn't open automatically, please make sure VidShorter Agent is running.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 font-bold text-xl mb-4">
            <Video className="h-6 w-6 text-primary" />
            <span>VidShorter AI</span>
          </div>
          <CardTitle>{t('login.title')}</CardTitle>
          <CardDescription>{t('login.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('login.emailLabel')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('login.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('login.passwordLabel')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('common.loading') : t('login.submitButton')}
            </Button>
          </form>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                {t('login.orContinueWith')}
              </span>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={loading}>
            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t('login.googleButton')}
          </Button>
          <div className="text-center text-sm">
            {t('login.dontHaveAccount')}{' '}
            <Link href={fromDesktop ? `/register?from=desktop${callbackUrl ? `&callback=${encodeURIComponent(callbackUrl)}` : ''}` : '/register'} className="text-primary hover:underline">
              {t('login.signUp')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
