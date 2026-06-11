import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ======================== Auth Helpers ========================

const ADMIN_EMAILS = new Set([
  'admin@126.com',
  'admin@clipop.ai',
]);

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payload.length % 4;
    if (pad) payload += '='.repeat(4 - pad);
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

function isAdminFromToken(token: string): boolean {
  if (process.env.ADMIN_API_KEY && token === process.env.ADMIN_API_KEY) return true;

  const payload = decodeJwtPayload(token);
  if (!payload) return false;

  const email = typeof payload.email === 'string' ? payload.email : '';
  const role = typeof payload.role === 'string' ? payload.role : '';

  if (role === 'admin') return true;
  if (email && ADMIN_EMAILS.has(email.trim().toLowerCase())) return true;

  if (payload.user_metadata && typeof payload.user_metadata === 'object') {
    const meta = payload.user_metadata as Record<string, unknown>;
    const metaEmail = typeof meta.email === 'string' ? meta.email : '';
    if (metaEmail && ADMIN_EMAILS.has(metaEmail.trim().toLowerCase())) return true;
  }

  return false;
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY || '';

  const key = serviceKey || anonKey;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization') || '';
  return authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;
}

// ======================== Date Helpers ========================

function startOfDayUtc(daysAgo: number = 0): string {
  const now = new Date();
  const d = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysAgo,
    0,
    0,
    0,
    0
  ));
  return d.toISOString();
}

function startOfMonthUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

// ======================== Analytics API ========================

const PLAN_PRICES: Record<string, number> = {
  starter: 9.9,
  pro: 19.9,
};

export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token || !isAdminFromToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = createAdminClient();
  if (!client) {
    return NextResponse.json({
      totalUsers: 0,
      activeUsers: 0,
      newUsersToday: 0,
      newUsersThisMonth: 0,
      totalRevenue: 0,
      activeSubscriptions: 0,
      totalPayments: 0,
      totalVideosProcessed: 0,
      retention: { day1: 0, day3: 0, day7: 0, day30: 0 },
      arpu: 0,
      conversionRate: 0,
      avgRevenuePerUser: 0,
    });
  }

  try {
    const todayStart = startOfDayUtc(0);
    const yesterdayStart = startOfDayUtc(1);
    const monthStart = startOfMonthUtc();

    // Basic counts
    const [
      totalUsersRes,
      newTodayRes,
      newMonthRes,
      activeSubsRes,
      videosRes,
      paymentsRes,
    ] = await Promise.all([
      client.from('users').select('id', { count: 'exact', head: true }),
      client.from('users').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      client.from('users').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
      client.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').neq('plan_type', 'free'),
      client.from('videos').select('id', { count: 'exact', head: true }),
      client.from('credit_transactions').select('description').eq('type', 'purchase'),
    ]);

    const totalUsers = totalUsersRes.count || 0;
    const newUsersToday = newTodayRes.count || 0;
    const newUsersThisMonth = newMonthRes.count || 0;
    const activeSubscriptions = activeSubsRes.count || 0;
    const totalVideosProcessed = videosRes.count || 0;
    const totalPayments = paymentsRes.count || 0;

    // Calculate revenue
    let totalRevenue = 0;
    for (const tx of paymentsRes.data || []) {
      const desc = (tx.description || '').toLowerCase();
      for (const plan of Object.keys(PLAN_PRICES)) {
        if (desc.includes(plan)) {
          totalRevenue += PLAN_PRICES[plan];
          break;
        }
      }
    }

    // Calculate ARPU and conversion rate
    const arpu = totalUsers > 0 ? totalRevenue / totalUsers : 0;
    const conversionRate = totalUsers > 0 ? (activeSubscriptions / totalUsers) * 100 : 0;
    const avgRevenuePerUser = arpu;

    // Active users (users who processed videos in the last 7 days)
    const sevenDaysAgo = startOfDayUtc(7);
    const activeUsersRes = await client.from('videos')
      .select('user_id', { count: 'distinct', head: true })
      .gte('created_at', sevenDaysAgo);
    const activeUsers = activeUsersRes.count || 0;

    // Retention calculation
    const retention = await calculateRetention(client);

    return NextResponse.json({
      totalUsers,
      activeUsers,
      newUsersToday,
      newUsersThisMonth,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      activeSubscriptions,
      totalPayments,
      totalVideosProcessed,
      retention,
      arpu: Math.round(arpu * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
      avgRevenuePerUser: Math.round(avgRevenuePerUser * 100) / 100,
    });
  } catch (err) {
    console.error('[admin/analytics] failed:', err);
    return NextResponse.json({
      totalUsers: 0,
      activeUsers: 0,
      newUsersToday: 0,
      newUsersThisMonth: 0,
      totalRevenue: 0,
      activeSubscriptions: 0,
      totalPayments: 0,
      totalVideosProcessed: 0,
      retention: { day1: 0, day3: 0, day7: 0, day30: 0 },
      arpu: 0,
      conversionRate: 0,
      avgRevenuePerUser: 0,
    });
  }
}

async function calculateRetention(client: any) {
  const retention = { day1: 0, day3: 0, day7: 0, day30: 0 };

  try {
    // Get users registered 31+ days ago for accurate 30-day retention
    const thirtyOneDaysAgo = startOfDayUtc(31);
    const cohortRes = await client.from('users')
      .select('id, created_at')
      .lt('created_at', thirtyOneDaysAgo);

    const cohortUsers = cohortRes.data || [];
    if (cohortUsers.length === 0) {
      return retention;
    }

    const userIds = cohortUsers.map(u => u.id);
    const userIdsStr = `(${userIds.map(id => `'${id}'`).join(',')})`;

    // Get video activity for these users
    const videosRes = await client.from('videos')
      .select('user_id, created_at');

    const userVideoActivity: Record<string, Set<number>> = {};
    for (const video of videosRes.data || []) {
      const userId = video.user_id;
      if (!userVideoActivity[userId]) {
        userVideoActivity[userId] = new Set();
      }
      const daysSinceCreation = Math.floor(
        (new Date(video.created_at).getTime() - new Date(
          cohortUsers.find(u => u.id === userId)?.created_at || video.created_at
        ).getTime()) / (1000 * 60 * 60 * 24)
      );
      userVideoActivity[userId].add(daysSinceCreation);
    }

    // Calculate retention for each day
    const calculateDayRetention = (day: number) => {
      let retained = 0;
      for (const userId of userIds) {
        const activity = userVideoActivity[userId];
        if (activity && activity.has(day)) {
          retained++;
        }
      }
      return (retained / userIds.length) * 100;
    };

    retention.day1 = Math.round(calculateDayRetention(1) * 100) / 100;
    retention.day3 = Math.round(calculateDayRetention(3) * 100) / 100;
    retention.day7 = Math.round(calculateDayRetention(7) * 100) / 100;
    retention.day30 = Math.round(calculateDayRetention(30) * 100) / 100;
  } catch (err) {
    console.error('[admin/analytics] retention calculation failed:', err);
  }

  return retention;
}
