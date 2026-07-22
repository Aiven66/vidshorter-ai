'use client';

/**
 * Admin dashboard — integrates all admin pages into a single shell.
 * Built-in nav: stats / users / payments / events.
 * Extend via `extraNavItems` (e.g. blog management from @clipop/blog).
 * Wrapped in AdminGate from @clipop/auth.
 */

import { useState, useEffect, type ReactNode } from 'react';
import { Activity, BarChart3, CreditCard, Users } from 'lucide-react';
import { AdminLayout, type Locale, type NavItem } from './admin-layout';
import { StatsPage } from './stats-page';
import { UsersPage } from './users-page';
import { PaymentsPage } from './payments-page';
import { EventsPage } from './events-page';
import { AdminGate } from '../auth';

export interface ExtraNavItem {
  id: string;
  label: string | { zh: string; en: string };
  icon?: ReactNode;
  component: ReactNode;
}

export interface AdminDashboardProps {
  /** Admin bearer token used to call API routes. */
  token: string;
  locale?: Locale;
  onLogout?: () => void;
  /** Optional: override API endpoints. */
  endpoints?: {
    analytics?: string;
    users?: string;
    payments?: string;
    events?: string;
  };
  /** Extra nav items (e.g. blog manager). */
  extraNavItems?: ExtraNavItem[];
  /** Override locale change handler (default: persists to localStorage). */
  onLocaleChange?: (locale: Locale) => void;
}

export function AdminDashboard({
  token,
  locale: initialLocale = 'en',
  onLogout,
  endpoints,
  extraNavItems = [],
  onLocaleChange,
}: AdminDashboardProps) {
  const [currentView, setCurrentView] = useState('stats');
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('admin_locale') as Locale | null;
    if (saved && saved !== locale) setLocale(saved);
  }, []);

  const handleLocaleChange = (next: Locale) => {
    setLocale(next);
    if (typeof window !== 'undefined') localStorage.setItem('admin_locale', next);
    onLocaleChange?.(next);
  };

  // Built-in nav items.
  const builtinNavItems: NavItem[] = [
    { id: 'stats', label: { zh: '数据统计', en: 'Statistics' }, icon: <BarChart3 className="w-5 h-5" /> },
    { id: 'users', label: { zh: '用户管理', en: 'Users' }, icon: <Users className="w-5 h-5" /> },
    { id: 'payments', label: { zh: '付费管理', en: 'Payments' }, icon: <CreditCard className="w-5 h-5" /> },
    { id: 'events', label: { zh: '行为数据', en: 'Events' }, icon: <Activity className="w-5 h-5" /> },
  ];

  // Merge with extra nav items.
  const allNavItems: NavItem[] = [
    ...builtinNavItems,
    ...extraNavItems.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
    })),
  ];

  const renderContent = (): ReactNode => {
    switch (currentView) {
      case 'stats':
        return <StatsPage token={token} locale={locale} endpoint={endpoints?.analytics} />;
      case 'users':
        return <UsersPage token={token} locale={locale} endpoint={endpoints?.users} />;
      case 'payments':
        return <PaymentsPage token={token} locale={locale} endpoint={endpoints?.payments} />;
      case 'events':
        return <EventsPage token={token} locale={locale} endpoint={endpoints?.events} />;
      default: {
        // Check extra nav items.
        const extra = extraNavItems.find((item) => item.id === currentView);
        if (extra) return extra.component;
        return <StatsPage token={token} locale={locale} endpoint={endpoints?.analytics} />;
      }
    }
  };

  return (
    <AdminGate>
      <AdminLayout
        navItems={allNavItems}
        currentId={currentView}
        onNavigate={setCurrentView}
        locale={locale}
        onLocaleChange={handleLocaleChange}
        onLogout={onLogout}
      >
        {renderContent()}
      </AdminLayout>
    </AdminGate>
  );
}
