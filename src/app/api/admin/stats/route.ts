import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ======================== Config ========================

const ADMIN_EMAILS = new Set([
  'admin@126.com',
  'admin@clipop.ai',
]);

// ======================== JWT Decode ========================

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    let payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const pad = payload.length % 4;
    if (pad) payload += '='.repeat(4 - pad);
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

// ======================== Admin Check ========================

function isAdminFromToken(token: string): { isAdmin: boolean; email?: string } {
  // 1. Static API key
  if (process.env.ADMIN_API_KEY && token === process.env.ADMIN_API_KEY) {
    return { isAdmin: true };
  }

  // 2. Decode JWT – works for both real Supabase JWTs and demo tokens
  const payload = decodeJwtPayload(token);
  if (!payload) return { isAdmin: false };

  const email = (typeof payload.email === 'string' ? payload.email : '') as string;
  const role = (typeof payload.role === 'string' ? payload.role : '') as string;

  // Check role field
  if (role === 'admin') return { isAdmin: true, email };

  // Check known admin emails
  if (email && ADMIN_EMAILS.has(email.trim().toLowerCase())) {
    return { isAdmin: true, email };
  }

  // Check user_metadata.email for some Supabase JWT formats
  if (payload.user_metadata && typeof payload.user_metadata === 'object') {
    const meta = payload.user_metadata as Record<string, unknown>;
    const metaEmail = typeof meta.email === 'string' ? meta.email : '';
    if (metaEmail && ADMIN_EMAILS.has(metaEmail.trim().toLowerCase())) {
      return { isAdmin: true, email: metaEmail };
    }
  }

  return { isAdmin: false, email: email || undefined };
}

// ======================== Supabase Client ========================

function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
}

function getAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY || '';
}

function getServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
}

