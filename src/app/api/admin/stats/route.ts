import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

// --------------------------- Helpers ---------------------------

const ADMIN_EMAILS_LOWER = new Set<string>([
  'admin@126.com',
  'admin@clipop.ai',
  'admin',
]);

// Well-known admin email alias; treat "admin" bare string as admin too.
function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const cleaned = email.trim().toLowerCase();
  if (!cleaned) return false;
  if (ADMIN_EMAILS_LOWER.has(cleaned)) return true;
  return false;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    // JWT uses URL-safe base64: replace -_ with +/ and pad.
    let payload = parts[1];
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const pad = payload.length % 4;
    if (pad) payload += '='.repeat(4 - pad);
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractJwtEmail(jwt: string): string | null {
  const payload = decodeJwtPayload(jwt);
  if (!payload) return null;
  if (typeof payload.email === 'string' && payload.email) {
    return payload.email;
  }
  // Supabase anon JWTs often put email inside user_metadata (but not always).
  if (
    payload.user_metadata &&
    typeof payload.user_metadata === 'object' &&
    payload.user_metadata !== null
  ) {
    const meta = payload.user_metadata as Record<string, unknown>;
    if (typeof meta.email === 'string' && meta.email) return meta.email;
  }
  return null;
}

async function verifyBearerToken(
  bearerToken: string,
  getClient: () => any,
): Promise<{
  isAdmin: boolean;
  userId?: string;
  email?: string;
  isDemo?: boolean;
}> {
  const staticKey = process.env.ADMIN_API_KEY;
  if (staticKey && bearerToken === staticKey) {
    return { isAdmin: true };
  }

  // Try a real Supabase JWT first.
  try {
    const supabaseClient = getClient();
    const { data } = await supabaseClient.auth.getUser(bearerToken);
    if (data?.user?.id) {
      const userId = data.user.id;
      // Look up our users table for role.
      const { data: profile } = await supabaseClient
        .from('users')
        .select('email, role')
        .eq('id', userId)
        .maybeSingle();
      if (profile?.role === 'admin' || isAdminEmail(profile?.email) || isAdminEmail(data.user.email)) {
        return { isAdmin: true, userId, email: profile?.email || data.user.email };
      }
    }
  } catch {
    // Fall through.
  }

  // Fall back: treat the token as a client-generated demo JWT.
  const emailFromJwt = extractJwtEmail(bearerToken);
  if (emailFromJwt && isAdminEmail(emailFromJwt)) {
    return { isAdmin: true, email: emailFromJwt, isDemo: true };
  }

  // Even for non-admin, we additionally check by email in users table (if the JWT wasn't valid).
  if (emailFromJwt) {
    try {
      const supabaseClient = getClient();
      const { data: profile } = await supabaseClient
        .from('users')
        .select('email, role')
        .eq('email', emailFromJwt)
        .maybeSingle();
      if (profile?.role === 'admin') {
        return { isAdmin: true, email: profile.email };
      }
    } catch {
      // No-op.
    }
  }

  return { isAdmin: false, email: emailFromJwt || undefined };
}

function startOfDayUtc(offsetDays = 0): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + offsetDays,
      0,
      0,
      0,
      0,
    ),
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
  const authHeader =
    request.headers.get('authorization') ||
    request.headers.get('Authorization') ||
    '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!bearerToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error: 'Database not configured',
        totalUsers: 0,
        newUsersToday: 0,
        totalPayments: 0,
        totalRevenue: 0,
        totalVideosProcessed: 0,
        activeSubscriptions: 0,
        planBreakdown: { free: 0, starter: 0, pro: 0 },
        recentActivity: [],
      },
      { status: 200 },
    );
  }

  try {
    const { getSupabaseClient } = await import(
      '@/storage/database/supabase-client'
    );

    // Authorize against the admin rules. Uses the default (anon) client for DB lookups.
    const { isAdmin } = await verifyBearerToken(bearerToken, () => getSupabaseClient());
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const client = getSupabaseClient();

    const todayStart = startOfDayUtc(0);
    const monthStart = (() => {
      const now = new Date();
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
      ).toISOString();
    })();

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
        .select('id, amount, description, created_at, user_id')
        .eq('type', 'purchase')
        .order('created_at', { ascending: false })
        .limit(100),
      client.from('subscriptions').select('plan_type').eq('status', 'active'),
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
        subtitle:
          tx.description ?? `${tx.amount > 0 ? '+' : ''}${tx.amount} credits`,
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

    // Compute simple month-over-month trends.
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
        subThisMonth: activeSubscriptions,
        revenueThisMonth: totalRevenue,
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
