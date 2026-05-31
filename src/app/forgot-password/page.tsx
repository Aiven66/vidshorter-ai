'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle, KeyRound, Lock, Mail, Video } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/lib/locale-context';

type Step = 'email' | 'reset' | 'done';

function ForgotPasswordContent() {
  const { t } = useLocale();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sendCode = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('forgot.errorSendCode'));
        return;
      }
      setStep('reset');
    } catch {
      setError(t('forgot.errorNetwork'));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (code.length !== 6) {
      setError(t('forgot.errorCodeLength'));
      return;
    }
    if (password.length < 6) {
      setError(t('forgot.errorPasswordLength'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('forgot.errorPasswordMismatch'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('forgot.errorReset'));
        return;
      }
      setStep('done');
    } catch {
      setError(t('forgot.errorNetwork'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 py-12 px-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2 font-bold text-2xl mb-2">
            <Video className="h-7 w-7 text-primary" />
            <span>Clipop AI</span>
          </div>
          <CardTitle className="text-2xl">{t('forgot.title')}</CardTitle>
          <CardDescription>{t('forgot.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {step === 'email' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                sendCode();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="email">{t('forgot.emailLabel')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t('forgot.emailPlaceholder')}
                    required
                    className="pl-10 h-11"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? t('common.loading') : t('forgot.sendCodeButton')}
              </Button>
            </form>
          )}

          {step === 'reset' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                resetPassword();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="code">{t('forgot.codeLabel')}</Label>
                <Input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  placeholder={t('forgot.codePlaceholder')}
                  maxLength={6}
                  required
                  className="h-11 text-center text-xl tracking-widest"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">{t('forgot.newPasswordLabel')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t('forgot.newPasswordPlaceholder')}
                    required
                    className="pl-10 h-11"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">{t('forgot.confirmPasswordLabel')}</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder={t('forgot.confirmPasswordPlaceholder')}
                    required
                    className="pl-10 h-11"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? t('common.loading') : t('forgot.resetButton')}
              </Button>
              <Button type="button" variant="outline" className="w-full h-11" onClick={() => setStep('email')} disabled={loading}>
                {t('register.backButton')}
              </Button>
            </form>
          )}

          {step === 'done' && (
            <div className="space-y-5 text-center">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <CheckCircle className="h-10 w-10 text-green-500" />
              </div>
              <p className="text-muted-foreground">{t('forgot.successMessage')}</p>
              <Button asChild className="w-full h-11">
                <Link href="/login">{t('forgot.backToLogin')}</Link>
              </Button>
            </div>
          )}

          {step !== 'done' && (
            <div className="text-center text-sm">
              <Link href="/login" className="text-primary font-medium hover:underline">
                {t('forgot.backToLogin')}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
