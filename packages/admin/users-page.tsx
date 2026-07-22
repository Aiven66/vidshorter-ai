'use client';

/**
 * Users page — paginated user list, search, detail modal, role toggle, delete.
 * Fetches from /api/admin/users and /api/admin/users/[id].
 * No shadcn/ui: native elements + Tailwind only.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  Search,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import type { Locale } from './admin-layout';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  creditsBalance: number;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  videosProcessed: number;
  recentTransactions: Array<{
    id: string;
    amount: number;
    type: string;
    description: string;
    createdAt: string;
  }>;
}

export interface UsersPageProps {
  token: string;
  locale?: Locale;
  endpoint?: string;
}

export function UsersPage({ token, locale = 'en', endpoint = '/api/admin/users' }: UsersPageProps) {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = useCallback(
    async (pageNum: number, searchTerm?: string) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(pageNum), limit: '10' });
        if (searchTerm) params.set('search', searchTerm);
        const res = await fetch(`${endpoint}?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
          setTotalPages(data.totalPages || Math.ceil((data.total || 0) / 10) || 1);
          setPage(pageNum);
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Failed (${res.status})`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        setLoading(false);
      }
    },
    [token, endpoint],
  );

  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  const fetchDetail = useCallback(
    async (userId: string) => {
      if (!token || !userId) return;
      setDetailLoading(true);
      setDetailError(null);
      setDetail(null);
      try {
        const res = await fetch(`${endpoint}/${encodeURIComponent(userId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (res.ok) {
          setDetail(await res.json());
        } else {
          const data = await res.json().catch(() => ({}));
          setDetailError(data.error || `Failed (${res.status})`);
        }
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : 'Network error');
      } finally {
        setDetailLoading(false);
      }
    },
    [token, endpoint],
  );

  const toggleRole = async (user: UserRow) => {
    if (!token) return;
    setActionLoading(true);
    try {
      const newRole = user.role === 'admin' ? 'user' : 'admin';
      const res = await fetch(`${endpoint}/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u)));
        if (detail?.id === user.id) setDetail({ ...detail, role: newRole });
      }
    } catch {
      // silent
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !confirmDelete) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${endpoint}/${encodeURIComponent(confirmDelete.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== confirmDelete.id));
        setConfirmDelete(null);
      }
    } catch {
      // silent
    } finally {
      setActionLoading(false);
    }
  };

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

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    fetchUsers(1, searchInput);
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('用户管理', 'User Management')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('查看和管理平台所有用户', 'View and manage all platform users')}</p>
      </div>

      {/* Search */}
      <form onSubmit={onSearchSubmit} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('搜索邮箱或用户名', 'Search email or name')}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background"
          />
        </div>
        <button type="submit" className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90">
          {t('搜索', 'Search')}
        </button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setSearch('');
              fetchUsers(1);
            }}
            className="px-3 py-2 text-sm border border-border rounded-lg"
          >
            {t('清除', 'Clear')}
          </button>
        )}
      </form>

      {error && <div className="p-3 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 rounded-lg text-sm">{error}</div>}

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left p-3 font-medium">{t('邮箱', 'Email')}</th>
                <th className="text-left p-3 font-medium">{t('用户名', 'Name')}</th>
                <th className="text-left p-3 font-medium">{t('角色', 'Role')}</th>
                <th className="text-left p-3 font-medium">{t('注册时间', 'Joined')}</th>
                <th className="text-right p-3 font-medium">{t('操作', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-muted-foreground">
                    {t('暂无用户', 'No users found')}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{user.email}</span>
                      </div>
                    </td>
                    <td className="p-3">{user.name || '-'}</td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${user.role === 'admin' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' : 'bg-muted text-muted-foreground'}`}>
                        {user.role === 'admin' ? t('管理员', 'Admin') : t('用户', 'User')}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(user.createdAt)}
                      </div>
                    </td>
                    <td className="p-3 text-right space-x-1.5">
                      <button
                        onClick={() => fetchDetail(user.id)}
                        className="px-2.5 py-1 text-xs border border-border rounded-md hover:bg-muted"
                      >
                        {t('详情', 'Detail')}
                      </button>
                      <button
                        onClick={() => toggleRole(user)}
                        disabled={actionLoading}
                        className="px-2.5 py-1 text-xs border border-border rounded-md hover:bg-muted disabled:opacity-50"
                      >
                        {user.role === 'admin' ? t('降为用户', 'Demote') : t('升为管理员', 'Promote')}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(user)}
                        className="px-2.5 py-1 text-xs border border-red-300 text-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {t('第', 'Page')} {page} / {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => fetchUsers(page - 1, search)}
                className="p-1.5 border border-border rounded-md disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => fetchUsers(page + 1, search)}
                className="p-1.5 border border-border rounded-md disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setDetail(null)}>
          <div
            className="bg-background border border-border rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <UserIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-semibold">{detail.name || detail.email}</div>
                  <div className="text-xs text-muted-foreground">{detail.email}</div>
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="p-1 hover:bg-muted rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : detailError ? (
              <div className="p-4 text-red-600 text-sm">{detailError}</div>
            ) : (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">{t('角色', 'Role')}</div>
                    <div className="font-medium">{detail.role === 'admin' ? t('管理员', 'Admin') : t('用户', 'User')}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">{t('状态', 'Status')}</div>
                    <div className="font-medium">{detail.isActive ? t('活跃', 'Active') : t('禁用', 'Disabled')}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">{t('积分余额', 'Credits')}</div>
                    <div className="font-medium">{detail.creditsBalance.toLocaleString()}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">{t('订阅计划', 'Subscription')}</div>
                    <div className="font-medium">{detail.subscriptionPlan || t('免费', 'Free')}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">{t('视频处理数', 'Videos Processed')}</div>
                    <div className="font-medium">{detail.videosProcessed.toLocaleString()}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">{t('注册时间', 'Joined')}</div>
                    <div className="font-medium">{formatDate(detail.createdAt)}</div>
                  </div>
                </div>

                {detail.recentTransactions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">{t('最近交易', 'Recent Transactions')}</h3>
                    <div className="space-y-1.5">
                      {detail.recentTransactions.map((tx) => (
                        <div key={tx.id} className="flex justify-between items-center p-2 bg-muted/30 rounded text-xs">
                          <span className="truncate">{tx.description || tx.type}</span>
                          <span className={tx.amount >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                            {tx.amount >= 0 ? '+' : ''}{tx.amount}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setConfirmDelete(null)}>
          <div className="bg-background border border-border rounded-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">{t('确认删除', 'Confirm Delete')}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('确定要删除用户', 'Are you sure you want to delete user')} <strong>{confirmDelete.email}</strong>?
              {t('此操作不可撤销。', ' This action cannot be undone.')}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-sm border border-border rounded-lg">
                {t('取消', 'Cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {t('删除', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