function createAdminClient() {
  const url = getSupabaseUrl();
  const serviceKey = getServiceRoleKey();
  const anonKey = getAnonKey();

  // Prefer service role key to bypass RLS
  const key = serviceKey || anonKey;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ======================== Date Helpers ========================

function startOfDayUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

function startOfMonthUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

// ======================== Safe Query Helper ========================

async function safeCount(
  client: any,
  table: string,
  filters?: Array<{ column: string; value: any; op?: string }>,
): Promise<number> {
  try {
    let query = client.from(table).select('id', { count: 'exact', head: true });
    if (filters) {
      for (const f of filters) {
        if (f.op === 'neq') query = query.neq(f.column, f.value);
        else if (f.op === 'gte') query = query.gte(f.column, f.value);
        else query = query.eq(f.column, f.value);
      }
    }
    const { count, error } = await query;
    if (error) {
      console.error(`[admin/stats] count ${table} error:`, error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error(`[admin/stats] count ${table} exception:`, err);
    return 0;
  }
}

async function safeSelect(
  client: any,
  table: string,
  columns: string,
  opts?: {
    filters?: Array<{ column: string; value: any; op?: string }>;
    order?: string;
    ascending?: boolean;
    limit?: number;
  },
): Promise<any[]> {
  try {
    let query = client.from(table).select(columns);
    if (opts?.filters) {
      for (const f of opts.filters) {
        if (f.op === 'neq') query = query.neq(f.column, f.value);
        else if (f.op === 'gte') query = query.gte(f.column, f.value);
        else query = query.eq(f.column, f.value);
      }
    }
    if (opts?.order) query = query.order(opts.order, { ascending: opts.ascending ?? false });
    if (opts?.limit) query = query.limit(opts.limit);
    const { data, error } = await query;
    if (error) {
      console.error(`[admin/stats] select ${table} error:`, error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error(`[admin/stats] select ${table} exception:`, err);
    return [];
  }
}

// ======================== Route Handler ========================

export async function GET(request: NextRequest) {
  // --- Auth ---
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!bearerToken) {
    console.error('[admin/stats] No bearer token provided');
    return NextResponse.json({ error: 'Unauthorized – no token' }, { status: 401 });
  }

  const { isAdmin, email: adminEmail } = isAdminFromToken(bearerToken);
  if (!isAdmin) {
    console.error('[admin/stats] Forbidden – token not admin, email:', adminEmail);
    return NextResponse.json({ error: 'Forbidden – not admin' }, { status: 403 });
  }

  // --- DB Client ---
  const client = createAdminClient();
  if (!client) {
    console.error('[admin/stats] Supabase not configured – URL or key missing');
    return NextResponse.json({
      totalUsers: 0, newUsersToday: 0, totalPayments: 0, totalRevenue: 0,
      totalVideosProcessed: 0, activeSubscriptions: 0,
      planBreakdown: { free: 0, starter: 0, pro: 0 },
      recentActivity: [],
      trends: { usersThisMonth: 0, videosThisMonth: 0, subThisMonth: 0, revenueThisMonth: 0 },
      _warning: 'Database not configured – showing zero values',
    });
  }

  console.log('[admin/stats] Admin verified:', adminEmail, '| service role key:', getServiceRoleKey() ? 'YES' : 'NO (using anon)');

  // --- Queries ---
  const todayStart = startOfDayUtc();
  const monthStart = startOfMonthUtc();

  const [
    totalUsers,
    newUsersToday,
    activeSubscriptions,
    totalVideosProcessed,
    purchases,
    subsByPlan,
    recentUsers,
    recentTx,
    recentVideos,
    usersThisMonth,
    videosThisMonth,
  ] = await Promise.all([
    safeCount(client, 'users'),
    safeCount(client, 'users', [{ column: 'created_at', value: todayStart, op: 'gte' }]),
    safeCount(client, 'subscriptions', [
      { column: 'status', value: 'active' },
      { column: 'plan_type', value: 'free', op: 'neq' },
    ]),
    safeCount(client, 'videos'),
    safeSelect(client, 'credit_transactions', 'id, amount, description, created_at, user_id', {
      filters: [{ column: 'type', value: 'purchase' }],
      order: 'created_at', ascending: false, limit: 200,
    }),
    safeSelect(client, 'subscriptions', 'plan_type', {
      filters: [{ column: 'status', value: 'active' }],
    }),
    safeSelect(client, 'users', 'id, email, name, created_at, role', {
      order: 'created_at', ascending: false, limit: 5,
    }),
    safeSelect(client, 'credit_transactions', 'id, type, amount, description, user_id, created_at', {
      order: 'created_at', ascending: false, limit: 5,
    }),
    safeSelect(client, 'videos', 'id, title, source_type, status, user_id, created_at', {
      order: 'created_at', ascending: false, limit: 5,
    }),
    safeCount(client, 'users', [{ column: 'created_at', value: monthStart, op: 'gte' }]),
    safeCount(client, 'videos', [{ column: 'created_at', value: monthStart, op: 'gte' }]),
  ]);

  // --- Revenue ---
  const PLAN_PRICES: Record<string, number> = { starter: 9.9, pro: 19.9 };
  let totalRevenue = 0;
  for (const p of purchases) {
    const desc = (p.description || '').toLowerCase();
    for (const plan of Object.keys(PLAN_PRICES)) {
      if (desc.includes(plan)) {
        totalRevenue += PLAN_PRICES[plan];
        break;
      }
    }
  }
  totalRevenue = Math.round(totalRevenue * 100) / 100;

  // --- Plan Breakdown ---
  const planBreakdown = { free: 0, starter: 0, pro: 0 };
  for (const row of subsByPlan) {
    const plan = row.plan_type || 'free';
    if (plan === 'starter') planBreakdown.starter++;
    else if (plan === 'pro') planBreakdown.pro++;
  }
  planBreakdown.free = Math.max(0, totalUsers - planBreakdown.starter - planBreakdown.pro);

  // --- Recent Activity ---
  const recentActivity: Array<{ kind: string; title: string; subtitle: string; createdAt: string }> = [];

  for (const u of recentUsers) {
    recentActivity.push({
      kind: 'user', title: 'New user registered',
      subtitle: u.email ?? '—', createdAt: u.created_at ?? new Date().toISOString(),
    });
  }
  for (const tx of recentTx) {
    const title = tx.type === 'purchase' ? 'Payment completed'
      : tx.type === 'daily_reset' ? 'Daily credits reset'
      : 'Credit transaction';
    recentActivity.push({
      kind: 'payment', title,
      subtitle: tx.description ?? `${tx.amount > 0 ? '+' : ''}${tx.amount} credits`,
      createdAt: tx.created_at ?? new Date().toISOString(),
    });
  }
  for (const v of recentVideos) {
    recentActivity.push({
      kind: 'video', title: 'Video processed',
      subtitle: v.title || `${v.source_type || 'video'} - ${v.status || ''}`,
      createdAt: v.created_at ?? new Date().toISOString(),
    });
  }
  recentActivity.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({
    totalUsers,
    newUsersToday,
    totalPayments: purchases.length,
    totalRevenue,
    totalVideosProcessed,
    activeSubscriptions,
    planBreakdown,
    recentActivity: recentActivity.slice(0, 5),
    trends: {
      usersThisMonth,
      videosThisMonth,
      subThisMonth: activeSubscriptions,
      revenueThisMonth: totalRevenue,
    },
  });
}
