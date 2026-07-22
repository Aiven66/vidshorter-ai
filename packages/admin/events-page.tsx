'use client';

/**
 * Events page — funnel cards + daily trend chart + detailed daily table.
 * Funnel definitions come from useAppConfig().funnels (no hardcoded ids).
 * Fetches from /api/admin/events.
 * No shadcn/ui: native elements + Tailwind only. Chart is hand-written CSS.
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  Activity,
  Calendar,
  ChevronDown,
  Loader2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAppConfig } from '../core/config';
import type { Locale } from './admin-layout';

interface FunnelStepStat {
  step: number;
  eventName: string;
  count: number;
  uniqueUsers: number;
  uniqueSessions: number;
  conversionFromPrevious: number;
  conversionFromFirst: number;
}

interface FunnelData {
  funnelId: string;
  steps: FunnelStepStat[];
}

interface DailyTrendPoint {
  date: string;
  counts: Record<string, number>;
  total: number;
}

interface EventsData {
  range: { startDate: string; endDate: string };
  summary: { totalEvents: number; uniqueUsers: number; uniqueSessions: number };
  funnels: FunnelData[];
  dailyTrend: DailyTrendPoint[];
}

export interface EventsPageProps {
  token: string;
  locale?: Locale;
  endpoint?: string;
}

const STEP_COLORS = [
  { bg: 'bg-blue-500', text: 'text-blue-600', light: 'bg-blue-50', border: 'border-blue-200' },
  { bg: 'bg-violet-500', text: 'text-violet-600', light: 'bg-violet-50', border: 'border-violet-200' },
  { bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-50', border: 'border-amber-200' },
  { bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200' },
  { bg: 'bg-pink-500', text: 'text-pink-600', light: 'bg-pink-50', border: 'border-pink-200' },
];

export function EventsPage({ token, locale = 'en', endpoint = '/api/admin/events' }: EventsPageProps) {
  const config = useAppConfig();
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  const [data, setData] = useState<EventsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      let start: string;
      let end: string;
      if (customStart && customEnd) {
        start = customStart;
        end = customEnd;
      } else {
        end = new Date().toISOString().slice(0, 10);
        start = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
      }
      const res = await fetch(`${endpoint}?startDate=${start}&endDate=${end}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        setData(await res.json());
      } else {
        const e = await res.json().catch(() => ({}));
        setError(e.error || `Failed (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [token, endpoint, days, customStart, customEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    if (locale === 'zh') return `${d.getMonth() + 1}月${d.getDate()}日`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const quickRanges = [7, 30, 90];

  // Collect all event names across the trend for the chart legend.
  const allEventNames = new Set<string>();
  for (const point of data?.dailyTrend || []) {
    for (const key of Object.keys(point.counts)) allEventNames.add(key);
  }
  const eventNames = Array.from(allEventNames);
  const trendMax = Math.max(1, ...(data?.dailyTrend || []).map((d) => d.total));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            {t('行为数据', 'Behavior Analytics')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('用户核心行为漏斗分析', 'Core user behavior funnel analysis')}</p>
        </div>

        {/* Date range */}
        <div className="flex flex-wrap items-center gap-2">
          {quickRanges.map((d) => (
            <button
              key={d}
              onClick={() => { setDays(d); setCustomStart(''); setCustomEnd(''); }}
              className={`px-3 py-1.5 text-sm rounded-lg border ${days === d && !customStart ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
            >
              {d}{t('天', 'd')}
            </button>
          ))}
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="h-9 px-2 text-sm border border-border rounded-lg bg-background"
          />
          <span className="text-muted-foreground">—</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="h-9 px-2 text-sm border border-border rounded-lg bg-background"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <SummaryCard
          icon={<Activity className="w-5 h-5" />}
          color="text-blue-600 bg-blue-50"
          label={t('总事件数', 'Total Events')}
          value={(data?.summary.totalEvents ?? 0).toLocaleString()}
        />
        <SummaryCard
          icon={<Users className="w-5 h-5" />}
          color="text-violet-600 bg-violet-50"
          label={t('独立用户', 'Unique Users')}
          value={(data?.summary.uniqueUsers ?? 0).toLocaleString()}
        />
        <SummaryCard
          icon={<Activity className="w-5 h-5" />}
          color="text-emerald-600 bg-emerald-50"
          label={t('独立会话', 'Unique Sessions')}
          value={(data?.summary.uniqueSessions ?? 0).toLocaleString()}
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          {t('加载中...', 'Loading...')}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 rounded-lg text-sm">
          {t('加载失败:', 'Failed:')} {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Funnel cards */}
          {data.funnels.length === 0 ? (
            <div className="border border-border rounded-xl p-8 text-center text-muted-foreground">
              {t('未配置漏斗。请在 config.funnels 中定义漏斗。', 'No funnels configured. Define funnels in config.funnels.')}
            </div>
          ) : (
            data.funnels.map((funnel) => {
              const def = (config.funnels || []).find((f) => f.id === funnel.funnelId);
              return (
                <FunnelCard
                  key={funnel.funnelId}
                  title={def?.name || funnel.funnelId}
                  funnel={funnel}
                  locale={locale}
                />
              );
            })
          )}

          {/* Daily trend chart */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5" />
              <h2 className="font-semibold">{t('每日趋势', 'Daily Trend')}</h2>
            </div>
            {data.dailyTrend.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t('暂无趋势数据', 'No trend data')}</div>
            ) : (
              <DailyTrendChart points={data.dailyTrend} eventNames={eventNames} max={trendMax} formatDate={formatDate} />
            )}
          </div>

          {/* Daily detail table */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5" />
              <h2 className="font-semibold">{t('每日数据明细', 'Daily Breakdown')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2.5 font-medium">{t('日期', 'Date')}</th>
                    {eventNames.map((ev) => (
                      <th key={ev} className="text-right p-2.5 font-medium">{ev}</th>
                    ))}
                    <th className="text-right p-2.5 font-semibold">{t('合计', 'Total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.dailyTrend].reverse().map((point) => (
                    <tr key={point.date} className="border-t border-border/50 hover:bg-muted/30">
                      <td className="p-2.5 font-mono">{point.date}</td>
                      {eventNames.map((ev) => (
                        <td key={ev} className="text-right p-2.5">{point.counts[ev] || 0}</td>
                      ))}
                      <td className="text-right p-2.5 font-semibold">{point.total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t-2 border-border">
                  <tr>
                    <td className="p-2.5 font-semibold">{t('合计', 'Total')}</td>
                    {eventNames.map((ev) => {
                      const sum = data.dailyTrend.reduce((s, d) => s + (d.counts[ev] || 0), 0);
                      return <td key={ev} className="text-right p-2.5 font-semibold">{sum}</td>;
                    })}
                    <td className="text-right p-2.5 font-bold">
                      {data.dailyTrend.reduce((s, d) => s + d.total, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon, color, label, value }: { icon: ReactNode; color: string; label: string; value: string }) {
  return (
    <div className="border border-border rounded-xl p-4 bg-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${color}`}>{icon}</div>
      </div>
    </div>
  );
}

function FunnelCard({
  title,
  funnel,
  locale,
}: {
  title: string;
  funnel: FunnelData;
  locale: Locale;
}) {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const steps = funnel.steps;
  const maxCount = Math.max(1, ...steps.map((s) => s.count));
  const firstCount = steps[0]?.count || 0;
  const lastCount = steps[steps.length - 1]?.count || 0;
  const overallConversion = firstCount > 0 ? (lastCount / firstCount) * 100 : 0;

  return (
    <div className="border border-border rounded-xl p-5 bg-card space-y-3">
      <h2 className="font-semibold text-lg">{title}</h2>

      {steps.map((step, i) => {
        const color = STEP_COLORS[i % STEP_COLORS.length];
        const widthPercent = Math.max(5, (step.count / maxCount) * 100);
        const prevStep = i > 0 ? steps[i - 1] : null;
        return (
          <div key={step.step} className={`rounded-xl border ${color.border} ${color.light} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className={`h-9 w-9 rounded-full ${color.bg} text-white flex items-center justify-center text-sm font-bold`}>
                  {step.step}
                </div>
                <div>
                  <p className="font-semibold text-sm">{step.eventName}</p>
                  <p className="text-xs text-muted-foreground">{t('步骤', 'Step')} {step.step}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${color.text}`}>{step.count}</p>
                <p className="text-xs text-muted-foreground">
                  {t('用户', 'users')}: {step.uniqueUsers} · {t('会话', 'sess')}: {step.uniqueSessions}
                </p>
              </div>
            </div>

            {/* Funnel bar */}
            <div className="relative h-7 rounded-lg bg-white/60 overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 ${color.bg} transition-all duration-500`}
                style={{ width: `${widthPercent}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-between px-3 text-xs font-medium">
                <span className={step.count / maxCount > 0.3 ? 'text-white' : 'text-foreground'}>
                  {t('占比', 'of total')}: {step.conversionFromFirst.toFixed(1)}%
                </span>
                {prevStep && step.count > 0 && (
                  <span className={step.count / maxCount > 0.3 ? 'text-white' : 'text-muted-foreground'}>
                    {t('上步转化', 'from prev')}: {step.conversionFromPrevious.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>

            {/* Conversion arrow */}
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

      {/* Overall conversion */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-950/20 dark:to-violet-950/20 border border-blue-100 dark:border-blue-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t('总转化率', 'Overall Conversion')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {steps[steps.length - 1]?.eventName} / {steps[0]?.eventName}
            </p>
          </div>
          <p className="text-3xl font-bold text-blue-600">
            {overallConversion.toFixed(1)}<span className="text-lg">%</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function DailyTrendChart({
  points,
  eventNames,
  max,
  formatDate,
}: {
  points: DailyTrendPoint[];
  eventNames: string[];
  max: number;
  formatDate: (s: string) => string;
}) {
  const palette = ['bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-pink-500', 'bg-orange-500', 'bg-red-500', 'bg-cyan-500'];
  const display = points.slice(-30);

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {eventNames.map((ev, i) => (
          <div key={ev} className="flex items-center gap-1.5">
            <div className={`h-3 w-3 rounded-sm ${palette[i % palette.length]}`} />
            <span className="text-xs text-muted-foreground">{ev}</span>
          </div>
        ))}
      </div>

      {/* Stacked bar chart */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="flex items-end gap-0.5 h-48 border-b border-border relative pl-8">
            {/* Y-axis labels */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {[0, 0.25, 0.5, 0.75, 1].map((r) => (
                <div key={r} className="flex items-center">
                  <span className="text-[10px] text-muted-foreground w-8 -mt-2">
                    {Math.round(max * (1 - r))}
                  </span>
                  <div className="flex-1 border-t border-border/20" />
                </div>
              ))}
            </div>

            {display.map((point, idx) => {
              if (point.total === 0) return <div key={idx} className="flex-1" style={{ height: '1px' }} />;
              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col-reverse rounded-t-sm overflow-hidden"
                  style={{ height: `${(point.total / max) * 100}%` }}
                  title={`${point.date}: ${point.total} events`}
                >
                  {eventNames.map((ev, i) => {
                    const v = point.counts[ev] || 0;
                    if (v === 0) return null;
                    const h = (v / point.total) * 100;
                    return (
                      <div
                        key={ev}
                        className={`${palette[i % palette.length]} transition-all`}
                        style={{ height: `${h}%` }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="flex gap-0.5 pl-8 mt-1">
            {display.map((point, idx) => {
              if (idx % 5 !== 0 && idx !== display.length - 1) {
                return <div key={idx} className="flex-1" />;
              }
              return (
                <div key={idx} className="flex-1 text-center">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {formatDate(point.date)}
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
