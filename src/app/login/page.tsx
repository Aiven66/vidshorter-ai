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
import { Video, CheckCircle, Mail, Lock, Monitor } from 'lucide-react';
import { GoogleLoginButton } from '@/components/google-login-button';
import { posthog } from '@/lib/posthog';
import {
  getDesktopCallbackFromSearch,
  isDesktopAuthRequest,
  openDesktopAuthReturn,
  rememberDesktopAuth,
} from '@/lib/desktop-auth';

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
  const [currentRefreshToken, setCurrentRefreshToken] = useState<string | null>(null);
  const [desktopSendStatus, setDesktopSendStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const fromDesktop = sp.get('from') === 'desktop' || sp.get('desktop') === '1';
  const callbackUrl = sp.get('callback') || '';

  useEffect(() => {
    const urlError = sp.get('error');
    if (urlError) {
      setError(decodeURIComponent(urlError));
    }
  }, [sp]);

  useEffect(() => {
    if (fromDesktop) {
      rememberDesktopAuth(callbackUrl);
    }
  }, [fromDesktop, callbackUrl]);

  const isDesktopFlow = isDesktopAuthRequest(sp);
  const savedCallbackUrl = getDesktopCallbackFromSearch(sp);

  const showDesktopSuccess = isDesktopFlow && (loginSuccess || (!authLoading && !!user));

  useEffect(() => {
    if (isDesktopFlow && !loginSuccess && !authLoading && !!user && !!accessToken) {
      console.log('[DesktopAuth] User authenticated in desktop flow, forcing loginSuccess');
      setCurrentToken(accessToken);
      setLoginSuccess(true);
    }
  }, [isDesktopFlow, loginSuccess, authLoading, user, accessToken]);

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

    if (posthog) {
      posthog.capture('user_logged_in', {
        email,
        login_method: 'email_password',
      });
    }

    if (isDesktopFlow) {
      const token = result.token || accessToken;
      console.log('[DesktopAuth] Login complete, token received:', !!token);
      setCurrentToken(token);
      if (result.refreshToken) setCurrentRefreshToken(result.refreshToken);
      setLoginSuccess(true);
      setLoading(false);
    } else {
      window.location.href = '/';
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    if (isDesktopFlow) {
      rememberDesktopAuth(savedCallbackUrl);
    }
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setLoading(false);
    }
  };

  const handleReturnToDesktop = () => {
    const token = currentToken || accessToken;
    const tokenEmail = user?.email || email;
    const tokenUserId = user?.id || '';
    const tokenName = user?.name || '';
    const payload = {
      token,
      refreshToken: currentRefreshToken || undefined,
      email: tokenEmail,
      userId: tokenUserId,
      name: tokenName,
    };

    const result = openDesktopAuthReturn(savedCallbackUrl, payload);
    console.log('[DesktopAuth] Returning via deep link and local callback:', {
      hasDeepLink: !!result.deepLink,
      hasRedirectUrl: !!result.redirectUrl,
    });
  };

  if (showDesktopSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 py-12 px-4">
        <Card className="w-full max-w-md shadow-lg border-0">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 font-bold text-2xl mb-4">
              <Video className="h-7 w-7 text-primary" />
              <span>Clipop AI</span>
            </div>
            <CardTitle className="text-xl">{t('login.successTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-500" />
              </div>
              <p className="text-center text-muted-foreground">
                {t('login.successMessage')} <strong>{user?.email || email}</strong>
              </p>
            </div>
            <Button className="w-full h-12 text-lg" onClick={handleReturnToDesktop}>
              <Monitor className="w-5 h-5 mr-2" />
              {t('login.returnToDesktop')}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t('login.desktopNotOpened')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 py-12 px-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2 font-bold text-2xl mb-2">
            <Video className="h-7 w-7 text-primary" />
            <span>Clipop AI</span>
          </div>
          <CardTitle className="text-2xl">{t('login.title')}</CardTitle>
          <CardDescription>{t('login.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 text-sm flex items-center gap-2">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">{t('login.emailLabel')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder={t('login.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10 h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">{t('login.passwordLabel')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder={t('login.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10 h-11"
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
              {loading ? t('common.loading') : t('login.submitButton')}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted-foreground">
                {t('login.orContinueWith')}
              </span>
            </div>
          </div>

          <GoogleLoginButton onGoogleClick={handleGoogleSignIn} />

          <div className="text-center text-sm pt-1">
            {t('login.dontHaveAccount')}{' '}
            <Link href={isDesktopFlow ? `/register?from=desktop${savedCallbackUrl ? `&callback=${encodeURIComponent(savedCallbackUrl)}` : ''}` : '/register'} className="text-primary font-medium hover:underline">
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30"><div className="flex flex-col items-center gap-4"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /><p className="text-muted-foreground">Loading...</p></div></div>}>
      <LoginContent />
    </Suspense>
  );
}
