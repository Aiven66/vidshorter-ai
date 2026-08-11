'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import {
  Scissors,
  FileText,
  Newspaper,
  Tag,
  Info,
  Sun,
  Moon,
  Menu,
  CreditCard,
  Gift,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  ShoppingBag,
  TrendingUp,
  BookOpen,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { DESKTOP_WEB_APP_URL } from '@/lib/desktop-auth';
import { useCredits } from '@/lib/credits-context';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';

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

// 左侧栏入口：高光剪辑 / 高光笔记 / 博客 / 定价 / 关于我们
type NavItem = {
  href: string;
  // 通过 useLocale().t('nav.xxx') 读取翻译
  labelKey: 'clips' | 'notes' | 'blog' | 'pricing' | 'about' | 'download' | 'marketing' | 'news' | 'article';
  icon: typeof Scissors;
  badge?: 'NEW';
};

const NAV_ITEMS: NavItem[] = [
  { href: '/video-clips', labelKey: 'clips', icon: Scissors },
  { href: '/video-notes', labelKey: 'notes', icon: FileText, badge: 'NEW' },
  { href: '/marketing-video', labelKey: 'marketing', icon: ShoppingBag, badge: 'NEW' },
  { href: '/news-video', labelKey: 'news', icon: TrendingUp, badge: 'NEW' },
  { href: '/article-to-video', labelKey: 'article', icon: BookOpen, badge: 'NEW' },
  { href: '/blog', labelKey: 'blog', icon: Newspaper },
  { href: '/pricing', labelKey: 'pricing', icon: Tag },
  { href: '/download', labelKey: 'download', icon: Download },
  { href: '/about', labelKey: 'about', icon: Info },
];

function SidebarLogo() {
  return (
    <img
      src="/clipop-logo3.svg"
      alt="Clipop AI"
      className="h-7 w-7 object-contain"
    />
  );
}

