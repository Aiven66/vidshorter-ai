'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, Calendar, Mail, MapPin } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { type Locale } from './admin-layout';

interface Payment {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  user_location: string | null;
  amount: number;
  plan_type: string;
  description: string;
  created_at: string;
}

interface PaymentsPageProps {
  locale: Locale;
}

export function PaymentsPage({ locale }: PaymentsPageProps) {
  const { accessToken } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);

  const fetchPayments = useCallback(async (pageNum: number = 1) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments?page=${pageNum}&limit=10`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
        setTotalPages(data.totalPages || 1);
        setPage(pageNum);
        setTotalRevenue(data.totalRevenue || 0);
        setTotalPayments(data.totalPayments || 0);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to load payments (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchPayments(1);
  }, [fetchPayments]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {locale === 'zh' ? '付费管理' : 'Payment Management'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {locale === 'zh' ? '查看所有付费记录' : 'View all payment records'}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground mb-1">
              {locale === 'zh' ? '累计收入' : 'Total Revenue'}
            </div>
            <div className="text-2xl font-bold">
              ${totalRevenue.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground mb-1">
              {locale === 'zh' ? '付费次数' : 'Total Payments'}
            </div>
            <div className="text-2xl font-bold">
              {totalPayments.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{locale === 'zh' ? '付费记录' : 'Payment Records'}</CardTitle>
          <CardDescription>
            {locale === 'zh' ? '所有用户的付费历史' : 'All user payment history'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">
                    {locale === 'zh' ? '用户邮箱' : 'User Email'}
                  </TableHead>
                  <TableHead>{locale === 'zh' ? '用户名' : 'Name'}</TableHead>
                  <TableHead>{locale === 'zh' ? '地点' : 'Location'}</TableHead>
                  <TableHead>{locale === 'zh' ? '金额' : 'Amount'}</TableHead>
                  <TableHead>{locale === 'zh' ? '套餐' : 'Plan'}</TableHead>
                  <TableHead>{locale === 'zh' ? '付费时间' : 'Date'}</TableHead>
                  <TableHead>{locale === 'zh' ? '描述' : 'Description'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      {locale === 'zh' ? '暂无付费记录' : 'No payments found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        {payment.user_email}
                      </TableCell>
                      <TableCell>{payment.user_name || '-'}</TableCell>
                      <TableCell className="flex items-center gap-2">
                        {payment.user_location ? (
                          <>
                            <MapPin className="w-4 h-4" />
                            {payment.user_location}
                          </>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">
                        <CreditCard className="w-4 h-4 inline mr-2" />
                        ${payment.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {payment.plan_type === 'starter' ? (locale === 'zh' ? '入门版' : 'Starter') : (payment.plan_type === 'pro' ? (locale === 'zh' ? '专业版' : 'Pro') : payment.plan_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {formatDate(payment.created_at)}
                      </TableCell>
                      <TableCell>{payment.description || '-'}</TableCell>
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
                <button
                  className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50"
                  disabled={page === 1}
                  onClick={() => fetchPayments(page - 1)}
                >
                  {locale === 'zh' ? '上一页' : 'Previous'}
                </button>
                <button
                  className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50"
                  disabled={page === totalPages}
                  onClick={() => fetchPayments(page + 1)}
                >
                  {locale === 'zh' ? '下一页' : 'Next'}
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
