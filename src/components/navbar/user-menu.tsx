'use client';

import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import { useCredits } from '@/lib/credits-context';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User, LogOut, CreditCard, LayoutDashboard, Shield } from 'lucide-react';

export function UserMenu() {
  const { user, signOut } = useAuth();
  const { t } = useLocale();
  const { balance } = useCredits();
  const isAdmin = user?.role === 'admin';

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" asChild>
          <Link href="/login">{t('nav.login')}</Link>
        </Button>
        <Button asChild>
          <Link href="/register">{t('nav.register')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg text-sm">
          <CreditCard className="h-4 w-4 text-primary" />
          <span>{balance} {t('nav.credits')}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || user.email}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <User className="h-5 w-5" />
              )}
              <span className="text-sm font-medium hidden md:inline">
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
      </div>
    </>
  );
}
