'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import { useCredits } from '@/lib/credits-context';
import { Menu, Globe, User, LogOut, Video, CreditCard, LayoutDashboard, Shield, Sun, Moon } from 'lucide-react';

export function Navbar() {
  const { user, signOut } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const { balance } = useCredits();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setMounted(true);
    // 检查是否是桌面模式
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

  // 桌面模式下只保留首页
  const navItems = isDesktop
    ? [{ href: '/', label: t('nav.home') }]
    : [
        { href: '/', label: t('nav.home') },
        { href: '/blog', label: t('nav.blog') },
        { href: '/pricing', label: t('nav.pricing') },
      ];

  // 桌面模式下请求认证
  const handleDesktopAuth = async () => {
    try {
      if (window.api?.requestAuth) {
        await window.api.requestAuth();
      } else if ((window as any).electronAPI?.openAuth) {
        await (window as any).electronAPI.openAuth();
      }
    } catch (e) {
      console.error('Failed to open auth flow:', e);
    }
  };

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <Video className="h-6 w-6 text-primary" />
            <span>VidShorter AI</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  isActive(item.href) ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Right Side */}
          <div className="hidden md:flex items-center gap-4">
            {/* Theme Toggle */}
            <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme">
              {mounted && theme === 'dark' ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>

            {/* Language Switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Globe className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setLocale('en')}>
                  English {locale === 'en' && '✓'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocale('zh')}>
                  中文 {locale === 'zh' && '✓'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {showUser ? (
              <>
                {/* Credits Display */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg text-sm">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <span>{balance} {t('nav.credits')}</span>
                </div>

                {/* User Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <User className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
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
              </>
            ) : (
              <div className="flex items-center gap-2">
                {isDesktop ? (
                  <>
                    <Button variant="ghost" onClick={handleDesktopAuth}>
                      {t('nav.login')}
                    </Button>
                    <Button onClick={handleDesktopAuth}>
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

          {/* Mobile Menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="flex flex-col gap-4 mt-8">
                {/* Language Switcher */}
                <div className="flex gap-2">
                  <Button
                    variant={locale === 'en' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setLocale('en')}
                  >
                    English
                  </Button>
                  <Button
                    variant={locale === 'zh' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setLocale('zh')}
                  >
                    中文
                  </Button>
                  {/* Theme Toggle */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleTheme}
                    className="ml-auto"
                  >
                    {mounted && theme === 'dark' ? (
                      <><Sun className="h-4 w-4 mr-1" />Light</>
                    ) : (
                      <><Moon className="h-4 w-4 mr-1" />Dark</>
                    )}
                  </Button>
                </div>

                {/* Nav Items */}
                {navItems.map((item) => (
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
                ))}

                <hr className="my-2" />

                {showUser ? (
                  <>
                    {/* Credits */}
                    <div className="flex items-center gap-2 py-2">
                      <CreditCard className="h-5 w-5 text-primary" />
                      <span className="font-medium">{balance} {t('nav.credits')}</span>
                    </div>

                    <Link
                      href="/dashboard"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 py-2 text-lg font-medium"
                    >
                      <LayoutDashboard className="h-5 w-5" />
                      {t('nav.dashboard')}
                    </Link>

                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setMobileOpen(false)}
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
                        setMobileOpen(false);
                      }}
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      {t('nav.logout')}
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 mt-4">
                    {isDesktop ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setMobileOpen(false);
                            handleDesktopAuth();
                          }}
                        >
                          {t('nav.login')}
                        </Button>
                        <Button
                          onClick={() => {
                            setMobileOpen(false);
                            handleDesktopAuth();
                          }}
                        >
                          {t('nav.register')}
                        </Button>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
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
