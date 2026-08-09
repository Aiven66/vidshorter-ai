'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import { useCredits } from '@/lib/credits-context';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { User, LogOut, CreditCard, LayoutDashboard, Shield, Gift } from 'lucide-react';
import Link from 'next/link';
import { DESKTOP_WEB_APP_URL } from '@/lib/desktop-auth';
import { ReferralDialog } from '@/components/referral-dialog';

export function NavbarUserSection({ mounted, isDesktop }: { mounted: boolean; isDesktop: boolean }) {
  const { user, signOut } = useAuth();
  const { t } = useLocale();
  const { balance } = useCredits();
  const [referralOpen, setReferralOpen] = useState(false);

  const showUser = mounted && !!user;
  const isAdmin = user?.role === 'admin';

  if (!showUser) {
    return (
      <div className="flex items-center gap-2">
        {isDesktop ? (
          <>
            <Button variant="ghost" onClick={async () => {
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
            <Button variant="ghost" asChild>
              <Link href="/login" rel="nofollow">{t('nav.login')}</Link>
            </Button>
            <Button asChild>
              <Link href="/register" rel="nofollow">{t('nav.register')}</Link>
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
      <div className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded-md text-xs whitespace-nowrap shrink-0">
        <CreditCard className="h-3 w-3 text-primary shrink-0" />
        <span className="font-medium tabular-nums">{balance}</span>
      </div>

      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => setReferralOpen(true)}
        title={t('nav.inviteFriends')}
        aria-label={t('nav.inviteFriends')}
      >
        <Gift className="h-3.5 w-3.5 text-primary" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-1.5 h-9 px-1.5 shrink-0">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name || user.email}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <User className="h-5 w-5" />
            )}
            <span className="text-sm font-medium hidden lg:inline max-w-[120px] truncate">
              {user?.name || user.email?.split('@')[0] || t('common.user')}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-sm font-medium">{user?.name || t('common.user')}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <DropdownMenuItem asChild>
            <Link href="/dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              {t('nav.dashboard')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setReferralOpen(true); }}>
            <Gift className="h-4 w-4 mr-2" />
            {t('nav.inviteFriends')}
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link href="/admin" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                {t('nav.admin')}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={signOut} className="text-destructive">
            <LogOut className="h-4 w-4 mr-2" />
            {t('nav.logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ReferralDialog open={referralOpen} onOpenChange={setReferralOpen} />
    </div>
  );
}
