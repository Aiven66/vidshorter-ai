'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import {
  Activity, Users, MousePointer, Video, Download,
  DollarSign, TrendingUp, Calendar, ChevronDown, ChevronUp, Filter,
  CreditCard, Wallet, CheckCircle2
} from 'lucide-react';

type Locale = 'zh' | 'en';

interface FunnelStep {
  step: number;
  event: string;
  label: string;
  count: number;
  unique_users: number;
  unique_sessions: number;
  conversion_from_previous: number;
  conversion_from_first: number;
}

interface FunnelStats {
  funnel_id: string;
  steps: FunnelStep[];
  total_count: number;
}

interface PaymentMethodStat {
  payment_method: 'paypal' | 'creem' | 'unknown';
  count: number;
  unique_users: number;
  revenue_usd: number;
  plan_breakdown: { plan_id: string; count: number; revenue_usd: number }[];
}

interface DailySubscriptionBreakdown {
  date: string;
  paypal_count: number;
  creem_count: number;
  total_count: number;
  paypal_revenue: number;
  creem_revenue: number;
  total_revenue: number;
}

interface DailyFunnelRow {
  date: string;
  video_generation: Record<string, number>;
  subscription: Record<string, number>;
  real_subscriptions: number;
  total: number;
}

interface EventsData {
  range: { startDate: string; endDate: string };
  summary: {
    total_events: number;
    unique_users: number;
    unique_sessions: number;
  };
  funnels: FunnelStats[];
  daily: Array<{ date: string } & Record<string, number>>;
  payment_method_breakdown: PaymentMethodStat[];
  daily_subscription_breakdown: DailySubscriptionBreakdown[];
  daily_funnel_tables: DailyFunnelRow[];
  real_subscription_count: number;
  real_subscription_revenue: number;
}

interface EventsPageProps {
  locale: Locale;
}

