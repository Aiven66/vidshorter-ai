'use client';

/**
 * @clipop/auth - LoginForm
 *
 * Self-contained email/password login form with an optional Google button.
 * Uses only native <input> + Tailwind classes (no shadcn/ui dependency),
 * so it works in any Tailwind-enabled Next.js app.
 *
 * Desktop flow: when `isDesktopRuntime()` is true, a successful sign-in
 * also triggers `syncDesktopAuthAndOpen` to deliver the token to the
 * embedded shell via deep link + local callback.
 */

import { useState, type FormEvent } from 'react';

import { useAppConfig } from '../core/config';
import { useAuth } from './auth-provider';
import {
  buildDesktopDeepLink,
  getDesktopCallbackFromBridge,
  isDesktopRuntime,
  normalizeDesktopCallbackUrl,
  syncDesktopAuthAndOpen,
  type DesktopAuthPayload,
} from './desktop-bridge';
import { GoogleLoginButton } from './google-login-button';

export interface LoginFormProps {
  /** Where to send the user after a successful web sign-in. Defaults to '/'. */
  redirectTo?: string;
  /** Fired after a successful sign-in (web flow only). */
  onLogin?: (user: { id: string; email: string; name: string }) => void;
  /** Whether to render the "Don't have an account? Sign up" link. */
  showRegisterLink?: boolean;
  /** Path the register link points to. Defaults to '/register'. */
  registerPath?: string;
}

export function LoginForm({
  redirectTo = '/',
  onLogin,
  showRegisterLink = true,
  registerPath = '/register',
}: LoginFormProps) {
  const { signIn, user, accessToken, refreshToken } = useAuth();
  const config = useAppConfig();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desktopStatus, setDesktopStatus] = useState<
    'idle' | 'syncing' | 'synced' | 'failed'
  >('idle');

  const desktop = isDesktopRuntime();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn(email, password);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if (desktop) {
      await deliverToDesktop(result.token, result.refreshToken);
      setSubmitting(false);
      return;
    }

    // Web flow — let the host decide via onLogin, otherwise hard-redirect.
    if (onLogin && user) {
      onLogin({ id: user.id, email: user.email, name: user.name });
    } else {
      window.location.href = redirectTo;
    }
    setSubmitting(false);
  }

  async function deliverToDesktop(
    overrideToken?: string | null,
    overrideRefresh?: string | null,
  ) {
    const token = overrideToken || accessToken;
    if (!token) {
      setError('Authentication succeeded but no token was returned.');
      setDesktopStatus('failed');
      return;
    }
    setDesktopStatus('syncing');
    const callbackUrl = await getDesktopCallbackFromBridge();
    const safeCallback = normalizeDesktopCallbackUrl(callbackUrl);
    if (!safeCallback) {
      setError(
        'Desktop callback URL is not available. Open the app and try again.',
      );
      setDesktopStatus('failed');
      return;
    }
    const payload: DesktopAuthPayload = {
      token,
      refreshToken: overrideRefresh || refreshToken,
      email: user?.email || email,
      userId: user?.id || '',
      name: user?.name || '',
    };
    const scheme = config.desktop.scheme || 'app';
    try {
      await syncDesktopAuthAndOpen(payload, scheme, safeCallback);
      setDesktopStatus('synced');
    } catch {
      // Fall back to deep link directly.
      const deepLink = buildDesktopDeepLink(scheme, payload);
      if (typeof window !== 'undefined') {
        try {
          window.location.href = deepLink;
        } catch {
          /* ignore */
        }
      }
      setDesktopStatus('synced');
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6 rounded-lg border border-border bg-background p-8 shadow-sm">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-foreground">
          Sign in to {config.appName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter your credentials to continue.
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="login-email"
            className="text-sm font-medium text-foreground"
          >
            Email
          </label>
          <input
            id="login-email"
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
          <label
            htmlFor="login-password"
            className="text-sm font-medium text-foreground"
          >
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-xs text-muted-foreground">
            or
          </span>
        </div>
      </div>

      <GoogleLoginButton />

      {desktop && desktopStatus === 'syncing' && (
        <p className="text-center text-sm text-muted-foreground">
          Returning to desktop…
        </p>
      )}
      {desktop && desktopStatus === 'synced' && (
        <p className="text-center text-sm text-muted-foreground">
          Token delivered. You can close this tab.
        </p>
      )}

      {showRegisterLink && (
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <a
            href={desktop ? `${registerPath}?from=desktop` : registerPath}
            className="font-medium text-primary hover:underline"
          >
            Sign up
          </a>
        </p>
      )}
    </div>
  );
}

export default LoginForm;
