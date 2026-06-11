'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, TrendingUp, Users, CreditCard, Calendar, Activity, DollarSign, Target } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { type Locale } from './admin-layout';

interface RetentionStats {
  day1: number;
  day3: number;
  day7: number;
  day30: number;
}

interface CoreStats {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  newUsersThisMonth: number;
  totalRevenue: number;
  activeSubscriptions: number;
  totalPayments: number;
  totalVideosProcessed: number;
  retention: RetentionStats;
  arpu: number;
  conversionRate: number;
  avgRevenuePerUser: number;
}

interface StatsPageProps {
  locale: Locale;
}

export function StatsPage({ locale }: StatsPageProps) {
  const { accessToken } = useAuth();
  const [stats, setStats] = useState<CoreStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/analytics', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to load stats (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const statCards = stats ? [
    {
      title: locale === 'zh' ? '累计用户数' : 'Total Users',
      value: stats.totalUsers.toLocaleString(),
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      title: locale === 'zh' ? '活跃用户数' : 'Active Users',
      value: stats.activeUsers.toLocaleString(),
      icon: Activity,
      color: 'bg-green-500',
    },
    {
      title: locale === 'zh' ? '今日新增' : 'New Today',
      value: stats.newUsersToday.toLocaleString(),
      icon: Calendar,
      color: 'bg-emerald-500',
    },
    {
      title: locale === 'zh' ? '本月新增' : 'New This Month',
      value: stats.newUsersThisMonth.toLocaleString(),
      icon: TrendingUp,
      color: 'bg-cyan-500',
    },
    {
      title: locale === 'zh' ? '累计收入' : 'Total Revenue',
      value: `$${stats.totalRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: 'bg-amber-500',
    },
    {
      title: locale === 'zh' ? '活跃订阅' : 'Active Subscriptions',
      value: stats.activeSubscriptions.toLocaleString(),
      icon: CreditCard,
      color: 'bg-purple-500',
    },
    {
      title: locale === 'zh' ? '付费率' : 'Conversion Rate',
      value: formatPercent(stats.conversionRate),
      icon: Target,
      color: 'bg-rose-500',
    },
    {
      title: locale === 'zh' ? 'ARPU' : 'ARPU',
      value: `$${stats.arpu.toFixed(2)}`,
      icon: DollarSign,
      color: 'bg-indigo-500',
    },
  ] : [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {locale === 'zh' ? '数据统计' : 'Analytics'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {locale === 'zh' ? '平台核心数据指标' : 'Core platform metrics'}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">{stat.title}</div>
                  <div className="text-2xl font-bold">{loading ? '...' : stat.value}</div>
                </div>
                <div className={`p-2 rounded-lg ${stat.color}/20`}>
                  <stat.icon className={`w-5 h-5 ${stat.color.replace('bg-', 'text-')}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Retention Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              {locale === 'zh' ? '用户留存率' : 'User Retention'}
            </CardTitle>
            <CardDescription>
              {locale === 'zh' ? '新增用户留存率（按注册后天数）' : 'New user retention by days since registration'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { day: 1, label: locale === 'zh' ? '次日留存' : 'Day 1' },
                  { day: 3, label: locale === 'zh' ? '3日留存' : 'Day 3' },
                  { day: 7, label: locale === 'zh' ? '7日留存' : 'Day 7' },
                  { day: 30, label: locale === 'zh' ? '30日留存' : 'Day 30' },
                ].map((item) => {
                  const value = stats?.retention[`day${item.day}` as keyof RetentionStats] || 0;
                  const maxRetention = Math.max(
                    stats?.retention.day1 || 0,
                    stats?.retention.day3 || 0,
                    stats?.retention.day7 || 0,
                    stats?.retention.day30 || 0,
                    1,
                  );
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
          </CardContent>
        </Card>

        {/* Additional Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              {locale === 'zh' ? '关键指标' : 'Key Metrics'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {locale === 'zh' ? '平均每用户收入' : 'Average Revenue per User'}
                    </div>
                    <div className="text-xl font-bold">${stats?.avgRevenuePerUser.toFixed(2) || '0.00'}</div>
                  </div>
                  <DollarSign className="w-8 h-8 text-primary" />
                </div>
                <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {locale === 'zh' ? '付费用户数' : 'Paying Users'}
                    </div>
                    <div className="text-xl font-bold">
                      {stats?.activeSubscriptions.toLocaleString() || '0'}
                    </div>
                  </div>
                  <CreditCard className="w-8 h-8 text-primary" />
                </div>
                <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {locale === 'zh' ? '总付费次数' : 'Total Payments'}
                    </div>
                    <div className="text-xl font-bold">
                      {stats?.totalPayments.toLocaleString() || '0'}
                    </div>
                  </div>
                  <Target className="w-8 h-8 text-primary" />
                </div>
                <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {locale === 'zh' ? '视频处理总量' : 'Videos Processed'}
                    </div>
                    <div className="text-xl font-bold">
                      {stats?.totalVideosProcessed.toLocaleString() || '0'}
                    </div>
                  </div>
                  <Activity className="w-8 h-8 text-primary" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