// 日期格式化
function formatDate(dateStr: string, locale: Locale) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  if (locale === 'zh') {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// 漏斗图标映射
function getStepIcon(eventName: string) {
  if (eventName.includes('home')) return <Video className="h-4 w-4" />;
  if (eventName.includes('analyze') || eventName.includes('subscribe_click')) return <MousePointer className="h-4 w-4" />;
  if (eventName.includes('success')) return <TrendingUp className="h-4 w-4" />;
  if (eventName.includes('download')) return <Download className="h-4 w-4" />;
  if (eventName.includes('pricing')) return <DollarSign className="h-4 w-4" />;
  return <Activity className="h-4 w-4" />;
}

// 漏斗颜色（从高到低渐变）
function getStepColor(step: number, total: number) {
  const ratio = total > 1 ? step / total : 0;
  if (ratio <= 0.25) return { bg: 'bg-blue-500', text: 'text-blue-600', light: 'bg-blue-50', border: 'border-blue-200' };
  if (ratio <= 0.5) return { bg: 'bg-violet-500', text: 'text-violet-600', light: 'bg-violet-50', border: 'border-violet-200' };
  if (ratio <= 0.75) return { bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-50', border: 'border-amber-200' };
  return { bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200' };
}

export function EventsPage({ locale }: EventsPageProps) {
  const { accessToken } = useAuth();
  const [data, setData] = useState<EventsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const fetchData = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const url = `/api/admin/events?startDate=${startDate}&endDate=${endDate}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
  }, [accessToken, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  // 快速日期选择
  const setQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  // 获取漏斗数据
  const videoFunnel = data?.funnels.find(f => f.funnel_id === 'video_generation');
  const subscribeFunnel = data?.funnels.find(f => f.funnel_id === 'subscription');

  // 趋势图数据
  const daily = data?.daily || [];
  const hasDailyData = daily.length > 0;

  // 趋势图最大值
  const trendMax = Math.max(
    1,
    ...daily.flatMap(d => [
      d.page_view_home || 0,
      d.click_analyze || 0,
      d.analyze_success || 0,
      d.clip_download || 0,
      d.page_view_pricing || 0,
      d.click_subscribe || 0,
      d.subscribe_success || 0,
    ])
  );

  // 支付方式数据
  const paymentBreakdown = data?.payment_method_breakdown || [];
  const paypalStat = paymentBreakdown.find(p => p.payment_method === 'paypal');
  const creemStat = paymentBreakdown.find(p => p.payment_method === 'creem');

  // 每日订阅细分
  const dailySubBreakdown = data?.daily_subscription_breakdown || [];

  // 每日漏斗数据列表
  const dailyFunnelTables = data?.daily_funnel_tables || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            {t('行为数据', 'Behavior Analytics')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('用户核心行为漏斗分析（真实数据）', 'Core user behavior funnel analysis (real data)')}
          </p>
        </div>

        {/* 日期筛选 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={startDate === new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10) ? 'default' : 'outline'}
              onClick={() => setQuickRange(7)}
            >
              {t('7天', '7d')}
            </Button>
            <Button
              size="sm"
              variant={startDate === new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10) ? 'default' : 'outline'}
              onClick={() => setQuickRange(30)}
            >
              {t('30天', '30d')}
            </Button>
            <Button
              size="sm"
              variant={startDate === new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10) ? 'default' : 'outline'}
              onClick={() => setQuickRange(90)}
            >
              {t('90天', '90d')}
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 px-2 text-sm border rounded-md bg-background"
            />
            <span className="text-muted-foreground">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 px-2 text-sm border rounded-md bg-background"
            />
          </div>
        </div>
      </div>

      {/* 总览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('总事件数', 'Total Events')}</p>
                <p className="text-2xl font-bold mt-1">{data?.summary.total_events || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                <Activity className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('独立用户', 'Unique Users')}</p>
                <p className="text-2xl font-bold mt-1">{data?.summary.unique_users || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-violet-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-violet-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('真实付费数', 'Real Subscriptions')}</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600">{data?.real_subscription_count || 0}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t('来自 credit_transactions 表', 'from credit_transactions')}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('真实付费收入', 'Real Revenue')}</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600">
                  ${data?.real_subscription_revenue?.toFixed(2) || '0.00'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">USD</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <div className="inline-flex items-center gap-2">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              {t('加载中...', 'Loading...')}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-200">
          <CardContent className="p-6 text-red-600">
            {t('加载失败:', 'Failed to load:')} {error}
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && (
        <>
          {/* 真实付费方式细分卡片 */}
          <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-blue-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="h-5 w-5 text-emerald-600" />
                {t('真实付费方式细分（PayPal / Creem）', 'Real Payment Method Breakdown')}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('数据来源：credit_transactions 表（后端 applyPlanPurchase 写入，最可靠）',
                   'Source: credit_transactions table (written by backend applyPlanPurchase, most reliable)')}
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {/* PayPal */}
                <PaymentMethodCard
                  method="paypal"
                  stat={paypalStat}
                  locale={locale}
                />
                {/* Creem */}
                <PaymentMethodCard
                  method="creem"
                  stat={creemStat}
                  locale={locale}
                />
              </div>

              {/* 每日订阅细分表 */}
              {dailySubBreakdown.length > 0 ? (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {t('每日付费方式细分', 'Daily Payment Method Breakdown')}
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2.5 font-medium">{t('日期', 'Date')}</th>
                          <th className="text-right p-2.5 font-medium text-blue-600">PayPal</th>
                          <th className="text-right p-2.5 font-medium text-violet-600">Creem</th>
                          <th className="text-right p-2.5 font-semibold">{t('合计', 'Total')}</th>
                          <th className="text-right p-2.5 font-medium text-blue-600">PayPal $</th>
                          <th className="text-right p-2.5 font-medium text-violet-600">Creem $</th>
                          <th className="text-right p-2.5 font-semibold text-emerald-600">{t('收入 $', 'Revenue $')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...dailySubBreakdown].reverse().map(row => (
                          <tr key={row.date} className="border-t border-border/50 hover:bg-muted/30">
                            <td className="p-2.5 font-mono">{row.date}</td>
                            <td className="text-right p-2.5">{row.paypal_count}</td>
                            <td className="text-right p-2.5">{row.creem_count}</td>
                            <td className="text-right p-2.5 font-semibold">{row.total_count}</td>
                            <td className="text-right p-2.5">${row.paypal_revenue.toFixed(2)}</td>
                            <td className="text-right p-2.5">${row.creem_revenue.toFixed(2)}</td>
                            <td className="text-right p-2.5 font-semibold text-emerald-600">${row.total_revenue.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/30 border-t-2 border-border">
                        <tr>
                          <td className="p-2.5 font-semibold">{t('合计', 'Total')}</td>
                          <td className="text-right p-2.5 font-semibold text-blue-600">
                            {dailySubBreakdown.reduce((s, r) => s + r.paypal_count, 0)}
                          </td>
                          <td className="text-right p-2.5 font-semibold text-violet-600">
                            {dailySubBreakdown.reduce((s, r) => s + r.creem_count, 0)}
                          </td>
                          <td className="text-right p-2.5 font-bold">
                            {dailySubBreakdown.reduce((s, r) => s + r.total_count, 0)}
                          </td>
                          <td className="text-right p-2.5 font-semibold text-blue-600">
                            ${dailySubBreakdown.reduce((s, r) => s + r.paypal_revenue, 0).toFixed(2)}
                          </td>
                          <td className="text-right p-2.5 font-semibold text-violet-600">
                            ${dailySubBreakdown.reduce((s, r) => s + r.creem_revenue, 0).toFixed(2)}
                          </td>
                          <td className="text-right p-2.5 font-bold text-emerald-600">
                            ${dailySubBreakdown.reduce((s, r) => s + r.total_revenue, 0).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-center py-8 text-muted-foreground text-sm">
                  {t('所选时间范围内暂无真实付费记录', 'No real subscription records in the selected range')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 漏斗 1: AI 生成短视频 */}
          {videoFunnel && (
            <FunnelCard
              title={t('漏斗一：AI 生成高光时刻短视频', 'Funnel 1: AI Highlight Video Generation')}
              subtitle={t('用户 → 首页 → 点击 Analyze → AI 生成成功 → 下载短视频',
                          'User → Home → Click Analyze → Generation Success → Download Clip')}
              funnel={videoFunnel}
              locale={locale}
            />
          )}

          {/* 漏斗 2: 付费订阅 */}
          {subscribeFunnel && (
            <FunnelCard
              title={t('漏斗二：付费订阅（真实付费数据）', 'Funnel 2: Subscription (Real Payment Data)')}
              subtitle={t('用户 → 价格页 → 点击付费按钮 → 付费成功（来自 credit_transactions 真实数据）',
                          'User → Pricing → Click Subscribe → Subscribe Success (real data from credit_transactions)')}
              funnel={subscribeFunnel}
              locale={locale}
            />
          )}

          {/* 每日趋势图 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                {t('每日趋势', 'Daily Trend')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasDailyData ? (
                <DailyTrendChart daily={daily} locale={locale} max={trendMax} />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  {t('暂无趋势数据', 'No trend data')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 每日漏斗数据列表 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="h-5 w-5" />
                {t('每日漏斗数据列表', 'Daily Funnel Data Table')}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('按日期维度展示两个核心漏斗的步骤计数（订阅漏斗的"付费成功"为真实数据）',
                   'Daily step counts for both funnels (subscription "Subscribe Success" is real data)')}
              </p>
            </CardHeader>
            <CardContent>
              {dailyFunnelTables.length > 0 ? (
                <DailyFunnelTable
                  rows={dailyFunnelTables}
                  locale={locale}
                />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  {t('暂无数据', 'No data')}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ── 支付方式卡片 ───────────────────────────────────────────────────────────

interface PaymentMethodCardProps {
  method: 'paypal' | 'creem';
  stat?: PaymentMethodStat;
  locale: Locale;
}

function PaymentMethodCard({ method, stat, locale }: PaymentMethodCardProps) {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const isPaypal = method === 'paypal';
  const displayName = isPaypal ? 'PayPal' : 'Creem';
  const Icon = isPaypal ? Wallet : CreditCard;
  const colorClasses = isPaypal
    ? { bg: 'from-blue-500 to-blue-700', text: 'text-blue-600', light: 'bg-blue-50', border: 'border-blue-200' }
    : { bg: 'from-violet-500 to-indigo-600', text: 'text-violet-600', light: 'bg-violet-50', border: 'border-violet-200' };

  const count = stat?.count || 0;
  const uniqueUsers = stat?.unique_users || 0;
  const revenue = stat?.revenue_usd || 0;
  const planBreakdown = stat?.plan_breakdown || [];

  return (
    <div className={`rounded-xl border ${colorClasses.border} ${colorClasses.light} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${colorClasses.bg} flex items-center justify-center shadow-md`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-base">{displayName}</p>
            <p className="text-xs text-muted-foreground">
              {t(`${displayName} 真实付费统计`, `${displayName} real subscription stats`)}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={`${colorClasses.text} ${colorClasses.border}`}>
          {t('真实', 'Real')}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className="text-xs text-muted-foreground">{t('订单数', 'Orders')}</p>
          <p className={`text-xl font-bold ${colorClasses.text}`}>{count}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('独立用户', 'Users')}</p>
          <p className={`text-xl font-bold ${colorClasses.text}`}>{uniqueUsers}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('收入', 'Revenue')}</p>
          <p className={`text-xl font-bold ${colorClasses.text}`}>${revenue.toFixed(2)}</p>
        </div>
      </div>

      {/* 套餐细分 */}
      {planBreakdown.length > 0 && (
        <div className="bg-white/60 rounded-lg p-3 space-y-1.5">
          <p className="text-[11px] text-muted-foreground font-medium">{t('套餐细分', 'Plan Breakdown')}</p>
          {planBreakdown.map(plan => (
            <div key={plan.plan_id} className="flex items-center justify-between text-xs">
              <span className="font-mono uppercase">{plan.plan_id}</span>
              <span className="flex gap-3">
                <span>{plan.count} {t('单', 'orders')}</span>
                <span className="font-semibold">${plan.revenue_usd.toFixed(2)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 漏斗卡片组件 ─────────────────────────────────────────────────────────────

interface FunnelCardProps {
  title: string;
  subtitle: string;
  funnel: FunnelStats;
  locale: Locale;
}

function FunnelCard({ title, subtitle, funnel, locale }: FunnelCardProps) {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const steps = funnel.steps;
  const maxCount = Math.max(1, ...steps.map(s => s.count));
  const firstCount = steps[0]?.count || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, i) => {
          const color = getStepColor(i + 1, steps.length);
          const widthPercent = Math.max(5, (step.count / maxCount) * 100);
          const prevStep = i > 0 ? steps[i - 1] : null;

          return (
            <div key={step.step} className={`rounded-xl border ${color.border} ${color.light} p-4`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`h-9 w-9 rounded-full ${color.bg} text-white flex items-center justify-center`}>
                    {getStepIcon(step.event)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{step.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('步骤', 'Step')} {step.step} · {step.event}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${color.text}`}>{step.count}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('用户', 'users')}: {step.unique_users} · {t('会话', 'sess')}: {step.unique_sessions}
                  </p>
                </div>
              </div>

              {/* 漏斗条 */}
              <div className="relative h-7 rounded-lg bg-white/60 overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 ${color.bg} transition-all duration-500`}
                  style={{ width: `${widthPercent}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-between px-3 text-xs font-medium">
                  <span className={step.count / maxCount > 0.3 ? 'text-white' : 'text-foreground'}>
                    {t('占比', 'of total')}: {step.conversion_from_first.toFixed(1)}%
                  </span>
                  {prevStep && step.count > 0 && (
                    <span className={step.count / maxCount > 0.3 ? 'text-white' : 'text-muted-foreground'}>
                      {t('上步转化', 'from prev')}: {step.conversion_from_previous.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>

              {/* 转化率箭头 */}
              {i < steps.length - 1 && (
                <div className="flex items-center justify-center mt-2 gap-2">
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {t('下一步转化率', 'Next conversion')}:{' '}
                    <span className="font-semibold text-foreground">
                      {steps[i + 1].count > 0 && step.count > 0
                        ? ((steps[i + 1].count / step.count) * 100).toFixed(1)
                        : '0'}
                      %
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}

        {/* 总转化率 */}
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {t('总转化率', 'Overall Conversion')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {steps[steps.length - 1]?.label} / {steps[0]?.label}
              </p>
            </div>
            <p className="text-3xl font-bold text-blue-600">
              {firstCount > 0
                ? ((steps[steps.length - 1]?.count || 0) / firstCount * 100).toFixed(1)
                : '0'}
              <span className="text-lg">%</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── 每日趋势图组件 ───────────────────────────────────────────────────────────

interface DailyTrendProps {
  daily: Array<{ date: string } & Record<string, number>>;
  locale: Locale;
  max: number;
}

function DailyTrendChart({ daily, locale, max }: DailyTrendProps) {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  const metrics = [
    { key: 'page_view_home', color: 'bg-blue-500', label: t('首页访问', 'Home View'), group: 'video' },
    { key: 'click_analyze', color: 'bg-violet-500', label: t('点击 Analyze', 'Click Analyze'), group: 'video' },
    { key: 'analyze_success', color: 'bg-amber-500', label: t('生成成功', 'Gen Success'), group: 'video' },
    { key: 'clip_download', color: 'bg-emerald-500', label: t('下载短视频', 'Download'), group: 'video' },
    { key: 'page_view_pricing', color: 'bg-pink-500', label: t('价格页访问', 'Pricing View'), group: 'sub' },
    { key: 'click_subscribe', color: 'bg-orange-500', label: t('点击付费', 'Click Sub'), group: 'sub' },
    { key: 'subscribe_success', color: 'bg-red-500', label: t('付费成功', 'Sub Success'), group: 'sub' },
  ];

  const display = daily.slice(-30);

  return (
    <div className="space-y-4">
      {/* 图例 */}
      <div className="flex flex-wrap gap-3">
        {metrics.map(m => (
          <div key={m.key} className="flex items-center gap-1.5">
            <div className={`h-3 w-3 rounded-sm ${m.color}`} />
            <span className="text-xs text-muted-foreground">{m.label}</span>
          </div>
        ))}
      </div>

      {/* 柱状图 */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="flex items-end gap-1 h-48 border-b border-border relative">
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {[0, 0.25, 0.5, 0.75, 1].map(r => (
                <div key={r} className="border-t border-border/30 flex items-center">
                  <span className="text-[10px] text-muted-foreground -mt-2 ml-1">
                    {Math.round(max * (1 - r))}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex-1 flex items-end gap-0.5 pl-8">
              {display.map((day, idx) => {
                const total = metrics.reduce((sum, m) => sum + (day[m.key] || 0), 0);
                if (total === 0) return <div key={idx} className="flex-1" style={{ height: '1px' }} />;

                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col-reverse rounded-t-sm overflow-hidden"
                    style={{ height: `${(total / max) * 100}%` }}
                    title={`${day.date}: ${total} events`}
                  >
                    {metrics.map(m => {
                      const v = day[m.key] || 0;
                      if (v === 0) return null;
                      const h = (v / total) * 100;
                      return (
                        <div
                          key={m.key}
                          className={`${m.color} transition-all`}
                          style={{ height: `${h}%` }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-0.5 pl-8 mt-1">
            {display.map((day, idx) => {
              if (idx % 5 !== 0 && idx !== display.length - 1) {
                return <div key={idx} className="flex-1" />;
              }
              return (
                <div key={idx} className="flex-1 text-center">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {formatDate(day.date, locale)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 每日漏斗数据表格 ───────────────────────────────────────────────────────

interface DailyFunnelTableProps {
  rows: DailyFunnelRow[];
  locale: Locale;
}

function DailyFunnelTable({ rows, locale }: DailyFunnelTableProps) {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  const videoSteps = [
    { key: 'page_view_home', label: t('访问首页', 'Home View') },
    { key: 'click_analyze', label: t('点击 Analyze', 'Click Analyze') },
    { key: 'analyze_success', label: t('生成成功', 'Gen Success') },
    { key: 'clip_download', label: t('下载短视频', 'Download') },
  ];

  const subSteps = [
    { key: 'page_view_pricing', label: t('价格页', 'Pricing View') },
    { key: 'click_subscribe', label: t('点击付费', 'Click Sub') },
    { key: 'subscribe_success', label: t('付费成功(真实)', 'Sub Success(real)') },
  ];

  // 倒序展示（最新在前）
  const display = [...rows].reverse();

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th rowSpan={2} className="text-left p-2.5 font-medium align-bottom">
              {t('日期', 'Date')}
            </th>
            <th colSpan={4} className="text-center p-2 font-medium border-l border-border bg-blue-50/50">
              {t('漏斗一：AI 生成短视频', 'Funnel 1: Video Generation')}
            </th>
            <th colSpan={3} className="text-center p-2 font-medium border-l border-border bg-violet-50/50">
              {t('漏斗二：付费订阅', 'Funnel 2: Subscription')}
            </th>
            <th rowSpan={2} className="text-right p-2.5 font-medium align-bottom border-l border-border">
              {t('合计', 'Total')}
            </th>
          </tr>
          <tr className="border-t border-border">
            {videoSteps.map(s => (
              <th key={s.key} className="text-right p-2 whitespace-nowrap border-l border-border text-blue-700">
                {s.label}
              </th>
            ))}
            {subSteps.map(s => (
              <th key={s.key} className="text-right p-2 whitespace-nowrap border-l border-border text-violet-700">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {display.map(row => (
            <tr key={row.date} className="border-t border-border/50 hover:bg-muted/30">
              <td className="p-2.5 font-mono">{row.date}</td>
              {videoSteps.map(s => (
                <td key={s.key} className="text-right p-2 border-l border-border/30">
                  {row.video_generation[s.key] || 0}
                </td>
              ))}
              {subSteps.map(s => (
                <td key={s.key} className={`text-right p-2 border-l border-border/30 ${
                  s.key === 'subscribe_success' && (row.real_subscriptions > 0) ? 'font-semibold text-emerald-600' : ''
                }`}>
                  {row.subscription[s.key] || 0}
                </td>
              ))}
              <td className="text-right p-2.5 font-semibold border-l border-border">{row.total}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/30 border-t-2 border-border">
          <tr>
            <td className="p-2.5 font-semibold">{t('合计', 'Total')}</td>
            {videoSteps.map(s => {
              const sum = rows.reduce((acc, r) => acc + (r.video_generation[s.key] || 0), 0);
              return (
                <td key={s.key} className="text-right p-2.5 font-semibold text-blue-700 border-l border-border/30">
                  {sum}
                </td>
              );
            })}
            {subSteps.map(s => {
              const sum = rows.reduce((acc, r) => acc + (r.subscription[s.key] || 0), 0);
              return (
                <td key={s.key} className={`text-right p-2.5 font-semibold border-l border-border/30 ${
                  s.key === 'subscribe_success' ? 'text-emerald-600' : 'text-violet-700'
                }`}>
                  {sum}
                </td>
              );
            })}
            <td className="text-right p-2.5 font-bold border-l border-border">
              {rows.reduce((s, r) => s + r.total, 0)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
