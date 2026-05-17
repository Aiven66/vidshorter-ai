'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Video, Mail, KeyRound, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Suspense } from 'react';

type Step = 'info' | 'verify' | 'done';

function RegisterContent() {
  const { t } = useLocale();
  const { signUp, signInWithGoogle, user, accessToken } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();

  const [step, setStep] = useState<Step>('info');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [desktopToken, setDesktopToken] = useState<string | null>(null);
  const [desktopEmail, setDesktopEmail] = useState('');
  const [sentToDesktop, setSentToDesktop] = useState(false);

  const fromDesktop = sp.get('from') === 'desktop' || sp.get('desktop') === '1';
  const callbackUrl = sp.get('callback') || '';

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
            email: desktopEmail || user?.email || email,
            userId: user?.id || '',
            name: user?.name || name,
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
      const deepLink = `clipop://login-success?token=${encodeURIComponent(token)}&email=${encodeURIComponent(desktopEmail || user?.email || email)}&userId=${encodeURIComponent(user?.id || '')}&name=${encodeURIComponent(user?.name || name)}`;
      console.log('[DesktopAuth] Deep link URL:', deepLink);
      window.location.href = deepLink;
    } catch (e) {
      console.log('[DesktopAuth] ❌ Method 2 failed:', e);
    }
  };

  useEffect(() => {
    if (step === 'done' && desktopToken && !sentToDesktop) {
      console.log('[DesktopAuth] Step done, token present, calling sendTokenToDesktop...');
      sendTokenToDesktop(desktopToken);
    }
  }, [step, desktopToken, sentToDesktop]);

  const handleSendCode = async () => {
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!email.trim()) { setError('Please enter your email'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setSendingCode(true);
    setError('');

    try {
      const checkRes = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const checkData = await checkRes.json();

      if (checkData.exists) {
        setError('This email is already registered. Please log in instead.');
        return;
      }

      const res = await fetch('/api/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send code');
        return;
      }

      setStep('verify');
      setCountdown(60);
      const id = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { clearInterval(id); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) { setError('Please enter 6-digit code'); return; }
    setLoading(true);
    setError('');

    try {
      const result = await signUp(email, password, name);
      if (result.error) {
        setError(result.error);
        return;
      }

      if (fromDesktop) {
        const token = result.token || accessToken;
        console.log('[DesktopAuth] Registration complete, token received:', !!token);
        setDesktopToken(token);
        setDesktopEmail(email);
        setStep('done');
        if (token) {
          sendTokenToDesktop(token);
        }
      } else {
        router.push('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToDesktop = () => {
    const token = desktopToken || accessToken;
    
    const deepLink = `clipop://login-success?token=${encodeURIComponent(token || '')}&email=${encodeURIComponent(desktopEmail || user?.email || email)}&userId=${encodeURIComponent(user?.id || '')}&name=${encodeURIComponent(user?.name || name)}`;
    console.log('[DesktopAuth] Button clicked - Opening deep link:', deepLink);
    
    const startTime = Date.now();
    const fallbackTimeout = 2000;
    
    const fallback = () => {
      if (Date.now() - startTime < fallbackTimeout) return;
      console.log('[DesktopAuth] Deep link timeout, fallback to HTTP');
      if (callbackUrl) {
        const redirectUrl = `${callbackUrl}/api/desktop-login-redirect?token=${encodeURIComponent(token || '')}&email=${encodeURIComponent(desktopEmail || user?.email || email)}&userId=${encodeURIComponent(user?.id || '')}&name=${encodeURIComponent(user?.name || name)}`;
        window.location.href = redirectUrl;
      }
    };
    
    setTimeout(fallback, fallbackTimeout);
    
    window.location.href = deepLink;
  };

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 font-bold text-xl mb-4">
              <Video className="h-6 w-6 text-primary" />
              <span>Clipop AI</span>
            </div>
            <CardTitle>Account Created Successfully!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-500" />
              </div>
              <p className="text-center text-muted-foreground">
                You have successfully created your account as <strong>{desktopEmail || user?.email || email}</strong>. Click the button below to return to the desktop app.
              </p>
            </div>
            <Button className="w-full h-12 text-lg" onClick={handleReturnToDesktop}>
              Return to Clipop Agent
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              If the desktop app doesn't open automatically, please make sure Clipop Agent is running.
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
            <span>Clipop AI</span>
          </div>
          <CardTitle>{t('register.title')}</CardTitle>
          <CardDescription>{t('register.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {step === 'info' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendCode();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name">{t('register.nameLabel')}</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder={t('register.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('register.emailLabel')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('register.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('register.passwordLabel')}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t('register.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('register.confirmPasswordLabel')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder={t('register.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={sendingCode}>
                {sendingCode ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('register.sendingCode')}
                  </>
                ) : (
                  t('register.sendCodeButton')
                )}
              </Button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerify();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="code">{t('register.codeLabel')}</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder={t('register.codePlaceholder')}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  maxLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  t('register.verifyButton')
                )}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                {t('register.codeNotReceived')}{' '}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  disabled={countdown > 0 || sendingCode}
                  onClick={() => {
                    setStep('info');
                    setCountdown(0);
                  }}
                >
                  {countdown > 0 ? `${t('register.resendIn')} ${countdown}s` : t('register.resendButton')}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setStep('info')}
                disabled={loading}
              >
                {t('register.backButton')}
              </Button>
            </form>
          )}

          <Separator />
          <Button
            variant="outline"
            className="w-full"
            onClick={signInWithGoogle}
            disabled={loading || sendingCode}
          >
            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t('register.googleButton')}
          </Button>

          <div className="text-center text-sm">
            {t('register.alreadyHaveAccount')}{' '}
            <Link href={fromDesktop ? `/login?from=desktop${callbackUrl ? `&callback=${encodeURIComponent(callbackUrl)}` : ''}` : '/login'} className="text-primary hover:underline">
              {t('register.signIn')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <RegisterContent />
    </Suspense>
  );
}
