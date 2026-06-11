'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth-context';
import { createLocalizedAdminPosts, saveAdminBlogPosts } from '@/lib/blog-content';
import {
  TrendingUp,
  Users,
  CreditCard,
  Play,
  Calendar,
  FileText,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

interface Stats {
  totalUsers: number;
  newUsersToday: number;
  totalPayments: number;
  totalRevenue: number;
  totalVideosProcessed: number;
  activeSubscriptions: number;
  planBreakdown?: { free: number; starter: number; pro: number };
  recentActivity?: Array<{
    kind: string;
    title: string;
    subtitle: string;
    createdAt: string;
  }>;
  trends?: {
    usersThisMonth: number;
    videosThisMonth: number;
    subThisMonth: number;
    revenueThisMonth: number;
  };
}

function formatTrendPct(value: number, total: number): string {
  if (!total) return '—';
  const pct = (value / total) * 100;
  return `+${pct.toFixed(1)}% this month`;
}

function humanAgo(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}

export function AdminDashboard() {
  const { user, accessToken, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blogTitle, setBlogTitle] = useState('');
  const [blogCategory, setBlogCategory] = useState('AI Video Clipping');
  const [blogCoverImage, setBlogCoverImage] = useState('');
  const [blogContent, setBlogContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  const fetchStats = useCallback(async (token: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/admin/stats', {
        headers,
        cache: 'no-store',
      });
      if (res.ok) {
        const data: Stats = await res.json();
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
  }, []);

  // Wait for auth to finish loading, then fetch stats with the token
  useEffect(() => {
    if (authLoading) return; // Still loading auth – don't fetch yet
    if (!accessToken) {
      setLoading(false);
      setError('Please sign in as admin to view dashboard data.');
      return;
    }
    fetchStats(accessToken);
  }, [authLoading, accessToken, fetchStats]);

  const statCards = useMemo(() => {
    if (!stats) return [];
    return [
      {
        title: 'Total Users',
        value: stats.totalUsers.toLocaleString(),
        icon: Users,
        color: 'bg-blue-500',
        trend: formatTrendPct(stats.trends?.usersThisMonth ?? 0, stats.totalUsers),
        trendUp: true,
      },
      {
        title: 'New Users Today',
        value: stats.newUsersToday.toLocaleString(),
        icon: Calendar,
        color: 'bg-green-500',
        trend: formatTrendPct(stats.trends?.usersThisMonth ?? 0, stats.totalUsers),
        trendUp: true,
      },
      {
        title: 'Active Subscriptions',
        value: stats.activeSubscriptions.toLocaleString(),
        icon: CreditCard,
        color: 'bg-purple-500',
        trend: `${stats.activeSubscriptions} active paid plans`,
        trendUp: true,
      },
      {
        title: 'Total Revenue',
        value: `$${stats.totalRevenue.toLocaleString()}`,
        icon: TrendingUp,
        color: 'bg-orange-500',
        trend: formatTrendPct(stats.trends?.revenueThisMonth ?? 0, stats.totalRevenue || 1),
        trendUp: true,
      },
      {
        title: 'Total Payments',
        value: stats.totalPayments.toLocaleString(),
        icon: CreditCard,
        color: 'bg-pink-500',
        trend: `${stats.totalPayments} purchases tracked`,
        trendUp: true,
      },
      {
        title: 'Videos Processed',
        value: stats.totalVideosProcessed.toLocaleString(),
        icon: Play,
        color: 'bg-cyan-500',
        trend: formatTrendPct(stats.trends?.videosThisMonth ?? 0, stats.totalVideosProcessed),
        trendUp: true,
      },
    ];
  }, [stats]);

  const isAdmin = user?.role === 'admin' || user?.email === 'admin@126.com';

  async function publishBlog() {
    setPublishStatus(null);

    if (!isAdmin) {
      setPublishStatus('Admin access required. Please sign in as admin@126.com.');
      return;
    }

    if (!blogTitle.trim() || !blogContent.trim()) {
      setPublishStatus('Please enter an English title and article content.');
      return;
    }

    setPublishing(true);

    try {
      const payload = {
        title: blogTitle.trim(),
        category: blogCategory.trim() || 'AI Video Clipping',
        coverImage: blogCoverImage.trim(),
        content: blogContent.trim(),
        publish: true,
      };

      let generatedCount = 0;
      let remoteSaved = false;
      if (accessToken) {
        const res = await fetch('/api/blog/posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (Array.isArray(data.posts)) {
            saveAdminBlogPosts(data.posts);
            generatedCount = data.posts.length;
          }
          remoteSaved = true;
        } else {
          const data = await res.json().catch(() => ({}));
          const localPosts = createLocalizedAdminPosts(payload);
          saveAdminBlogPosts(localPosts);
          generatedCount = localPosts.length;
          setPublishStatus(`Saved local preview. Online save failed: ${data.error || res.statusText}`);
        }
      }

      if (remoteSaved || !accessToken) {
        if (!accessToken) {
          const localPosts = createLocalizedAdminPosts(payload);
          saveAdminBlogPosts(localPosts);
          generatedCount = localPosts.length;
        }
        setPublishStatus(
          remoteSaved
            ? `Published ${generatedCount} localized blog articles online.`
            : `Created ${generatedCount} localized blog articles for preview. Sign in with Supabase admin to save online.`,
        );
      }

      setBlogTitle('');
      setBlogCoverImage('');
      setBlogContent('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Publishing failed.';
      setPublishStatus(message);
    } finally {
      setPublishing(false);
    }
  }

  const totalPaidUsers =
    (stats?.planBreakdown?.starter ?? 0) + (stats?.planBreakdown?.pro ?? 0);
  const freeUsers = stats?.planBreakdown?.free ?? 0;
  const planTotal = freeUsers + totalPaidUsers || 1;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time platform statistics from the production database.
          </p>
        </div>
        <Button onClick={() => fetchStats(accessToken)} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh Data
        </Button>
      </div>

      {error && !loading && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:border-amber-900 dark:text-amber-200">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Could not load live stats</div>
            <div className="text-xs">{error}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat, index) => (
          <Card key={index} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">{stat.title}</CardTitle>
                <div className={`p-2 rounded-lg ${stat.color}/20`}>
                  <stat.icon className={`h-5 w-5 ${stat.color.replace('bg-', 'text-')}`} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-1">
                {loading ? '…' : stat.value}
              </div>
              <div className="text-sm text-muted-foreground">{stat.trend}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Publish Blog Article
              </CardTitle>
              <Badge variant="secondary">English source, auto localized</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {!isAdmin && (
                <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                  Sign in as admin@126.com to publish multilingual blog articles.
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="blog-title">English title</Label>
                <Input
                  id="blog-title"
                  value={blogTitle}
                  onChange={(event) => setBlogTitle(event.target.value)}
                  placeholder="How to Turn Long Videos into AI Highlight Shorts"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="blog-category">Category</Label>
                  <Input
                    id="blog-category"
                    value={blogCategory}
                    onChange={(event) => setBlogCategory(event.target.value)}
                    placeholder="AI Video Clipping"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="blog-cover">Cover image URL</Label>
                  <Input
                    id="blog-cover"
                    value={blogCoverImage}
                    onChange={(event) => setBlogCoverImage(event.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="blog-content">English content</Label>
                <Textarea
                  id="blog-content"
                  value={blogContent}
                  onChange={(event) => setBlogContent(event.target.value)}
                  placeholder="<p>clipopai helps creators convert long videos into short highlight clips with AI...</p>"
                  className="min-h-56"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={publishBlog} disabled={publishing || !isAdmin}>
                  {publishing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    'Publish multilingual article'
                  )}
                </Button>
                {publishStatus && (
                  <span className="text-sm text-muted-foreground">{publishStatus}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest sign-ups, payments, and video processing.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {loading && (
                <div className="text-sm text-muted-foreground">Loading activity…</div>
              )}
              {!loading && stats?.recentActivity && stats.recentActivity.length === 0 && (
                <div className="text-sm text-muted-foreground">No recent activity yet.</div>
              )}
              {!loading && stats?.recentActivity?.map((a, i) => {
                const kindColor =
                  a.kind === 'user'
                    ? 'bg-blue-500'
                    : a.kind === 'payment'
                      ? 'bg-green-500'
                      : 'bg-purple-500';
                return (
                  <div
                    key={`${a.createdAt}-${i}`}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full ${kindColor} flex items-center justify-center text-white text-sm flex-shrink-0`}
                      >
                        {a.kind === 'user' ? 'U' : a.kind === 'payment' ? '$' : 'V'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{a.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{a.subtitle}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">
                      {humanAgo(a.createdAt)}
                    </span>
                  </div>
                );
              })}
              {!loading && stats && !stats.recentActivity && (
                <div className="text-sm text-muted-foreground">Activity feed not available.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan Distribution</CardTitle>
            <CardDescription>Active users by subscription tier.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading plan breakdown…</div>
              ) : (
                <>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Free</span>
                      <span className="text-sm">
                        {freeUsers.toLocaleString()} ({Math.round((freeUsers / planTotal) * 100)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-400 transition-all"
                        style={{ width: `${(freeUsers / planTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Starter</span>
                      <span className="text-sm">
                        {(stats?.planBreakdown?.starter ?? 0).toLocaleString()}{' '}
                        {totalPaidUsers > 0 &&
                          `(${Math.round(((stats?.planBreakdown?.starter ?? 0) / totalPaidUsers) * 100)}% paid)`}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${((stats?.planBreakdown?.starter ?? 0) / planTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Pro</span>
                      <span className="text-sm">
                        {(stats?.planBreakdown?.pro ?? 0).toLocaleString()}{' '}
                        {totalPaidUsers > 0 &&
                          `(${Math.round(((stats?.planBreakdown?.pro ?? 0) / totalPaidUsers) * 100)}% paid)`}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${((stats?.planBreakdown?.pro ?? 0) / planTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AdminDashboard;
