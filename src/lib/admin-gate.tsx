'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const VERIFIED_ADMINS = new Set([
  'admin@126.com',
  'admin@clipop.ai',
]);

function isVerifiedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return VERIFIED_ADMINS.has(email.trim().toLowerCase());
}

async function verifyAdminAccess(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      return !!data?.isAdmin;
    }
    return false;
  } catch {
    return false;
  }
}

interface AdminGateProps {
  children: React.ReactNode;
}

export function AdminGate({ children }: AdminGateProps) {
  const { user, accessToken } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<'checking' | 'authenticated' | 'unauthorized'>('checking');
  const verifiedRef = useRef(false);

  const isOnLoginPage = pathname === '/ax/login';

  const check = useCallback(async () => {
    if (isOnLoginPage) {
      setState('unauthorized');
      return;
    }

    if (!accessToken || !user) {
      setState('unauthorized');
      router.replace('/ax/login');
      return;
    }

    const hasAdminClaim = user.role === 'admin';
    const hasAdminEmail = isVerifiedAdminEmail(user.email);

    if (!hasAdminClaim && !hasAdminEmail) {
      setState('unauthorized');
      router.replace('/ax/login');
      return;
    }

    if (verifiedRef.current) {
      setState('authenticated');
      return;
    }

    const verified = await verifyAdminAccess(accessToken);
    if (verified) {
      verifiedRef.current = true;
      setState('authenticated');
    } else {
      setState('unauthorized');
      router.replace('/ax/login');
    }
  }, [accessToken, user, isOnLoginPage, router]);

  useEffect(() => {
    check();
  }, [check]);

  if (isOnLoginPage) {
    return <>{children}</>;
  }

  if (state === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4"></div>
          <p className="text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (state === 'unauthorized') {
    return null;
  }

  return <>{children}</>;
}

export function isAdminUser(u: { email?: string | null; role?: string | null } | null): boolean {
  if (!u) return false;
  return u.role === 'admin' || isVerifiedAdminEmail(u.email);
}
