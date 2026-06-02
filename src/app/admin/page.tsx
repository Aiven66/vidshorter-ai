'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth-context';
import { createLocalizedAdminPosts, saveAdminBlogPosts } from '@/lib/blog-content';
import { TrendingUp, Users, CreditCard, Play, Calendar, FileText } from 'lucide-react';

interface Stats {
  totalUsers: number;
  newUsersToday: number;
  totalPayments: number;
  totalRevenue: number;
  totalVideosProcessed: number;
  activeSubscriptions: number;
}

export function AdminDashboard() {
  const { user, accessToken } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    newUsersToday: 0,
    totalPayments: 0,
    totalRevenue: 0,
    totalVideosProcessed: 0,
    activeSubscriptions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [blogTitle, setBlogTitle] = useState('');
  const [blogCategory, setBlogCategory] = useState('AI Video Clipping');
  const [blogCoverImage, setBlogCoverImage] = useState('');
  const [blogContent, setBlogContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/stats', {
          headers: {
            Authorization: 'Bearer admin_secret_key_123',
          },
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        } else {
          setStats({
            totalUsers: 1247,
            newUsersToday: 32,
            totalPayments: 156,
            totalRevenue: 1432.56,
            totalVideosProcessed: 4892,
            activeSubscriptions: 89,
          });
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err);
        setStats({
          totalUsers: 1247,
          newUsersToday: 32,
          totalPayments: 156,
          totalRevenue: 1432.56,
          totalVideosProcessed: 4892,
          activeSubscriptions: 89,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'Total Users',
      value: loading ? '...' : stats.totalUsers.toLocaleString(),
      icon: Users,
      color: 'bg-blue-500',
      trend: '+12%',
      trendUp: true,
    },
    {
      title: 'New Users Today',
      value: loading ? '...' : stats.newUsersToday.toLocaleString(),
      icon: Calendar,
      color: 'bg-green-500',
      trend: '+8%',
      trendUp: true,
    },
    {
      title: 'Active Subscriptions',
      value: loading ? '...' : stats.activeSubscriptions.toLocaleString(),
      icon: CreditCard,
      color: 'bg-purple-500',
      trend: '+24%',
      trendUp: true,
    },
    {
      title: 'Total Revenue',
      value: loading ? '...' : `$${stats.totalRevenue.toLocaleString()}`,
      icon: TrendingUp,
      color: 'bg-orange-500',
      trend: '+31%',
      trendUp: true,
    },
    {
      title: 'Total Payments',
      value: loading ? '...' : stats.totalPayments.toLocaleString(),
      icon: CreditCard,
      color: 'bg-pink-500',
      trend: '+18%',
      trendUp: true,
    },
    {
      title: 'Videos Processed',
      value: loading ? '...' : stats.totalVideosProcessed.toLocaleString(),
      icon: Play,
      color: 'bg-cyan-500',
      trend: '+15%',
      trendUp: true,
    },
  ];

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
        setPublishStatus(remoteSaved
          ? `Published ${generatedCount} localized blog articles online.`
          : `Created ${generatedCount} localized blog articles for preview. Sign in with Supabase admin to save online.`
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <Button onClick={() => window.location.reload()}>
          Refresh Data
        </Button>
      </div>

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
              <div className="text-3xl font-bold mb-1">{stat.value}</div>
              <div className={`text-sm flex items-center gap-1 ${stat.trendUp ? 'text-green-500' : 'text-red-500'}`}>
                <TrendingUp className="h-3 w-3" />
                {stat.trend} this month
              </div>
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
                  {publishing ? 'Publishing...' : 'Publish multilingual article'}
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
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm">U</div>
                  <div>
                    <p className="font-medium">New user registered</p>
                    <p className="text-sm text-muted-foreground">john.doe@example.com</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">2 min ago</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white text-sm">$</div>
                  <div>
                    <p className="font-medium">Payment completed</p>
                    <p className="text-sm text-muted-foreground">Starter Plan - $9.99</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">15 min ago</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-sm">V</div>
                  <div>
                    <p className="font-medium">Video processed</p>
                    <p className="text-sm text-muted-foreground">User: jane.smith@example.com</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">32 min ago</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Free</span>
                  <span className="text-sm">{Math.round((stats.totalUsers - stats.activeSubscriptions) / stats.totalUsers * 100)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gray-400 transition-all"
                    style={{ width: `${((stats.totalUsers - stats.activeSubscriptions) / stats.totalUsers) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Starter</span>
                  <span className="text-sm">60%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all" style={{ width: '60%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Pro</span>
                  <span className="text-sm">40%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 transition-all" style={{ width: '40%' }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AdminDashboard;
