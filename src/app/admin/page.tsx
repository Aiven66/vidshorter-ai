'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, Users, CreditCard, Play, Calendar } from 'lucide-react';

interface Stats {
  totalUsers: number;
  newUsersToday: number;
  totalPayments: number;
  totalRevenue: number;
  totalVideosProcessed: number;
  activeSubscriptions: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    newUsersToday: 0,
    totalPayments: 0,
    totalRevenue: 0,
    totalVideosProcessed: 0,
    activeSubscriptions: 0,
  });
  const [loading, setLoading] = useState(true);

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