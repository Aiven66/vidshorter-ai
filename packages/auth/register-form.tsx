'use client';

/**
 * @clipop/auth - RegisterForm
 *
 * Three-step registration flow:
 *   1. info    — collect name / email / password / confirm + agree-to-terms
 *   2. verify  — enter 6-digit email verification code (60s resend countdown)
 *   3. done    — desktop: offer "Return to Desktop" + local callback fallback
 *                web: redirect to `redirectTo`
 *
 * Uses native <input> + Tailwind only (no shadcn/ui).
 *
 * Required host API routes:
 *   - POST /api/check-email          body: { email }  → { exists: boolean }
 *   - POST /api/send-verification-code body: { email } → sends 6-digit code
 *   - PUT  /api/send-verification-code body: { email, code } → verifies code
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { useAppConfig } from '../core/config';
import { useAuth } from './auth-provider';
import {
  buildDesktopDeepLink,
  getDesktopCallbackFromBridge,
  isDesktopRuntime,
  normalizeDesktopCallbackUrl,
  openDesktopLocalCallback,
  syncDesktopAuthAndOpen,
  type DesktopAuthPayload,
} from './desktop-bridge';
import { GoogleLoginButton } from './google-login-button';

type Step = 'info' | 'verify' | 'done';

export interface RegisterFormProps {
  /** Where to send the user after a successful web registration. Defaults to '/'. */
  redirectTo?: string;
  /** Fired after a successful registration (web flow only). */
  onRegister?: (user: { id: string; email: string; name: string }) => void;
  /** Whether to render the agree-to-terms checkbox. */
  showTerms?: boolean;
  /** Path the sign-in link points to. Defaults to '/login'. */
  loginPath?: string;
  /** Path to the terms document. */
  termsPath?: string;
  /** Path to the privacy document. */
  privacyPath?: string;
}

