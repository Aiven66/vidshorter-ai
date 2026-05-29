'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { useLocale } from '@/lib/locale-context';
import { Menu, Globe, Video, Sun, Moon } from 'lucide-react';
import dynamic from 'next/dynamic';

const NavbarUserSection = dynamic(
  () => import('@/components/navbar/navbar-user-section').then(m => ({ default: m.NavbarUserSection })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2">
        <div className="h-9 w-16 bg-muted animate-pulse rounded" />
        <div className="h-9 w-20 bg-muted animate-pulse rounded" />
      </div>
    ),
  }
);

const MobileUserSection = dynamic(
  () => import('@/components/navbar/mobile-user-section').then(m => ({ default: m.MobileUserSection })),
  { ssr: false }
);

const LanguageSwitcher = dynamic(
  () => import('@/components/navbar/language-switcher').then(m => ({ default: m.LanguageSwitcher })),
  { ssr: false }
);

const MobileLanguageGrid = dynamic(
  () => import('@/components/navbar/mobile-language-grid').then(m => ({ default: m.MobileLanguageGrid })),
  { ssr: false }
);

export function Navbar() {
  const { t } = useLocale();
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

            <NavbarUserSection mounted={mounted} isDesktop={isDesktop} />
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
                      <Globe className="h-4 w-4 inline mr-1" />
                      Language
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleTheme}
                    >
                      {mounted && theme === 'dark' ? (
                        <><Sun className="h-4 w-4 mr-1" />{t('nav.light')}</>
                      ) : (
                        <><Moon className="h-4 w-4 mr-1" />{t('nav.dark')}</>
                      )}
                    </Button>
                  </div>
                  <MobileLanguageGrid />
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

                <MobileUserSection mounted={mounted} isDesktop={isDesktop} onCloseMobile={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
