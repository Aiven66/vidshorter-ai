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
import { Video, Mail, Lock, User, Loader2, CheckCircle, AlertCircle, KeyRound, Monitor } from 'lucide-react';
import { Suspense } from 'react';
import { GoogleLoginButton } from '@/components/google-login-button';
import { Checkbox } from '@/components/ui/checkbox';
import { posthog } from '@/lib/posthog';
import {
  getDesktopCallbackFromSearch,
  isDesktopAuthRequest,
  openDesktopLocalCallback,
  openDesktopAuthReturn,
  rememberDesktopAuth,
} from '@/lib/desktop-auth';

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
  const [desktopRefreshToken, setDesktopRefreshToken] = useState<string | null>(null);
  const [desktopEmail, setDesktopEmail] = useState('');
  const [desktopSendStatus, setDesktopSendStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const fromDesktop = sp.get('from') === 'desktop' || sp.get('desktop') === '1';
  const callbackUrl = sp.get('callback') || '';

  useEffect(() => {
    if (fromDesktop) {
      rememberDesktopAuth(callbackUrl);
    }
  }, [fromDesktop, callbackUrl]);

  const isDesktopFlow = isDesktopAuthRequest(sp);
  const savedCallbackUrl = getDesktopCallbackFromSearch(sp);

  const handleSendCode = async () => {
    if (!name.trim()) { setError(t('register.errorNameRequired')); return; }
    if (!email.trim()) { setError(t('register.errorEmailRequired')); return; }
    if (password.length < 6) { setError(t('register.errorPasswordLength')); return; }
    if (password !== confirmPassword) { setError(t('register.errorPasswordMismatch')); return; }
    if (!agreedToTerms) { setError(t('register.errorAgreeTerms')); return; }

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
        setError(t('register.errorEmailExists'));
        return;
      }

      const res = await fetch('/api/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('register.errorSendCode'));
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
      setError(t('register.errorNetwork'));
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) { setError(t('register.errorCodeLength')); return; }
    setLoading(true);
    setError('');

    try {
      const result = await signUp(email, password, name);
      if (result.error) {
        setError(result.error);
        return;
      }

      if (posthog) {
        posthog.capture('user_signed_up', {
          email,
          name,
          sign_up_method: 'email_password',
        });
      }

      if (isDesktopFlow) {
        const token = result.token || accessToken;
        console.log('[DesktopAuth] Registration complete, token received:', !!token);
        setDesktopToken(token);
        if (result.refreshToken) setDesktopRefreshToken(result.refreshToken);
        setDesktopEmail(email);
        setStep('done');
      } else {
        window.location.href = '/';
      }
    } finally {
      setLoading(false);
    }
  };

  const buildDesktopPayload = () => {
    const token = desktopToken || accessToken;
    const tokenEmail = desktopEmail || user?.email || email;
    const tokenUserId = user?.id || '';
    const tokenName = user?.name || name;
    return {
      token,
      refreshToken: desktopRefreshToken || undefined,
      email: tokenEmail,
      userId: tokenUserId,
      name: tokenName,
    };
  };

  const handleReturnToDesktop = () => {
    const payload = buildDesktopPayload();
    const result = openDesktopAuthReturn(savedCallbackUrl, payload);
    console.log('[DesktopAuth] Returning via desktop deep link:', {
      hasDeepLink: !!result.deepLink,
      hasRedirectUrl: !!result.redirectUrl,
    });
  };

  const handleLocalDesktopSync = () => {
    const redirectUrl = openDesktopLocalCallback(savedCallbackUrl, buildDesktopPayload());
    console.log('[DesktopAuth] Returning via local callback fallback:', {
      hasRedirectUrl: !!redirectUrl,
    });
  };

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 py-12 px-4">
        <Card className="w-full max-w-md shadow-lg border-0">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 font-bold text-2xl mb-4">
              <Video className="h-7 w-7 text-primary" />
              <span>Clipop AI</span>
            </div>
            <CardTitle className="text-xl">{t('register.successTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-500" />
              </div>
              <p className="text-center text-muted-foreground">
                {t('register.successMessage')} <strong>{desktopEmail || user?.email || email}</strong>。{t('register.successDesktopHint')}
              </p>
            </div>
            <Button className="w-full h-12 text-lg" onClick={handleReturnToDesktop}>
              <Monitor className="w-5 h-5 mr-2" />
              {t('register.returnToDesktop')}
            </Button>
            {savedCallbackUrl && (
              <Button variant="outline" className="w-full h-11" onClick={handleLocalDesktopSync}>
                Sync via local callback
              </Button>
            )}
            <p className="text-center text-sm text-muted-foreground">
              {t('register.desktopNotOpened')}
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
          <CardTitle className="text-2xl">{t('register.title')}</CardTitle>
          <CardDescription>{t('register.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
                <Label htmlFor="name" className="text-sm font-medium">{t('register.nameLabel')}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder={t('register.namePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="pl-10 h-11"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">{t('register.emailLabel')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('register.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10 h-11"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">{t('register.passwordLabel')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={t('register.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-10 h-11"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">{t('register.confirmPasswordLabel')}</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder={t('register.confirmPasswordPlaceholder')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="pl-10 h-11"
                  />
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3 bg-muted/30">
                <Checkbox
                  id="agree-terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(!!checked)}
                  className="mt-0.5"
                />
                <label
                  htmlFor="agree-terms"
                  className="text-sm text-muted-foreground leading-relaxed cursor-pointer"
                  dangerouslySetInnerHTML={{
                    __html: t('register.agreeTerms')
                      .replace('{terms}', `<a href="/terms" class="text-primary hover:underline font-medium">${t('register.termsLink')}</a>`)
                      .replace('{privacy}', `<a href="/privacy" class="text-primary hover:underline font-medium">${t('register.privacyLink')}</a>`)
                  }}
                />
              </div>
              <Button type="submit" className="w-full h-11 text-base" disabled={sendingCode}>
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
                <Label htmlFor="code" className="text-sm font-medium">{t('register.codeLabel')}</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder={t('register.codePlaceholder')}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  maxLength={6}
                  required
                  className="h-11 text-center text-xl tracking-widest"
                />
              </div>
              <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
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
                  className="text-primary hover:underline font-medium"
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
                className="w-full h-11"
                onClick={() => setStep('info')}
                disabled={loading}
              >
                {t('register.backButton')}
              </Button>
            </form>
          )}

          <Separator />
          <GoogleLoginButton onGoogleClick={async () => {
            if (isDesktopFlow) {
              rememberDesktopAuth(savedCallbackUrl);
            }
            return signInWithGoogle();
          }} />

          <div className="text-center text-sm pt-1">
            {t('register.alreadyHaveAccount')}{' '}
            <Link href={isDesktopFlow ? `/login?from=desktop${savedCallbackUrl ? `&callback=${encodeURIComponent(savedCallbackUrl)}` : ''}` : '/login'} className="text-primary font-medium hover:underline">
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