export function RegisterForm({
  redirectTo = '/',
  onRegister,
  showTerms = true,
  loginPath = '/login',
  termsPath = '/terms',
  privacyPath = '/privacy',
}: RegisterFormProps) {
  const { signUp, user, accessToken, refreshToken } = useAuth();
  const config = useAppConfig();

  const [step, setStep] = useState<Step>('info');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [desktopToken, setDesktopToken] = useState<string | null>(null);
  const [desktopRefreshToken, setDesktopRefreshToken] = useState<string | null>(null);
  const [desktopEmail, setDesktopEmail] = useState('');
  const [desktopCallbackUrl, setDesktopCallbackUrl] = useState<string | null>(null);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const desktop = isDesktopRuntime();

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Resolve the desktop callback URL once when entering the done step.
  useEffect(() => {
    if (step !== 'done' || !desktop) return;
    let cancelled = false;
    getDesktopCallbackFromBridge()
      .then((url) => {
        if (!cancelled) setDesktopCallbackUrl(url);
      })
      .catch(() => {
        /* non-fatal — handlers fall back to deep link */
      });
    return () => {
      cancelled = true;
    };
  }, [step, desktop]);

  function startCountdown(seconds: number) {
    setCountdown(seconds);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function validateInfo(): string | null {
    if (!name.trim()) return 'Please enter your name.';
    if (!email.trim()) return 'Please enter your email.';
    if (password.length < 6) return 'Password must be at least 6 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    if (showTerms && !agreedToTerms) return 'You must agree to the terms to continue.';
    return null;
  }

  async function handleSendCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const validationError = validateInfo();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSendingCode(true);
    try {
      const checkRes = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const checkData = (await checkRes.json()) as { exists?: boolean };
      if (checkData.exists) {
        setError('This email is already registered. Please sign in.');
        return;
      }

      const res = await fetch('/api/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Failed to send verification code.');
        return;
      }
      setStep('verify');
      startCountdown(60);
      setInfo('A 6-digit code was sent to your email.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSendingCode(false);
    }
  }

  async function handleVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (code.length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }

    setSubmitting(true);
    try {
      const verifyRes = await fetch('/api/send-verification-code', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const verifyData = (await verifyRes.json().catch(() => ({}))) as { error?: string };
      if (!verifyRes.ok) {
        setError(verifyData.error || 'Invalid verification code.');
        return;
      }

      const result = await signUp(email, password, name);
      if (result.error) {
        setError(result.error);
        return;
      }

      if (desktop) {
        setDesktopToken(result.token || accessToken);
        setDesktopRefreshToken(result.refreshToken || refreshToken);
        setDesktopEmail(email);
        setStep('done');
      } else if (onRegister && user) {
        onRegister({ id: user.id, email: user.email, name: user.name });
      } else {
        window.location.href = redirectTo;
      }
    } finally {
      setSubmitting(false);
    }
  }

  function buildDesktopPayload(): DesktopAuthPayload {
    return {
      token: desktopToken || accessToken,
      refreshToken: desktopRefreshToken || refreshToken,
      email: desktopEmail || user?.email || email,
      userId: user?.id || '',
      name: user?.name || name,
    };
  }

  async function handleReturnToDesktop() {
    const payload = buildDesktopPayload();
    const safe = normalizeDesktopCallbackUrl(desktopCallbackUrl);
    const scheme = config.desktop.scheme || 'app';
    if (!safe) {
      // Fall back to deep link only.
      const deepLink = buildDesktopDeepLink(scheme, payload);
      try {
        window.location.href = deepLink;
      } catch {
        /* ignore */
      }
      return;
    }
    await syncDesktopAuthAndOpen(payload, scheme, safe);
  }

  function handleLocalCallbackFallback() {
    const payload = buildDesktopPayload();
    const safe = normalizeDesktopCallbackUrl(desktopCallbackUrl);
    if (!safe) return;
    openDesktopLocalCallback(safe, {
      token: payload.token || undefined,
      refreshToken: payload.refreshToken || undefined,
      email: payload.email || undefined,
      userId: payload.userId || undefined,
      name: payload.name || undefined,
    });
  }

  /* ------------------------- Step: done ------------------------- */
  if (step === 'done') {
    return (
      <div className="mx-auto w-full max-w-md space-y-6 rounded-lg border border-border bg-background p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <svg
              className="h-10 w-10 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-foreground">Account created</h1>
          <p className="text-sm text-muted-foreground">
            Welcome, <strong>{desktopEmail || user?.email || email}</strong>.
          </p>
        </div>

        {desktop ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleReturnToDesktop}
              className="h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Return to Desktop
            </button>
            {desktopCallbackUrl && (
              <button
                type="button"
                onClick={handleLocalCallbackFallback}
                className="h-11 w-full rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
              >
                Sync via local callback
              </button>
            )}
            <p className="text-center text-xs text-muted-foreground">
              If the app doesn&apos;t open automatically, click the button above.
            </p>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Redirecting…
          </p>
        )}
      </div>
    );
  }

  /* ------------------------- Step: verify ---------------------- */
  if (step === 'verify') {
    return (
      <div className="mx-auto w-full max-w-md space-y-6 rounded-lg border border-border bg-background p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Verify your email</h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code sent to <strong>{email}</strong>.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground"
          >
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
            {info}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-2">
            <input
              id="register-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="h-12 w-full rounded-md border border-border bg-background px-3 text-center text-xl tracking-widest text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="000000"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Verifying…' : 'Verify and continue'}
          </button>
          <div className="text-center text-sm text-muted-foreground">
            Didn&apos;t receive a code?{' '}
            <button
              type="button"
              className="font-medium text-primary hover:underline disabled:opacity-50"
              disabled={countdown > 0 || sendingCode}
              onClick={() => {
                setStep('info');
                setCode('');
                setCountdown(0);
                if (countdownRef.current) clearInterval(countdownRef.current);
              }}
            >
              {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setStep('info')}
            disabled={submitting}
            className="h-11 w-full rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Back
          </button>
        </form>
      </div>
    );
  }

  /* ------------------------- Step: info ------------------------ */
  return (
    <div className="mx-auto w-full max-w-md space-y-6 rounded-lg border border-border bg-background p-8 shadow-sm">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-foreground">
          Create your {config.appName} account
        </h1>
        <p className="text-sm text-muted-foreground">
          Start by entering your details below.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSendCode} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="register-name" className="text-sm font-medium text-foreground">
            Name
          </label>
          <input
            id="register-name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Your name"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="register-email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="register-password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="At least 6 characters"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="register-confirm" className="text-sm font-medium text-foreground">
            Confirm password
          </label>
          <input
            id="register-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Re-enter password"
          />
        </div>

        {showTerms && (
          <label className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span>
              I agree to the{' '}
              <a href={termsPath} className="font-medium text-primary hover:underline">
                Terms
              </a>{' '}
              and{' '}
              <a href={privacyPath} className="font-medium text-primary hover:underline">
                Privacy Policy
              </a>
              .
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={sendingCode}
          className="h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendingCode ? 'Sending code…' : 'Send verification code'}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-xs text-muted-foreground">or</span>
        </div>
      </div>

      <GoogleLoginButton />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <a
          href={desktop ? `${loginPath}?from=desktop` : loginPath}
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </a>
      </p>
    </div>
  );
}

export default RegisterForm;
