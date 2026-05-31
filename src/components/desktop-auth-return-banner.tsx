'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CheckCircle, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import {
  getStoredDesktopCallbackUrl,
  isDesktopAuthRequest,
  openDesktopLocalCallback,
  syncDesktopAuthAndOpen,
  type DesktopAuthPayload,
} from '@/lib/desktop-auth';

export function DesktopAuthReturnBanner() {
  const pathname = usePathname();
  const { user, accessToken, loading } = useAuth();
  const [pendingDesktopReturn, setPendingDesktopReturn] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [storedAccessToken, setStoredAccessToken] = useState('');
  const [storedRefreshToken, setStoredRefreshToken] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPendingDesktopReturn(isDesktopAuthRequest(new URLSearchParams(window.location.search)));
    setCallbackUrl(getStoredDesktopCallbackUrl());
    setStoredAccessToken(localStorage.getItem('clipop_access_token') || '');
    setStoredRefreshToken(localStorage.getItem('clipop_refresh_token') || '');
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

  return (
    <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-xl rounded-lg border bg-background shadow-lg p-4">
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