function AppSidebarContent({
  pathname,
  isDesktop,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  pathname: string | null;
  isDesktop: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const isActive = (path: string) => path === '/' ? pathname === '/' : pathname?.startsWith(path);

  return (
    <nav className="flex flex-col h-full">
      {/* Logo + 收起按钮 区 */}
      <div className={`flex items-center border-b border-border ${collapsed ? 'justify-center px-1 py-3' : 'justify-between px-3 py-3'}`}>
        <Link
          href="/video-clips"
          className="flex items-center gap-2"
          onClick={onNavigate}
          title={collapsed ? 'Clipop AI' : undefined}
        >
          <SidebarLogo />
          {!collapsed && <span className="font-bold text-lg leading-tight">Clipop AI</span>}
        </Link>
        {/* 收起按钮 — 紧邻 Logo 右侧 */}
        {!collapsed && onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* 主导航入口 */}
      <div className={`flex flex-col gap-1 flex-1 ${collapsed ? 'px-1' : 'px-2'}`}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const href = isDesktop
            ? `${process.env.NEXT_PUBLIC_APP_URL || DESKTOP_WEB_APP_URL}${item.href}`
            : item.href;
          const active = isActive(item.href);

          const content = (
            <>
              <Icon className={`h-5 w-5 flex-shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
              {!collapsed && (
                <span className={`text-sm font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                  <SidebarLabel labelKey={item.labelKey} />
                </span>
              )}
              {item.badge === 'NEW' && !collapsed && (
                <span className="ml-auto text-[10px] font-bold bg-destructive text-white px-1.5 py-0.5 rounded">
                  NEW
                </span>
              )}
            </>
          );

          const className = `flex items-center gap-3 rounded-lg transition-colors hover:bg-accent ${
            collapsed ? 'justify-center px-1 py-2.5' : 'px-3 py-2.5'
          } ${active ? 'bg-primary/10 text-primary' : ''}`;

          if (isDesktop) {
            return (
              <a
                key={item.href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onNavigate}
                className={className}
                title={collapsed ? item.labelKey : undefined}
              >
                {content}
              </a>
            );
          }
          return (
            <Link
              key={item.href}
              href={href}
              onClick={onNavigate}
              className={className}
              title={collapsed ? item.labelKey : undefined}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// 独立组件：从 locale-context 读取翻译
function SidebarLabel({ labelKey }: { labelKey: NavItem['labelKey'] }) {
  const { t } = useLocale();
  // 翻译 key 形如 nav.clips / nav.notes / nav.podcast / nav.pricing / nav.about
  // 如果 i18n 缺失该 key，t() 会返回 key 本身；这里提供中文回退避免显示 nav.xxx
  const key = `nav.${labelKey}`;
  const fallback: Record<NavItem['labelKey'], string> = {
    clips: '高光剪辑',
    notes: '高光笔记',
    marketing: '营销视频',
    news: '资讯视频',
    article: '文章转视频',
    blog: '博客',
    pricing: '定价',
    download: '下载客户端',
    about: '关于我们',
  };
  const translated = t(key);
  // 若返回值等于 key 自身，说明该 key 在 i18n 中缺失
  const label = translated === key ? fallback[labelKey] : translated;
  return <>{label || fallback[labelKey]}</>;
}

function SidebarCreditsCard({ mounted, collapsed = false }: { mounted: boolean; collapsed?: boolean }) {
  const { user } = useAuth();
  const { balance } = useCredits();
  const { t } = useLocale();
  if (!mounted || !user) return null;
  if (collapsed) {
    return (
      <div className="px-1 pb-3">
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-2 flex flex-col items-center gap-1">
          <CreditCard className="h-3.5 w-3.5 text-primary/80" />
          <span className="text-sm font-bold text-primary">{balance}</span>
        </div>
      </div>
    );
  }
  // 翻译兜底
  const creditsLabel = t('nav.creditsBalance') === 'nav.creditsBalance' ? 'Credits' : t('nav.creditsBalance');
  const upgradeLabel = t('nav.upgradePro') === 'nav.upgradePro' ? 'Upgrade' : t('nav.upgradePro');
  return (
    <div className="px-3 pb-3">
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-primary/80">
          <CreditCard className="h-3.5 w-3.5" />
          <span>{creditsLabel}</span>
        </div>
        <div className="text-xl font-bold text-primary">
          {balance}
        </div>
        <Button size="sm" asChild className="w-full h-7 text-xs">
          <Link href="/pricing">
            <Gift className="h-3.5 w-3.5 mr-1" />
            {upgradeLabel}
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // 恢复侧边栏折叠状态
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed');
      if (saved === 'true') setCollapsed(true);
    } catch {}
  }, []);

  // 持久化折叠状态
  useEffect(() => {
    try {
      localStorage.setItem('sidebar_collapsed', String(collapsed));
    } catch {}
  }, [collapsed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
      setIsDesktop(!!(window.vidshorterDesktop || process.env.NEXT_PUBLIC_DESKTOP === '1'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const toggleSidebar = () => setCollapsed((v) => !v);

  return (
    <div className="min-h-screen flex">
      {/* 桌面端左侧栏 */}
      <aside
        className={`hidden md:flex flex-shrink-0 flex-col border-r border-border bg-background sticky top-0 h-screen transition-all duration-300 ease-in-out ${
          collapsed ? 'w-[56px]' : 'w-[200px]'
        }`}
      >
        <AppSidebarContent
          pathname={pathname}
          isDesktop={isDesktop}
          collapsed={collapsed}
          onToggleCollapse={toggleSidebar}
        />
        {/* 收起状态下，在 Logo 下方放一个展开按钮 */}
        {collapsed && (
          <div className="px-1 py-1 flex justify-center border-b border-border">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          </div>
        )}
        <SidebarCreditsCard mounted={mounted} collapsed={collapsed} />
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 — 右上角用户区 */}
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 items-center justify-end gap-1.5 px-4 md:px-6 flex-nowrap overflow-x-auto overflow-y-hidden">
            {/* 移动端汉堡 + Logo */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild className="md:hidden mr-auto">
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <AppSidebarContent
                  pathname={pathname}
                  isDesktop={isDesktop}
                  onNavigate={() => setMobileOpen(false)}
                />
                <SidebarCreditsCard mounted={mounted} />
              </SheetContent>
            </Sheet>

            <div className="md:hidden mr-auto flex items-center gap-1 font-bold">
              <SidebarLogo />
              <span className="leading-tight">Clipop AI</span>
            </div>

            {/* 右上角用户区 */}
            <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme" className="hidden md:inline-flex">
              {mounted && theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            <div className="hidden md:block">
              <LanguageSwitcher />
            </div>

            <div className="hidden md:block">
              <NavbarUserSection mounted={mounted} isDesktop={isDesktop} />
            </div>

            {/* 移动端简化 */}
            <div className="md:hidden flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={toggleTheme}>
                {mounted && theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <MobileUserSection mounted={mounted} isDesktop={isDesktop} onCloseMobile={() => setMobileOpen(false)} />
            </div>
          </div>
        </header>

        {/* 主内容 */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
