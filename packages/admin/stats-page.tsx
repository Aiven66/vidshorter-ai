'use client';

/**
 * Stats page — displays 8 metric cards + retention bars.
 * Fetches from /api/admin/analytics every 60 seconds.
 * No shadcn/ui: native elements + Tailwind only.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Calendar,
  CreditCard,
  DollarSign,
  Loader2,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { Locale } from './admin-layout';

interface RetentionRates {
  day1: number;
  day3: number;
  day7: number;
  day30: number;
}

interface StatsData {
  totalUsers: number;
  newToday: number;
  newThisMonth: number;
  activeSubs: number;
  totalVideos: number;
  totalRevenue: number;
  activeUsers7d: number;
  retentionRates: RetentionRates;
  arpu: number;
  conversionRate: number;
}

export interface StatsPageProps {
  token: string;
  locale?: Locale;
  /** Override the default API endpoint. */
  endpoint?: string;
}

export function StatsPage({ token, locale = 'en', endpoint = '/api/admin/analytics' }: StatsPageProps) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = (await res.json()) as Partial<StatsData>;
        setStats({
          totalUsers: data.totalUsers ?? 0,
          newToday: data.newToday ?? 0,
          newThisMonth: data.newThisMonth ?? 0,
          activeSubs: data.activeSubs ?? 0,
          totalVideos: data.totalVideos ?? 0,
          totalRevenue: data.totalRevenue ?? 0,
          activeUsers7d: data.activeUsers7d ?? 0,
          retentionRates: data.retentionRates ?? { day1: 0, day3: 0, day7: 0, day30: 0 },
          arpu: data.arpu ?? 0,
          conversionRate: data.conversionRate ?? 0,
        });
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [token, endpoint]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const formatPercent = (value: number) => `${(value || 0).toFixed(1)}%`;

  const cards = [
    { title: t('累计用户', 'Total Users'), value: stats?.totalUsers.toLocaleString() ?? '0', icon: Users, color: 'text-blue-600 bg-blue-50' },
    { title: t('活跃用户(7天)', 'Active Users (7d)'), value: stats?.activeUsers7d.toLocaleString() ?? '0', icon: Activity, color: 'text-green-600 bg-green-50' },
    { title: t('今日新增', 'New Today'), value: stats?.newToday.toLocaleString() ?? '0', icon: Calendar, color: 'text-emerald-600 bg-emerald-50' },
    { title: t('本月新增', 'New This Month'), value: stats?.newThisMonth.toLocaleString() ?? '0', icon: TrendingUp, color: 'text-cyan-600 bg-cyan-50' },
    { title: t('累计收入', 'Total Revenue'), value: `$${(stats?.totalRevenue ?? 0).toLocaleString()}`, icon: DollarSign, color: 'text-amber-600 bg-amber-50' },
    { title: t('活跃订阅', 'Active Subscriptions'), value: stats?.activeSubs.toLocaleString() ?? '0', icon: CreditCard, color: 'text-purple-600 bg-purple-50' },
    { title: t('视频数', 'Total Videos'), value: stats?.totalVideos.toLocaleString() ?? '0', icon: Activity, color: 'text-rose-600 bg-rose-50' },
    { title: t('留存率', 'Retention Rate'), value: formatPercent(stats?.retentionRates?.day1 ?? 0), icon: Target, color: 'text-indigo-600 bg-indigo-50' },
  ];

  const retentionItems = [
    { day: 1, label: t('次日留存', 'Day 1') },
    { day: 3, label: t('3日留存', 'Day 3') },
    { day: 7, label: t('7日留存', 'Day 7') },
    { day: 30, label: t('30日留存', 'Day 30') },
  ];

  const maxRetention = Math.max(
    stats?.retentionRates.day1 ?? 0,
    stats?.retentionRates.day3 ?? 0,
    stats?.retentionRates.day7 ?? 0,
    stats?.retentionRates.day30 ?? 0,
    1,
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('数据统计', 'Analytics')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('平台核心数据指标', 'Core platform metrics')}</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <div key={i} className="border border-border rounded-xl p-4 bg-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground mb-1">{card.title}</div>
                <div className="text-2xl font-bold">{loading && !stats ? '...' : card.value}</div>
              </div>
              <div className={`p-2 rounded-lg ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Retention */}
        <div className="border border-border rounded-xl p-5 bg-card space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            <h2 className="font-semibold">{t('用户留存率', 'User Retention')}</h2>
          </div>
          {loading && !stats ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {retentionItems.map((item) => {
                const value = stats?.retentionRates[`day${item.day}` as keyof RetentionRates] ?? 0;
                return (
                  <div key={item.day}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="text-sm font-semibold">{formatPercent(value)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
                        style={{ width: `${(value / maxRetention) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Key metrics */}
        <div className="border border-border rounded-xl p-5 bg-card space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            <h2 className="font-semibold">{t('关键指标', 'Key Metrics')}</h2>
          </div>
          {loading && !stats ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground">{t('ARPU', 'ARPU')}</div>
                <div className="text-lg font-bold">${(stats?.arpu ?? 0).toFixed(2)}</div>
              </div>
              <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground">{t('活跃订阅', 'Active Subscriptions')}</div>
                <div className="text-lg font-bold">{stats?.activeSubs.toLocaleString() ?? '0'}</div>
              </div>
              <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground">{t('累计收入', 'Total Revenue')}</div>
                <div className="text-lg font-bold">${(stats?.totalRevenue ?? 0).toLocaleString()}</div>
              </div>
              <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground">{t('视频处理总量', 'Videos Processed')}</div>
                <div className="text-lg font-bold">{stats?.totalVideos.toLocaleString() ?? '0'}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
