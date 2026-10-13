'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import { useCredits } from '@/lib/credits-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LogOut,
  CreditCard,
  LayoutDashboard,
  Shield,
  Gift,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { DESKTOP_WEB_APP_URL } from '@/lib/desktop-auth';
import { ReferralDialog } from '@/components/referral-dialog';

/**
 * 移动端顶栏用：紧凑横向布局。
 * - 未登录：单个 Login 按钮（Register 入口在登录页与抽屉内，避免顶栏拥挤）
 * - 已登录：积分胶囊 + 头像下拉菜单（Dashboard / 邀请 / 退出）
 */
export function MobileHeaderUser({ mounted, isDesktop }: { mounted: boolean; isDesktop: boolean }) {
  const { user, signOut } = useAuth();
  const { t } = useLocale();
  const { balance } = useCredits();
  const [referralOpen, setReferralOpen] = useState(false);

  if (!mounted) {
    return <div className="h-9 w-14 animate-pulse rounded-md bg-muted" aria-hidden />;
  }

  if (!user) {
    const loginLabel = t('nav.login') === 'nav.login' ? 'Login' : t('nav.login');
    if (isDesktop) {
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-9 shrink-0 px-3"
          onClick={async () => {
            if (window.clipopDesktop?.openWebLogin) {
              await window.clipopDesktop.openWebLogin();
            } else if ((window as any).agent?.openWebLogin) {
              await (window as any).agent.openWebLogin();
            } else {
              window.open(`${DESKTOP_WEB_APP_URL}/login?from=desktop`, '_blank');
            }
          }}
        >
          {loginLabel}
        </Button>
      );
    }
    return (
      <Button size="sm" variant="outline" asChild className="h-9 shrink-0 px-3">
        <Link href="/login" rel="nofollow">
          {loginLabel}
        </Link>
      </Button>
    );
  }

  const isAdmin = user?.role === 'admin';

  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs whitespace-nowrap">
        <CreditCard className="h-3 w-3 shrink-0 text-primary" />
        <span className="font-medium tabular-nums">{balance}</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Account menu">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name || user.email}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <User className="h-5 w-5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <div className="border-b border-border px-3 py-2">
            <p className="text-sm font-medium">{user?.name || t('common.user')}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <DropdownMenuItem asChild>
            <Link href="/dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              {t('nav.dashboard') === 'nav.dashboard' ? 'Dashboard' : t('nav.dashboard')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setReferralOpen(true);
            }}
          >
            <Gift className="h-4 w-4 mr-2 text-primary" />
            {t('nav.inviteFriends') === 'nav.inviteFriends' ? 'Invite Friends' : t('nav.inviteFriends')}
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link href="/admin" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                {t('nav.admin') === 'nav.admin' ? 'Admin' : t('nav.admin')}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={signOut} className="text-destructive">
            <LogOut className="h-4 w-4 mr-2" />
            {t('nav.logout') === 'nav.logout' ? 'Log out' : t('nav.logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ReferralDialog open={referralOpen} onOpenChange={setReferralOpen} />
    </div>
  );
}

/**
 * 移动端抽屉底部账户区：纵向布局。
 */
export function MobileUserSection({ mounted, isDesktop, onCloseMobile }: { mounted: boolean; isDesktop: boolean; onCloseMobile: () => void }) {
  const { user, signOut } = useAuth();
  const { t } = useLocale();
  const { balance } = useCredits();
  const [referralOpen, setReferralOpen] = useState(false);

  const showUser = mounted && !!user;
  const isAdmin = user?.role === 'admin';

  if (!showUser) {
    return (
      <div className="flex flex-col gap-2">
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
              <Link href="/login" rel="nofollow" onClick={() => onCloseMobile()}>
                {t('nav.login')}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/register" rel="nofollow" onClick={() => onCloseMobile()}>
                {t('nav.register')}
              </Link>
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="mb-1 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <CreditCard className="h-4 w-4 text-primary" />
          {t('nav.credits') === 'nav.credits' ? 'Credits' : t('nav.credits')}
        </span>
        <span className="font-semibold tabular-nums text-primary">{balance}</span>
      </div>

      <Link
        href="/dashboard"
        onClick={() => onCloseMobile()}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
      >
        <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
        {t('nav.dashboard') === 'nav.dashboard' ? 'Dashboard' : t('nav.dashboard')}
      </Link>

      <button
        type="button"
        onClick={() => {
          onCloseMobile();
          setReferralOpen(true);
        }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent"
      >
        <Gift className="h-5 w-5 text-muted-foreground" />
        {t('nav.inviteFriends') === 'nav.inviteFriends' ? 'Invite Friends' : t('nav.inviteFriends')}
      </button>

      {isAdmin && (
        <Link
          href="/admin"
          onClick={() => onCloseMobile()}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Shield className="h-5 w-5 text-muted-foreground" />
          {t('nav.admin') === 'nav.admin' ? 'Admin' : t('nav.admin')}
        </Link>
      )}

      <Button
        variant="destructive"
        className="mt-2"
        onClick={() => {
          signOut();
          onCloseMobile();
        }}
      >
        <LogOut className="h-4 w-4 mr-2" />
        {t('nav.logout') === 'nav.logout' ? 'Log out' : t('nav.logout')}
      </Button>

      <ReferralDialog open={referralOpen} onOpenChange={setReferralOpen} />
    </div>
  );
}
