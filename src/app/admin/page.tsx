'use client';

import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin-layout';
import { StatsPage } from '@/components/admin-stats';
import { UsersPage } from '@/components/admin-users';
import { PaymentsPage } from '@/components/admin-payments';
import { BlogPage } from '@/components/admin-blog';

export default function AdminPage() {
  const [currentPage, setCurrentPage] = useState('stats');
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');

  useEffect(() => {
    const saved = localStorage.getItem('admin_locale') as 'zh' | 'en';
    if (saved) {
      setLocale(saved);
    }
  }, []);

  const handleLocaleChange = () => {
    const newLocale: 'zh' | 'en' = locale === 'zh' ? 'en' : 'zh';
    setLocale(newLocale);
    localStorage.setItem('admin_locale', newLocale);
  };

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
      default:
        return <StatsPage locale={locale} />;
    }
  };

  return (
    <AdminLayout
      currentPage={currentPage}
      onPageChange={setCurrentPage}
    >
      {/* Hidden locale switch trigger - actual switch is in sidebar */}
      <button
        onClick={handleLocaleChange}
        className="hidden"
        id="locale-switch-trigger"
      />
      {renderPage()}
    </AdminLayout>
  );
}
