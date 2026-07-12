'use client';

import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin-layout';
import { StatsPage } from '@/components/admin-stats';
import { UsersPage } from '@/components/admin-users';
import { PaymentsPage } from '@/components/admin-payments';
import { BlogPage } from '@/components/admin-blog';
import { EventsPage } from '@/components/admin-events';
import { AdminGate } from '@/lib/admin-gate';

export default function AxAdminPage() {
  const [currentPage, setCurrentPage] = useState('stats');
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');

  useEffect(() => {
    const saved = localStorage.getItem('admin_locale') as 'zh' | 'en';
    if (saved) {
      setLocale(saved);
    }
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'stats':
        return <StatsPage locale={locale} />;
      case 'users':
        return <UsersPage locale={locale} />;
      case 'payments':
        return <PaymentsPage locale={locale} />;
      case 'blog':
        return <BlogPage locale={locale} />;
      case 'events':
        return <EventsPage locale={locale} />;
      default:
        return <StatsPage locale={locale} />;
    }
  };

  return (
    <AdminGate>
      <AdminLayout
        currentPage={currentPage}
        onPageChange={setCurrentPage}
      >
        <>{renderPage()}</>
      </AdminLayout>
    </AdminGate>
  );
}
