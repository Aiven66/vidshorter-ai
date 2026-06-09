'use client';

/**
 * 注册表单组件
 * 
 * 提供邮箱注册功能，包含验证码验证
 * 
 * @example
 * ```tsx
 * import { RegisterForm } from './base/auth/RegisterForm';
 * 
 * function RegisterPage() {
 *   return <RegisterForm />;
 * }
 * ```
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Mail, Lock, User, Loader2, AlertCircle, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { GoogleLoginButton } from './GoogleLoginButton';
import { useAuth } from './AuthProvider';

type Step = 'info' | 'verify' | 'done';

interface RegisterFormProps {
  /** 注册成功后的跳转地址，默认 '/' */
  redirectTo?: string;
  /** 是否显示登录链接，默认 true */
  showLoginLink?: boolean;
  /** 是否显示服务条款和隐私政策，默认 true */
  showTerms?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 额外的加载状态 */
  loading?: boolean;
  /** 注册成功回调 */
  onSuccess?: () => void;
}

export function RegisterForm({
  redirectTo = '/',
  showLoginLink = true,
  showTerms = true,
  className = '',
  loading: externalLoading,
  onSuccess,
}: RegisterFormProps) {
  const { signUp, signInWithGoogle, user } = useAuth();

  const [step, setStep] = useState<Step>('info');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const loading = externalLoading || localLoading || sendingCode;

  useEffect(() => {
    if (step !== 'done') return;
    let interval: NodeJS.Timeout;
    interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  const validateForm = () => {
    if (!name.trim()) { setError('Name is required'); return false; }
    if (!email.trim()) { setError('Email is required'); return false; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return false; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return false; }
    if (showTerms && !agreedToTerms) { setError('Please agree to the terms and privacy policy'); return false; }
    return true;
  };

  const handleSendCode = async () => {
    if (!validateForm()) return;

    setSendingCode(true);
    setError('');

    try {
      // Check if email exists
      const checkRes = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const checkData = await checkRes.json();

      if (checkData.exists) {
        setError('This email is already registered. Please sign in.');
        return;
      }

      // Send verification code
      const res = await fetch('/api/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send verification code');
        return;
      }

      setStep('verify');
      setCountdown(60);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) { setError('Please enter the 6-digit code'); return; }
    setLocalLoading(true);
    setError('');

    try {
      // Verify the code
      const verifyRes = await fetch('/api/send-verification-code', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        setError(verifyData.error || 'Invalid verification code');
        return;
      }

      // Complete registration
      const result = await signUp(email, password, name);
      if (result.error) {
        setError(result.error);
        return;
      }

      if (onSuccess) {
        onSuccess();
      } else {
        window.location.href = redirectTo;
      }
    } finally {
      setLocalLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalLoading(true);
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setLocalLoading(false);
    }
    return result;
  };

  const handleResendCode = () => {
    setStep('info');
    setCountdown(0);
  };

  if (user) {
    return (
      <Card className={`w-full max-w-md shadow-lg border-0 ${className}`}>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Already Registered</CardTitle>
          <CardDescription>
            You are already logged in as {user.email}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" onClick={() => window.location.href = redirectTo}>
            Go to Home
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`w-full max-w-md shadow-lg border-0 ${className}`}>
      <CardHeader className="text-center space-y-1">
        <CardTitle className="text-2xl">Create Account</CardTitle>
        <CardDescription>Sign up to get started</CardDescription>
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
              <Label htmlFor="name" className="text-sm font-medium">Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="pl-10 h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10 h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="pl-10 h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="pl-10 h-11"
                />
              </div>
            </div>
            {showTerms && (
              <div className="flex items-start gap-3 rounded-lg border p-3 bg-muted/30">
                <Checkbox
                  id="agree-terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(!!checked)}
                  className="mt-0.5"
                />
                <label htmlFor="agree-terms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                  I agree to the{' '}
                  <Link href="/terms" className="text-primary hover:underline font-medium">
                    Terms of Service
                  </Link>
                  {' '}and{' '}
                  <Link href="/privacy" className="text-primary hover:underline font-medium">
                    Privacy Policy
                  </Link>
                </label>
              </div>
            )}
            <Button type="submit" className="w-full h-11 text-base" disabled={sendingCode}>
              {sendingCode ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending code...
                </>
              ) : (
                'Send Verification Code'
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
              <Label htmlFor="code" className="text-sm font-medium">Verification Code</Label>
              <Input
                id="code"
                type="text"
                placeholder="Enter 6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                maxLength={6}
                required
                className="h-11 text-center text-xl tracking-widest"
              />
              <p className="text-xs text-muted-foreground text-center">
                We sent a verification code to {email}
              </p>
            </div>
            <Button type="submit" className="w-full h-11 text-base" disabled={localLoading}>
              {localLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              Didn&apos;t receive the code?{' '}
              <button
                type="button"
                className="text-primary hover:underline font-medium"
                disabled={countdown > 0 || sendingCode}
                onClick={handleResendCode}
              >
                {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
              </button>
            </div>
            {showTerms && (
              <p className="text-center text-xs text-muted-foreground leading-relaxed">
                By creating an account, you agree to our{' '}
                <Link href="/terms" className="text-primary hover:underline font-medium">
                  Terms of Service
                </Link>
                {' '}and{' '}
                <Link href="/privacy" className="text-primary hover:underline font-medium">
                  Privacy Policy
                </Link>
              </p>
            )}
          </form>
        )}

        <Separator />
        <GoogleLoginButton onGoogleClick={handleGoogleSignIn} />

        {showLoginLink && (
          <div className="text-center text-sm pt-1">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
