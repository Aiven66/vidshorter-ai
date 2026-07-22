import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Force dynamic — prevents Next.js from trying to statically generate this API route at build time.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ======================== Config ========================

const ADMIN_EMAILS = new Set([
  'admin@126.com',
  'admin@clipop.ai',
]);

// ======================== Helpers ========================

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

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY || '';
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  console.log('[admin/analytics] Supabase:', { using: serviceKey ? 'service_role' : 'anon' });
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

function startOfTodayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  )).toISOString();
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function startOfDaysAgoIso(days: number): string {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - days,
    0, 0, 0, 0
  )).toISOString();
}

const PLAN_PRICES: Record<string, number> = {
  starter: 9.9,
  pro: 19.9,
};

// ======================== Route ========================

export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token || !isAdminFromToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getSupabaseClient();
  if (!client) {
    return NextResponse.json({
      totalUsers: 0, activeUsers: 0, newUsersToday: 0, newUsersThisMonth: 0,
      totalRevenue: 0, activeSubscriptions: 0, totalPayments: 0, totalVideosProcessed: 0,
      retention: { day1: 0, day3: 0, day7: 0, day30: 0 }, arpu: 0, conversionRate: 0, avgRevenuePerUser: 0,
      _warning: 'Database not configured',
    });
  }

  try {
    const todayStart = startOfTodayIso();
    const monthStart = startOfMonthIso();

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
    const totalPayments = paymentsRes.data?.length || 0;

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

    // Active users (video activity in last 7 days)
    const sevenDaysAgo = startOfDaysAgoIso(7);
    const activeUsersRes = await client.from('videos')
      .select('user_id', { count: 'distinct', head: true })
      .gte('created_at', sevenDaysAgo);
    const activeUsers = activeUsersRes.count || 0;

    // Derived metrics
    const arpu = totalUsers > 0 ? totalRevenue / totalUsers : 0;
    const conversionRate = totalUsers > 0 ? (activeSubscriptions / totalUsers) * 100 : 0;

    // Retention calculation
    const retention = { day1: 0, day3: 0, day7: 0, day30: 0 };
    try {
      const thirtyOneDaysAgo = startOfDaysAgoIso(31);
      const cohortRes = await client.from('users')
        .select('id, created_at')
        .lt('created_at', thirtyOneDaysAgo)
        .limit(500);

      const cohort = cohortRes.data || [];
      if (cohort.length > 0) {
        const userIds = cohort.map(u => u.id);
        const videosActivityRes = await client.from('videos')
          .select('user_id, created_at')
          .in('user_id', userIds);

        const activityByUser: Record<string, string[]> = {};
        for (const v of videosActivityRes.data || []) {
          if (!activityByUser[v.user_id]) activityByUser[v.user_id] = [];
          activityByUser[v.user_id].push(v.created_at);
        }

        const calcRetention = (days: number) => {
          let retained = 0;
          for (const user of cohort) {
            const activity = activityByUser[user.id] || [];
            if (activity.length > 0) {
              const userCreatedAt = new Date(user.created_at).getTime();
              for (const createdAt of activity) {
                const diffDays = (new Date(createdAt).getTime() - userCreatedAt) / (1000 * 60 * 60 * 24);
                if (diffDays >= days && diffDays <= days + 1) {
                  retained++;
                  break;
                }
              }
            }
          }
          return (retained / cohort.length) * 100;
        };

        retention.day1 = Math.round(calcRetention(1) * 100) / 100;
        retention.day3 = Math.round(calcRetention(3) * 100) / 100;
        retention.day7 = Math.round(calcRetention(7) * 100) / 100;
        retention.day30 = Math.round(calcRetention(30) * 100) / 100;
      }
    } catch (retErr) {
      console.warn('[admin/analytics] retention calc failed:', retErr);
    }

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
      avgRevenuePerUser: Math.round(arpu * 100) / 100,
    });
  } catch (err) {
    console.error('[admin/analytics] failed:', err);
    return NextResponse.json({ error: 'Internal error', details: String(err) }, { status: 500 });
  }
}
