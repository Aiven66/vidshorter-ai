'use client';

/**
 * @clipop/feedback - AdminFeedbackManager
 *
 * Admin-only UI for reviewing user feedback. Renders a filterable, sortable
 * table with status switching and row expansion. Uses native elements +
 * Tailwind only (no shadcn/ui dependency).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Star,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAppConfig } from '../core';
import type { Feedback } from '../core';
import {
  listFeedback,
  updateFeedbackStatus,
  type FeedbackStatus,
} from './client';
import { getFeedbackI18n, type FeedbackLocale } from './i18n';

type StatusFilter = 'all' | FeedbackStatus;
type RatingFilter = 'all' | 1 | 2 | 3 | 4 | 5;
type SortOrder = 'newest' | 'oldest';

/** Admin-only i18n strings. Kept separate from the user-facing DEFAULT_I18N. */
const ADMIN_I18N = {
  en: {
    title: 'Feedback Management',
    refresh: 'Refresh',
    loading: 'Loading...',
    empty: 'No feedback found.',
    error: 'Failed to load feedback.',
    anonymous: 'Anonymous',
    filterStatus: 'Status',
    filterRating: 'Rating',
    sort: 'Sort',
    all: 'All',
    newest: 'Newest first',
    oldest: 'Oldest first',
    statusNew: 'New',
    statusRead: 'Read',
    statusResolved: 'Resolved',
    noRating: 'No rating',
    column: {
      user: 'User',
      content: 'Content',
      rating: 'Rating',
      status: 'Status',
      createdAt: 'Created',
      actions: 'Actions',
    },
  },
  zh: {
    title: '反馈管理',
    refresh: '刷新',
    loading: '加载中...',
    empty: '暂无反馈。',
    error: '加载反馈失败。',
    anonymous: '匿名用户',
    filterStatus: '状态',
    filterRating: '评分',
    sort: '排序',
    all: '全部',
    newest: '最新优先',
    oldest: '最早优先',
    statusNew: '新',
    statusRead: '已读',
    statusResolved: '已解决',
    noRating: '未评分',
    column: {
      user: '用户',
      content: '内容',
      rating: '评分',
      status: '状态',
      createdAt: '创建时间',
      actions: '操作',
    },
  },
} as const;

type AdminI18n = typeof ADMIN_I18N.en;

function getAdminI18n(locale?: string): AdminI18n {
  if (locale && locale in ADMIN_I18N) {
    return ADMIN_I18N[locale as keyof typeof ADMIN_I18N];
  }
  return ADMIN_I18N.en;
}

/** Universal status badge colors (semantic, not brand). */
const STATUS_BADGE_CLS: Record<FeedbackStatus, string> = {
  new: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  read: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  resolved: 'bg-green-500/15 text-green-700 dark:text-green-300',
};

function statusLabel(t: AdminI18n, status: FeedbackStatus): string {
  if (status === 'new') return t.statusNew;
  if (status === 'read') return t.statusRead;
  return t.statusResolved;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

export interface AdminFeedbackManagerProps {
  /** Admin bearer token (must have admin role on the server). */
  token: string;
  /** Locale selector for the default dictionary. */
  locale?: FeedbackLocale;
  /** Extra classes for the root container. */
  className?: string;
}

export function AdminFeedbackManager({
  token,
  locale,
  className,
}: AdminFeedbackManagerProps) {
  const config = useAppConfig();
  const t = getAdminI18n(locale || config.defaultLocale);

  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listFeedback(config, token);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(() => {
    let arr = items.slice();
    if (statusFilter !== 'all') {
      arr = arr.filter((f) => f.status === statusFilter);
    }
    if (ratingFilter !== 'all') {
      const target = ratingFilter as number;
      arr = arr.filter((f) => (f.rating ?? 0) === target);
    }
    arr.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? tb - ta : ta - tb;
    });
    return arr;
  }, [items, statusFilter, ratingFilter, sortOrder]);

  const handleStatusChange = async (id: string, status: FeedbackStatus) => {
    setUpdatingId(id);
    const prevItems = items;
    // Optimistic update.
    setItems((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
    try {
      await updateFeedbackStatus(config, id, status, token);
    } catch (e) {
      setItems(prevItems);
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setUpdatingId(null);
    }
  };

  const selectCls =
    'rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className={`flex flex-col gap-4 ${className ? className : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">{t.title}</h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {t.refresh}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          {t.filterStatus}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={selectCls}
          >
            <option value="all">{t.all}</option>
            <option value="new">{t.statusNew}</option>
            <option value="read">{t.statusRead}</option>
            <option value="resolved">{t.statusResolved}</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-foreground">
          {t.filterRating}
          <select
            value={ratingFilter === 'all' ? 'all' : String(ratingFilter)}
            onChange={(e) =>
              setRatingFilter(
                e.target.value === 'all'
                  ? 'all'
                  : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5),
              )
            }
            className={selectCls}
          >
            <option value="all">{t.all}</option>
            {[1, 2, 3, 4, 5].map((r) => (
              <option key={r} value={r}>
                {r} ★
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-foreground">
          {t.sort}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className={selectCls}
          >
            <option value="newest">{t.newest}</option>
            <option value="oldest">{t.oldest}</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t.column.user}</th>
              <th className="px-3 py-2 text-left font-medium">{t.column.content}</th>
              <th className="px-3 py-2 text-left font-medium">{t.column.rating}</th>
              <th className="px-3 py-2 text-left font-medium">{t.column.status}</th>
              <th className="px-3 py-2 text-left font-medium">{t.column.createdAt}</th>
              <th className="px-3 py-2 text-left font-medium">{t.column.actions}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  <span className="mt-2 block">{t.loading}</span>
                </td>
              </tr>
            )}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  {t.empty}
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((f) => {
                const expanded = expandedId === f.id;
                const userLabel =
                  f.userName || f.userEmail || t.anonymous;
                return (
                  <tr
                    key={f.id}
                    className="border-t border-border align-top hover:bg-muted/50"
                  >
                    <td className="px-3 py-2 text-foreground">
                      <div className="font-medium">{userLabel}</div>
                      {f.userName && f.userEmail && (
                        <div className="text-xs text-muted-foreground">
                          {f.userEmail}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : f.id)}
                        className="inline-flex items-start gap-1 text-left"
                      >
                        {expanded ? (
                          <ChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        )}
                        <span className={expanded ? 'whitespace-pre-wrap break-words' : 'max-w-md'}>
                          {expanded ? f.content : truncate(f.content, 80)}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {f.rating ? (
                        <div className="inline-flex items-center gap-1">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          <span className="text-foreground">{f.rating}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t.noRating}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_BADGE_CLS[f.status]
                        }`}
                      >
                        {statusLabel(t, f.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDate(f.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={f.status}
                        disabled={updatingId === f.id}
                        onChange={(e) =>
                          handleStatusChange(
                            f.id,
                            e.target.value as FeedbackStatus,
                          )
                        }
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                      >
                        <option value="new">{t.statusNew}</option>
                        <option value="read">{t.statusRead}</option>
                        <option value="resolved">{t.statusResolved}</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
