'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Video, Mail, KeyRound, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

type Step = 'info' | 'verify' | 'done';

export default function RegisterPage() {
  const { t } = useLocale();
  const { signUp, signInWithGoogle } = useAuth();
  const router = useRouter();

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

  // ── Step 1: validate basic info and send code ──
  const handleSendCode = async () => {
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!email.trim()) { setError('Please enter your email'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setSendingCode(true);
    setError('');

    try {
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
      // 60s countdown before resend
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

  // ── Step 2: verify code and complete registration ──
  const handleVerifyAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.length !== 6) {
      setError('Please enter the 6-digit verification code');
      return;
    }

    setLoading(true);
    setError('');

    // Verify the code first
    try {
      const verifyRes = await fetch('/api/send-verification-code', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        setError(verifyData.error || 'Invalid verification code');
        setLoading(false);
        return;
      }
    } catch {
      setError('Verification failed. Please request a new code.');
      setLoading(false);
      return;
    }

    // Code verified, complete registration
    const result = await signUp(email, password, name);
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setStep('done');
      setTimeout(() => router.push('/dashboard'), 1500);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="flex items-center justify-center gap-2 font-bold text-xl mb-4">
            <Video className="h-6 w-6 text-primary" />
            <span>VidShorter AI</span>
          </Link>
          <CardTitle>{t('auth.register.title')}</CardTitle>
          <CardDescription>{t('auth.register.subtitle')}</CardDescription>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className={`flex items-center gap-1.5 text-xs ${step === 'info' ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
              <div className={`h-5 w-5 rounded-full flex items-center justify-center text-xs ${step === 'info' ? 'bg-primary text-primary-foreground' : 'bg-green-500 text-white'}`}>
                {step === 'info' ? '1' : <CheckCircle className="h-3 w-3" />}
              </div>
              Fill Info
            </div>
            <div className="h-px w-6 bg-border" />
            <div className={`flex items-center gap-1.5 text-xs ${step === 'verify' ? 'text-primary font-semibold' : (step === 'done' ? 'text-green-600' : 'text-muted-foreground')}`}>
              <div className={`h-5 w-5 rounded-full flex items-center justify-center text-xs ${step === 'verify' ? 'bg-primary text-primary-foreground' : (step === 'done' ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground')}`}>
                {step === 'done' ? <CheckCircle className="h-3 w-3" /> : '2'}
              </div>
              Verify Email
            </div>
            <div className="h-px w-6 bg-border" />
            <div className={`flex items-center gap-1.5 text-xs ${step === 'done' ? 'text-green-600 font-semibold' : 'text-muted-foreground'}`}>
              <div className={`h-5 w-5 rounded-full flex items-center justify-center text-xs ${step === 'done' ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                {step === 'done' ? <CheckCircle className="h-3 w-3" /> : '3'}
              </div>
              Done
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {step === 'done' ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-500" />
              </div>
              <h3 className="font-semibold text-lg">Account Created!</h3>
              <p className="text-sm text-muted-foreground text-center">Redirecting to dashboard...</p>
            </div>
          ) : step === 'verify' ? (
            // Step 2: Verify email code
            <form onSubmit={handleVerifyAndRegister} className="space-y-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg mb-2">
                <Mail className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  We sent a 6-digit code to <strong className="text-foreground">{email}</strong>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">
                  <KeyRound className="h-4 w-4 inline mr-1" />Verification Code
                </Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                  required
                  disabled={loading}
                  className="text-center text-2xl tracking-widest font-mono"
                  maxLength={6}
                  autoFocus
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive p-2 bg-destructive/10 rounded">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</> : 'Verify & Create Account'}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => { setStep('info'); setCode(''); setError(''); }}
                >
                  ← Change email
                </button>
                <button
                  type="button"
                  className={`text-primary hover:underline ${countdown > 0 || sendingCode ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={countdown === 0 ? handleSendCode : undefined}
                  disabled={countdown > 0 || sendingCode}
                >
                  {countdown > 0 ? `Resend (${countdown}s)` : sendingCode ? 'Sending...' : 'Resend code'}
                </button>
              </div>
            </form>
          ) : (
            // Step 1: Fill in basic info
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('auth.register.name')}</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={sendingCode}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.register.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={sendingCode}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.register.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={sendingCode}
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('auth.register.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={sendingCode}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive p-2 bg-destructive/10 rounded">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
                </div>
              )}

              <Button className="w-full" disabled={sendingCode} onClick={handleSendCode}>
                {sendingCode ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending code...</>
                ) : (
                  <><Mail className="h-4 w-4 mr-2" />Send Verification Code</>
                )}
              </Button>

              <div className="relative my-4">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  OR
                </span>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={sendingCode}
              >
                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {t('auth.register.google')}
              </Button>

              <p className="mt-4 text-center text-sm text-muted-foreground">
                {t('auth.register.hasAccount')}{' '}
                <Link href="/login" className="text-primary hover:underline">
                  {t('auth.register.login')}
                </Link>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
