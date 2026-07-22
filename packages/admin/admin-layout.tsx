'use client';

/**
 * Admin dashboard layout — sidebar + main content area.
 * Framework-agnostic: no shadcn/ui, just Tailwind + native elements.
 */

import { useState, type ReactNode } from 'react';
import { LayoutDashboard, Menu, X } from 'lucide-react';

export type Locale = 'zh' | 'en';

export interface NavItem {
  id: string;
  label: string | { zh: string; en: string };
  icon?: ReactNode;
}

export interface AdminLayoutProps {
  children: ReactNode;
  navItems: NavItem[];
  currentId: string;
  onNavigate: (id: string) => void;
  locale: Locale;
  onLocaleChange?: (locale: Locale) => void;
  onLogout?: () => void;
  user?: { email?: string; name?: string } | null;
}

function resolveLabel(label: NavItem['label'], locale: Locale): string {
  if (typeof label === 'string') return label;
  return label[locale] || label.en;
}

export function AdminLayout({
  children,
  navItems,
  currentId,
  onNavigate,
  locale,
  onLocaleChange,
  onLogout,
  user,
}: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleLocale = () => {
    if (!onLocaleChange) return;
    onLocaleChange(locale === 'zh' ? 'en' : 'zh');
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={[
          'fixed lg:sticky top-0 left-0 h-full w-64 bg-background border-r border-border z-50',
          'transition-transform duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-2 h-16 px-4 border-b border-border">
            <LayoutDashboard className="w-6 h-6 text-primary" />
            <span className="font-semibold text-lg">
              {locale === 'zh' ? '管理后台' : 'Admin'}
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 overflow-y-auto">
            <ul className="space-y-1">
              {navItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      onNavigate(item.id);
                      setSidebarOpen(false);
                    }}
                    className={[
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      currentId === item.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    ].join(' ')}
                  >
                    {item.icon}
                    <span>{resolveLabel(item.label, locale)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* User info + Locale switch + Logout */}
          <div className="p-4 border-t border-border space-y-2">
            {user?.email && (
              <div className="px-3 py-1.5 text-xs text-muted-foreground truncate">
                {user.email}
              </div>
            )}
            {onLocaleChange && (
              <button
                onClick={toggleLocale}
                className="w-full px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              >
                {locale === 'zh' ? 'English' : '中文'}
              </button>
            )}
            {onLogout && (
              <button
                onClick={onLogout}
                className="w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
              >
                {locale === 'zh' ? '退出登录' : 'Logout'}
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-background border border-border lg:hidden"
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
