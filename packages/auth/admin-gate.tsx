'use client';

/**
 * @clipop/auth - AdminGate
 *
 * Guards admin-only UI. Three-layer verification:
 *   1. `user.role === 'admin'`
 *   2. `user.email` is in `config.admin.adminEmails`
 *   3. POST `${origin}/api/admin/verify` returns `{ isAdmin: true }`
 *
 * Any layer passing renders the children. On failure, the user is
 * redirected to `loginPath || config.admin.loginPath` and `fallback`
 * (or null) is rendered.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { useAppConfig, isAdminEmail, type AppConfig } from '../core/config';
import type { AppUser } from '../core/types';
import { useAuth } from './auth-provider';

export interface AdminGateProps {
  children: ReactNode;
  /** Path to redirect to when admin check fails. Defaults to config.admin.loginPath. */
  loginPath?: string;
  /** Element shown while redirecting / when unauthorized. */
  fallback?: ReactNode;
}

/**
 * Synchronous admin check using layers 1 + 2 (JWT claim + email whitelist).
 * Use this for client-side gating that doesn't need a server round-trip.
 */
export function isAdminUser(
  user: Pick<AppUser, 'role' | 'email'> | null | undefined,
  config: AppConfig,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return isAdminEmail(user.email, config);
}

/** Verify admin status server-side via the host app's `/api/admin/verify`. */
async function verifyAdminAccess(
  token: string,
  verifyPath: string,
): Promise<boolean> {
  try {
    const res = await fetch(verifyPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { isAdmin?: boolean };
    return !!data?.isAdmin;
  } catch {
    return false;
  }
}

/** Hook: synchronous admin status (layers 1 + 2). Reactive to auth/config changes. */
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  const config = useAppConfig();
  return isAdminUser(user, config);
}

type GateState = 'checking' | 'authenticated' | 'unauthorized';

export function AdminGate({ children, loginPath, fallback = null }: AdminGateProps) {
  const { user, accessToken } = useAuth();
  const config = useAppConfig();
  const router = useRouter();
  const [state, setState] = useState<GateState>('checking');
  const verifiedRef = useRef(false);

  const targetLoginPath = loginPath || config.admin.loginPath;
  const verifyUrl = `${typeof window !== 'undefined' ? window.location.origin : config.appUrl}/api/admin/verify`;

  const check = useCallback(async () => {
    if (!accessToken || !user) {
      setState('unauthorized');
      router.replace(targetLoginPath);
      return;
    }

    // Layer 1: JWT claim.
    if (user.role === 'admin') {
      setState('authenticated');
      return;
    }

    // Layer 2: email whitelist.
    if (isAdminEmail(user.email, config)) {
      setState('authenticated');
      return;
    }

    // Layer 3: server-side verification.
    if (verifiedRef.current) {
      setState('authenticated');
      return;
    }

    const verified = await verifyAdminAccess(accessToken, verifyUrl);
    if (verified) {
      verifiedRef.current = true;
      setState('authenticated');
    } else {
      setState('unauthorized');
      router.replace(targetLoginPath);
    }
  }, [accessToken, user, config, router, targetLoginPath, verifyUrl]);

  useEffect(() => {
    check();
  }, [check]);

  if (state === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Verifying access…</p>
        </div>
      </div>
    );
  }

  if (state === 'unauthorized') {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export default AdminGate;
