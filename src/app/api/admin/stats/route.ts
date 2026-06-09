import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

// --------------------------- Helpers ---------------------------

function getAdminAuth(
  request: NextRequest,
): { ok: boolean; bearerToken?: string; reason?: string } {
  const authHeader =
    request.headers.get('authorization') ||
    request.headers.get('Authorization') ||
    '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  // Legacy static admin key check (kept for backwards compatibility).
  const staticKey = process.env.ADMIN_API_KEY;
  if (staticKey && bearerToken && bearerToken === staticKey) {
    return { ok: true, bearerToken };
  }

  // Normal flow: caller should pass a JWT from a signed-in admin user.
  if (!bearerToken) {
    return { ok: false, reason: 'missing_token' };
  }

  return { ok: true, bearerToken };
}

function startOfTodayISO(): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  return d.toISOString();
}

function startOfMonthISO(): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  return d.toISOString();
}

// Approximate revenue per known plan – matches the prices in the payment flows.
const PLAN_PRICES: Record<string, number> = {
  starter: 9.9,
  pro: 19.9,
};

// --------------------------- Route ---------------------------

export async function GET(request: NextRequest) {
  const auth = getAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        totalUsers: 0,
        newUsersToday: 0,
        totalPayments: 0,
        totalRevenue: 0,
        totalVideosProcessed: 0,
        activeSubscriptions: 0,
        planBreakdown: { free: 0, starter: 0, pro: 0 },
        recentActivity: [],
        demo: true,
      },
      { status: 200 },
    );
  }

  try {
    const { getSupabaseClient } = await import(
      '@/storage/database/supabase-client'
    );
    const client = getSupabaseClient();

    // If a JWT was provided, verify it belongs to an admin before returning data.
    if (auth.bearerToken && auth.bearerToken !== process.env.ADMIN_API_KEY) {
      const clientWithJwt = getSupabaseClient(auth.bearerToken);
      const { data: authData } = await clientWithJwt.auth.getUser();
      if (!authData?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const { data: profile } = await client
        .from('users')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle();
      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const todayStart = startOfTodayISO();
    const monthStart = startOfMonthISO();

    // Parallel counts.
    const [
      totalUsersRes,
      newTodayRes,
      activeSubsRes,
      videosRes,
      purchaseTxRes,
      subsByPlanRes,
      recentUsersRes,
      recentTxRes,
      recentVideosRes,
    ] = await Promise.all([
      client.from('users').select('id', { count: 'exact', head: true }),
      client
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart),
      client
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .neq('plan_type', 'free'),
      client.from('videos').select('id', { count: 'exact', head: true }),
      client
        .from('credit_transactions')
        .select('id, plan_type, amount, description, created_at, user_id')
        .eq('type', 'purchase')
        .order('created_at', { ascending: false })
        .limit(100),
      client
        .from('subscriptions')
        .select('plan_type')
        .eq('status', 'active'),
      client
        .from('users')
        .select('id, email, name, created_at, role')
        .order('created_at', { ascending: false })
        .limit(5),
      client
        .from('credit_transactions')
        .select('id, type, amount, description, user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      client
        .from('videos')
        .select('id, title, source_type, status, user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    // Totals.
    const totalUsers = totalUsersRes.count ?? 0;
    const newUsersToday = newTodayRes.count ?? 0;
    const activeSubscriptions = activeSubsRes.count ?? 0;
    const totalVideosProcessed = videosRes.count ?? 0;

    // Payments & revenue from purchase transactions.
    const purchases = purchaseTxRes.data ?? [];
    const totalPayments = purchases.length;
    let totalRevenue = 0;
    for (const p of purchases) {
      const description = (p.description || '').toLowerCase();
      let matchedPlan: string | null = null;
      for (const plan of Object.keys(PLAN_PRICES)) {
        if (description.includes(plan)) {
          matchedPlan = plan;
          break;
        }
      }
      if (matchedPlan) {
        totalRevenue += PLAN_PRICES[matchedPlan];
      }
    }
    totalRevenue = Math.round(totalRevenue * 100) / 100;

    // Plan breakdown for the plan distribution card.
    const planBreakdown = { free: totalUsers, starter: 0, pro: 0 };
    for (const row of subsByPlanRes.data ?? []) {
      const plan = row.plan_type || 'free';
      if (plan === 'starter') planBreakdown.starter += 1;
      else if (plan === 'pro') planBreakdown.pro += 1;
    }
    // Free users = users that do not have any active paid subscription.
    planBreakdown.free = Math.max(
      0,
      totalUsers - planBreakdown.starter - planBreakdown.pro,
    );

    // Recent activity - combine recent users, payments, and videos.
    const recentActivity: Array<{
      kind: string;
      title: string;
      subtitle: string;
      createdAt: string;
    }> = [];

    for (const u of recentUsersRes.data ?? []) {
      recentActivity.push({
        kind: 'user',
        title: 'New user registered',
        subtitle: u.email ?? '—',
        createdAt: u.created_at ?? new Date().toISOString(),
      });
    }
    for (const tx of recentTxRes.data ?? []) {
      const title =
        tx.type === 'purchase'
          ? 'Payment completed'
          : tx.type === 'daily_reset'
            ? 'Daily credits reset'
            : 'Credit transaction';
      recentActivity.push({
        kind: 'payment',
        title,
        subtitle: tx.description ?? `${tx.amount > 0 ? '+' : ''}${tx.amount} credits`,
        createdAt: tx.created_at ?? new Date().toISOString(),
      });
    }
    for (const v of recentVideosRes.data ?? []) {
      recentActivity.push({
        kind: 'video',
        title: 'Video processed',
        subtitle: v.title || `${v.source_type || 'video'} - ${v.status || ''}`,
        createdAt: v.created_at ?? new Date().toISOString(),
      });
    }

    recentActivity.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const recentActivityTop = recentActivity.slice(0, 5);

    // Compute simple month-over-month trends. These are cheap approximations.
    const [usersThisMonthRes, videosThisMonthRes] = await Promise.all([
      client
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart),
      client
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart),
    ]);
    const usersThisMonth = usersThisMonthRes.count ?? 0;
    const videosThisMonth = videosThisMonthRes.count ?? 0;
    const subThisMonth = activeSubscriptions;
    const revenueThisMonth = totalRevenue;

    return NextResponse.json({
      totalUsers,
      newUsersToday,
      totalPayments,
      totalRevenue,
      totalVideosProcessed,
      activeSubscriptions,
      planBreakdown,
      recentActivity: recentActivityTop,
      trends: {
        usersThisMonth,
        videosThisMonth,
        subThisMonth,
        revenueThisMonth,
      },
    });
  } catch (err) {
    console.error('[admin/stats] failed:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
