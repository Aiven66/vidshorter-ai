'use client';

/**
 * Payments page — revenue overview + subscriptions table + transactions table.
 * Fetches from /api/admin/payments.
 * No shadcn/ui: native elements + Tailwind only.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  DollarSign,
  Loader2,
} from 'lucide-react';
import type { Locale } from './admin-layout';

interface PaymentRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  amount: number;
  planType: string;
  description: string;
  createdAt: string;
}

interface TransactionRow {
  id: string;
  userId: string;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
}

interface PaymentsData {
  payments: PaymentRow[];
  total: number;
  totalPages: number;
  page: number;
  summary: {
    totalRevenue: number;
    monthRevenue: number;
    byPlan: Record<string, { count: number; revenue: number }>;
    byProvider: Record<string, { count: number; revenue: number }>;
  };
}

export interface PaymentsPageProps {
  token: string;
  locale?: Locale;
  endpoint?: string;
}

export function PaymentsPage({ token, locale = 'en', endpoint = '/api/admin/payments' }: PaymentsPageProps) {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  const [data, setData] = useState<PaymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Transactions (second table)
  const [txData, setTxData] = useState<{ transactions: TransactionRow[]; total: number } | null>(null);
  const [txPage, setTxPage] = useState(1);
  const [txLoading, setTxLoading] = useState(false);

  const fetchPayments = useCallback(
    async (pageNum: number) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(pageNum), limit: '10' });
        if (planFilter) params.set('planType', planFilter);
        if (statusFilter) params.set('status', statusFilter);
        const res = await fetch(`${endpoint}?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (res.ok) {
          const json = (await res.json()) as PaymentsData;
          setData(json);
          setPage(json.page || pageNum);
        } else {
          const e = await res.json().catch(() => ({}));
          setError(e.error || `Failed (${res.status})`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        setLoading(false);
      }
    },
    [token, endpoint, planFilter, statusFilter],
  );

  const fetchTransactions = useCallback(
    async (pageNum: number) => {
      if (!token) return;
      setTxLoading(true);
      try {
        const params = new URLSearchParams({ page: String(pageNum), limit: '10' });
        const res = await fetch(`${endpoint}/transactions?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (res.ok) {
          const json = await res.json();
          setTxData(json);
          setTxPage(pageNum);
        }
      } catch {
        // silent
      } finally {
        setTxLoading(false);
      }
    },
    [token, endpoint],
  );

  useEffect(() => {
    fetchPayments(1);
  }, [fetchPayments]);

  useEffect(() => {
    fetchTransactions(1);
  }, [fetchTransactions]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const summary = data?.summary;
  const planOptions = summary ? Object.keys(summary.byPlan) : [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('付费管理', 'Payment Management')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('查看所有付费记录', 'View all payment records')}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('累计收入', 'Total Revenue')}</div>
              <div className="text-2xl font-bold">${(summary?.totalRevenue ?? 0).toLocaleString()}</div>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('本月收入', 'Month Revenue')}</div>
              <div className="text-2xl font-bold">${(summary?.monthRevenue ?? 0).toLocaleString()}</div>
            </div>
            <div className="p-2 rounded-lg bg-green-50 text-green-600">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('付费总数', 'Total Payments')}</div>
              <div className="text-2xl font-bold">{data?.total.toLocaleString() ?? '0'}</div>
            </div>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 rounded-lg text-sm">{error}</div>}

      {/* Filters */}
      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{t('套餐', 'Plan')}</label>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background"
          >
            <option value="">{t('全部', 'All')}</option>
            {planOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{t('状态', 'Status')}</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background"
          >
            <option value="">{t('全部', 'All')}</option>
            <option value="active">{t('活跃', 'Active')}</option>
            <option value="cancelled">{t('已取消', 'Cancelled')}</option>
            <option value="expired">{t('已过期', 'Expired')}</option>
          </select>
        </div>
        <button
          onClick={() => fetchPayments(1)}
          className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90"
        >
          {t('应用', 'Apply')}
        </button>
      </div>

      {/* Payments table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold">{t('付费记录', 'Payment Records')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left p-3 font-medium">{t('用户', 'User')}</th>
                <th className="text-left p-3 font-medium">{t('金额', 'Amount')}</th>
                <th className="text-left p-3 font-medium">{t('套餐', 'Plan')}</th>
                <th className="text-left p-3 font-medium">{t('时间', 'Date')}</th>
                <th className="text-left p-3 font-medium">{t('描述', 'Description')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : (data?.payments || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t('暂无付费记录', 'No payments found')}
                  </td>
                </tr>
              ) : (
                (data?.payments || []).map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{p.userEmail || '-'}</div>
                      <div className="text-xs text-muted-foreground">{p.userName || ''}</div>
                    </td>
                    <td className="p-3 font-semibold">${p.amount.toLocaleString()}</td>
                    <td className="p-3">
                      <span className="inline-block px-2 py-0.5 text-xs bg-muted rounded-full">{p.planType}</span>
                    </td>
                    <td className="p-3 text-muted-foreground">{formatDate(p.createdAt)}</td>
                    <td className="p-3 text-muted-foreground text-xs">{p.description || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && (data?.totalPages ?? 0) > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border">
            <span className="text-xs text-muted-foreground">{t('第', 'Page')} {page} / {data?.totalPages}</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => fetchPayments(page - 1)} className="p-1.5 border border-border rounded-md disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button disabled={page >= (data?.totalPages ?? 1)} onClick={() => fetchPayments(page + 1)} className="p-1.5 border border-border rounded-md disabled:opacity-40">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transactions table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold">{t('积分交易记录', 'Credit Transactions')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left p-3 font-medium">{t('用户ID', 'User ID')}</th>
                <th className="text-left p-3 font-medium">{t('金额', 'Amount')}</th>
                <th className="text-left p-3 font-medium">{t('类型', 'Type')}</th>
                <th className="text-left p-3 font-medium">{t('描述', 'Description')}</th>
                <th className="text-left p-3 font-medium">{t('时间', 'Date')}</th>
              </tr>
            </thead>
            <tbody>
              {txLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : (txData?.transactions || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t('暂无交易', 'No transactions')}
                  </td>
                </tr>
              ) : (
                (txData?.transactions || []).map((tx) => (
                  <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs truncate max-w-[160px]">{tx.userId}</td>
                    <td className={`p-3 font-semibold ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount}
                    </td>
                    <td className="p-3">
                      <span className="inline-block px-2 py-0.5 text-xs bg-muted rounded-full">{tx.type}</span>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{tx.description || '-'}</td>
                    <td className="p-3 text-muted-foreground">{formatDate(tx.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
