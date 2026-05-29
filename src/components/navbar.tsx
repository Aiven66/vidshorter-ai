'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import { useCredits } from '@/lib/credits-context';
import { Menu, Video, Sun, Moon } from 'lucide-react';
import dynamic from 'next/dynamic';

const LanguageSwitcher = dynamic(
  () => import('./navbar/language-switcher').then(m => ({ default: m.LanguageSwitcher })),
  { ssr: false }
);

const UserMenu = dynamic(
  () => import('./navbar/user-menu').then(m => ({ default: m.UserMenu })),
  { ssr: false }
);

export function Navbar() {
  const { user, signOut } = useAuth();
  const { t, locale, setLocale } = useLocale();
  const { balance } = useCredits();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkDesktop = () => {
      const desktop = !!(
        (typeof window !== 'undefined' && (window as any).vidshorterDesktop) ||
        process.env.NEXT_PUBLIC_DESKTOP === '1'
      );
      setIsDesktop(desktop);
    };
    checkDesktop();
  }, []);

  const showUser = mounted && !!user;
  const isAdmin = user?.role === 'admin';
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const navItems = isDesktop
    ? [
        { href: '/', label: t('nav.home') },
        { href: `${process.env.NEXT_PUBLIC_APP_URL || 'https://clipopai.vercel.app'}/pricing`, label: t('nav.pricing'), external: true },
      ]
    : [
        { href: '/', label: t('nav.home') },
        { href: '/blog', label: t('nav.blog') },
        { href: '/pricing', label: t('nav.pricing') },
      ];

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <Video className="h-6 w-6 text-primary" />
            <span>Clipop AI</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {navItems.map((item) =>
              item.external ? (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    isActive(item.href) ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              )
            )}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme">
              {mounted && theme === 'dark' ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>

            <LanguageSwitcher />

            {showUser ? (
              <UserMenu />
            ) : (
              <div className="flex items-center gap-2">
                {isDesktop ? (
                  <>
                    <Button variant="ghost" onClick={async () => {
                      if (window.clipopDesktop?.openWebLogin) {
                        await window.clipopDesktop.openWebLogin();
                      } else if ((window as any).agent?.openWebLogin) {
                        await (window as any).agent.openWebLogin();
                      } else {
                        window.open('https://clipopai.vercel.app/login?from=desktop', '_blank');
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
                        window.open('https://clipopai.vercel.app/register?from=desktop', '_blank');
                      }
                    }}>
                      {t('nav.register')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" asChild>
                      <Link href="/login">{t('nav.login')}</Link>
                    </Button>
                    <Button asChild>
                      <Link href="/register">{t('nav.register')}</Link>
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="flex flex-col gap-4 mt-8">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      Theme
                    </span>
                    <Button variant="outline" size="sm" onClick={toggleTheme}>
                      {mounted && theme === 'dark' ? t('nav.light') : t('nav.dark')}
                    </Button>
                  </div>
                </div>

                {navItems.map((item) =>
                  item.external ? (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMobileOpen(false)}
                      className="text-lg font-medium py-2 text-muted-foreground"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`text-lg font-medium py-2 ${
                        isActive(item.href) ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {item.label}
                    </Link>
                  )
                )}

                <hr className="my-2" />

                {showUser ? (
                  <>
                    <div className="flex items-center gap-2 py-2">
                      <span className="font-medium">{balance} {t('nav.credits')}</span>
                    </div>
                    <Link
                      href="/dashboard"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 py-2 text-lg font-medium"
                    >
                      {t('nav.dashboard')}
                    </Link>
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2 py-2 text-lg font-medium"
                      >
                        {t('nav.admin')}
                      </Link>
                    )}
                    <Button
                      variant="destructive"
                      className="mt-4"
                      onClick={() => {
                        signOut();
                        setMobileOpen(false);
                      }}
                    >
                      {t('nav.logout')}
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 mt-4">
                    <Button variant="outline" asChild>
                      <Link href="/login" onClick={() => setMobileOpen(false)}>
                        {t('nav.login')}
                      </Link>
                    </Button>
                    <Button asChild>
                      <Link href="/register" onClick={() => setMobileOpen(false)}>
                        {t('nav.register')}
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
