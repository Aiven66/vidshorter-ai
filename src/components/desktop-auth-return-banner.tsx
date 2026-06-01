'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CheckCircle, Monitor, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import {
  DESKTOP_AUTH_SESSION_KEY,
  DESKTOP_AUTH_STORAGE_KEY,
  DESKTOP_CALLBACK_SESSION_KEY,
  getStoredDesktopCallbackUrl,
  isDesktopAuthRequest,
  openDesktopLocalCallback,
  syncDesktopAuthAndOpen,
  type DesktopAuthPayload,
} from '@/lib/desktop-auth';

const DESKTOP_RETURN_DISMISSED_KEY = 'clipop_desktop_return_banner_dismissed';

export function DesktopAuthReturnBanner() {
  const pathname = usePathname();
  const { user, accessToken, loading } = useAuth();
  const [pendingDesktopReturn, setPendingDesktopReturn] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [storedAccessToken, setStoredAccessToken] = useState('');
  const [storedRefreshToken, setStoredRefreshToken] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const timer = window.setTimeout(() => {
      if (cancelled) return;

      const searchParams = new URLSearchParams(window.location.search);
      const isExplicitDesktopRequest =
        searchParams.get('from') === 'desktop' ||
        searchParams.get('desktop') === '1';

      if (isExplicitDesktopRequest) {
        localStorage.removeItem(DESKTOP_RETURN_DISMISSED_KEY);
      }

      const isDismissed = localStorage.getItem(DESKTOP_RETURN_DISMISSED_KEY) === '1';
      setPendingDesktopReturn(!isDismissed && isDesktopAuthRequest(searchParams));
      setCallbackUrl(getStoredDesktopCallbackUrl());
      setStoredAccessToken(localStorage.getItem('clipop_access_token') || '');
      setStoredRefreshToken(localStorage.getItem('clipop_refresh_token') || '');
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, user, accessToken]);

  const desktopToken = accessToken || storedAccessToken;

  if (
    loading ||
    !pendingDesktopReturn ||
    !user ||
    !desktopToken ||
    pathname.startsWith('/desktop/')
  ) {
    return null;
  }

  const handleReturn = async () => {
    const payload: DesktopAuthPayload = {
      token: desktopToken,
      refreshToken: storedRefreshToken,
      email: user.email,
      userId: user.id,
      name: user.name || user.email.split('@')[0],
    };
    await syncDesktopAuthAndOpen(callbackUrl, payload);
  };

  const handleLocalSync = () => {
    const payload: DesktopAuthPayload = {
      token: desktopToken,
      refreshToken: storedRefreshToken,
      email: user.email,
      userId: user.id,
      name: user.name || user.email.split('@')[0],
    };
    openDesktopLocalCallback(callbackUrl, payload);
  };

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DESKTOP_RETURN_DISMISSED_KEY, '1');
      localStorage.removeItem(DESKTOP_AUTH_STORAGE_KEY);
      sessionStorage.removeItem(DESKTOP_AUTH_SESSION_KEY);
      sessionStorage.removeItem(DESKTOP_CALLBACK_SESSION_KEY);
    }
    setPendingDesktopReturn(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto relative w-full max-w-xl rounded-lg border bg-background shadow-lg p-4 pr-12">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close desktop return banner"
          onClick={handleDismiss}
          className="absolute right-2 top-2 h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
            <div>
              <p className="font-medium">Login successful</p>
              <p className="text-sm text-muted-foreground">
                Return to Clipop Agent to sync your desktop login.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <Button onClick={handleReturn} className="shrink-0">
              <Monitor className="h-4 w-4 mr-2" />
              Return to Clipop Agent
            </Button>
            {callbackUrl && (
              <Button variant="outline" size="sm" onClick={handleLocalSync} className="shrink-0">
                Sync via local callback
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
