'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, MapPin, Calendar, ArrowLeft, User } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { type Locale } from './admin-layout';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatar_url: string | null;
  location: string | null;
  google_id: string | null;
  created_at: string;
}

interface UserDetail extends User {
  credits_balance?: number;
  subscription_plan?: string;
  subscription_status?: string;
  videos_processed?: number;
}

interface UsersPageProps {
  locale: Locale;
}

export function UsersPage({ locale }: UsersPageProps) {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchUsers = useCallback(async (pageNum: number = 1) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?page=${pageNum}&limit=10`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotalPages(data.totalPages || 1);
        setPage(pageNum);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to load users (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const fetchUserDetail = useCallback(async (userId: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedUser(data);
      }
    } catch (err) {
      console.error('Failed to fetch user detail:', err);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (selectedUser) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Button
          onClick={() => setSelectedUser(null)}
          className="mb-6 flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {locale === 'zh' ? '返回用户列表' : 'Back to Users'}
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div>{selectedUser.name || selectedUser.email}</div>
                <div className="text-sm text-muted-foreground">{selectedUser.email}</div>
              </div>
            </CardTitle>
            <CardDescription>
              {locale === 'zh' ? '用户详细信息' : 'User Details'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">
                  {locale === 'zh' ? '角色' : 'Role'}
                </div>
                <Badge variant={selectedUser.role === 'admin' ? 'destructive' : 'secondary'}>
                  {selectedUser.role === 'admin' ? (locale === 'zh' ? '管理员' : 'Admin') : (locale === 'zh' ? '普通用户' : 'User')}
                </Badge>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">
                  {locale === 'zh' ? '注册时间' : 'Joined'}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {formatDate(selectedUser.created_at)}
                </div>
              </div>
              {selectedUser.location && (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">
                    {locale === 'zh' ? '地点' : 'Location'}
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {selectedUser.location}
                  </div>
                </div>
              )}
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">
                  {locale === 'zh' ? '积分余额' : 'Credits'}
                </div>
                <div className="text-xl font-semibold">
                  {selectedUser.credits_balance?.toLocaleString() || 0}
                </div>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">
                  {locale === 'zh' ? '订阅计划' : 'Subscription'}
                </div>
                <div className="font-medium">
                  {selectedUser.subscription_plan || (locale === 'zh' ? '免费' : 'Free')}
                </div>
                {selectedUser.subscription_status && (
                  <Badge className="mt-1">
                    {selectedUser.subscription_status === 'active' ? (locale === 'zh' ? '活跃' : 'Active') : (locale === 'zh' ? '已取消' : 'Cancelled')}
                  </Badge>
                )}
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">
                  {locale === 'zh' ? '处理视频数' : 'Videos Processed'}
                </div>
                <div className="text-xl font-semibold">
                  {selectedUser.videos_processed?.toLocaleString() || 0}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {locale === 'zh' ? '用户管理' : 'User Management'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {locale === 'zh' ? '查看和管理平台所有用户' : 'View and manage all platform users'}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <Card>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">
                    {locale === 'zh' ? '邮箱' : 'Email'}
                  </TableHead>
                  <TableHead>{locale === 'zh' ? '用户名' : 'Name'}</TableHead>
                  <TableHead>{locale === 'zh' ? '地点' : 'Location'}</TableHead>
                  <TableHead>{locale === 'zh' ? '角色' : 'Role'}</TableHead>
                  <TableHead>{locale === 'zh' ? '注册时间' : 'Joined'}</TableHead>
                  <TableHead className="text-right">
                    {locale === 'zh' ? '操作' : 'Actions'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      {locale === 'zh' ? '暂无用户' : 'No users found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => fetchUserDetail(user.id)}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        {user.email}
                      </TableCell>
                      <TableCell>{user.name || '-'}</TableCell>
                      <TableCell className="flex items-center gap-2">
                        {user.location ? (
                          <>
                            <MapPin className="w-4 h-4" />
                            {user.location}
                          </>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'}>
                          {user.role === 'admin' ? (locale === 'zh' ? '管理员' : 'Admin') : (locale === 'zh' ? '用户' : 'User')}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {formatDate(user.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          {locale === 'zh' ? '查看详情' : 'View'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                {locale === 'zh' ? '第' : 'Page'} {page} {locale === 'zh' ? '共' : 'of'} {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => fetchUsers(page - 1)}
                >
                  {locale === 'zh' ? '上一页' : 'Previous'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() => fetchUsers(page + 1)}
                >
                  {locale === 'zh' ? '下一页' : 'Next'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
