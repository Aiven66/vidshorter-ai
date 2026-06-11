'use client';

import { useState } from 'react';
import { LayoutDashboard, Users, CreditCard, BarChart3, FileText, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onPageChange: (page: string) => void;
}

type Locale = 'zh' | 'en';

interface NavItem {
  id: string;
  label: { zh: string; en: string };
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { id: 'stats', label: { zh: '数据统计', en: 'Statistics' }, icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'users', label: { zh: '用户管理', en: 'Users' }, icon: <Users className="w-5 h-5" /> },
  { id: 'payments', label: { zh: '付费管理', en: 'Payments' }, icon: <CreditCard className="w-5 h-5" /> },
  { id: 'blog', label: { zh: '博客管理', en: 'Blog' }, icon: <FileText className="w-5 h-5" /> },
];

export function AdminLayout({ children, currentPage, onPageChange }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('admin_locale') as Locale;
      return saved || 'zh';
    }
    return 'zh';
  });

  const toggleLocale = () => {
    const newLocale: Locale = locale === 'zh' ? 'en' : 'zh';
    setLocale(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin_locale', newLocale);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 h-full w-64 bg-background border-r border-border z-50 transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
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
          <nav className="flex-1 px-3 py-4">
            <ul className="space-y-1">
              {navItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => onPageChange(item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      currentPage === item.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {item.icon}
                    {item.label[locale]}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Locale Switch */}
          <div className="p-4 border-t border-border">
            <button
              onClick={toggleLocale}
              className="w-full px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              {locale === 'zh' ? 'English' : '中文'}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-background border border-border lg:hidden"
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

export { type Locale };
