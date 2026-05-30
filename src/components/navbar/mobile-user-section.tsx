'use client';

import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import { useCredits } from '@/lib/credits-context';
import { Button } from '@/components/ui/button';
import { LogOut, CreditCard, LayoutDashboard, Shield } from 'lucide-react';
import Link from 'next/link';
import { DESKTOP_WEB_APP_URL } from '@/lib/desktop-auth';

export function MobileUserSection({ mounted, isDesktop, onCloseMobile }: { mounted: boolean; isDesktop: boolean; onCloseMobile: () => void }) {
  const { user, signOut } = useAuth();
  const { t } = useLocale();
  const { balance } = useCredits();

  const showUser = mounted && !!user;
  const isAdmin = user?.role === 'admin';

  if (!showUser) {
    return (
      <div className="flex flex-col gap-2 mt-4">
        {isDesktop ? (
          <>
            <Button variant="outline" onClick={async () => {
              onCloseMobile();
              if (window.clipopDesktop?.openWebLogin) {
                await window.clipopDesktop.openWebLogin();
              } else if ((window as any).agent?.openWebLogin) {
                await (window as any).agent.openWebLogin();
              } else {
                window.open(`${DESKTOP_WEB_APP_URL}/login?from=desktop`, '_blank');
              }
            }}>
              {t('nav.login')}
            </Button>
            <Button onClick={async () => {
              onCloseMobile();
              if (window.clipopDesktop?.openWebRegister) {
                await window.clipopDesktop.openWebRegister();
              } else if ((window as any).agent?.openWebRegister) {
                await (window as any).agent.openWebRegister();
              } else {
                window.open(`${DESKTOP_WEB_APP_URL}/register?from=desktop`, '_blank');
              }
            }}>
              {t('nav.register')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" asChild>
              <Link href="/login" onClick={() => onCloseMobile()}>
                {t('nav.login')}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/register" onClick={() => onCloseMobile()}>
                {t('nav.register')}
              </Link>
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 py-2">
        <CreditCard className="h-5 w-5 text-primary" />
        <span className="font-medium">{balance} {t('nav.credits')}</span>
      </div>

      <Link
        href="/dashboard"
        onClick={() => onCloseMobile()}
        className="flex items-center gap-2 py-2 text-lg font-medium"
      >
        <LayoutDashboard className="h-5 w-5" />
        {t('nav.dashboard')}
      </Link>

      {isAdmin && (
        <Link
          href="/admin"
          onClick={() => onCloseMobile()}
          className="flex items-center gap-2 py-2 text-lg font-medium"
        >
          <Shield className="h-5 w-5" />
          {t('nav.admin')}
        </Link>
      )}

      <Button
        variant="destructive"
        className="mt-4"
        onClick={() => {
          signOut();
          onCloseMobile();
        }}
      >
        <LogOut className="h-4 w-4 mr-2" />
        {t('nav.logout')}
      </Button>
    </>
  );
}
