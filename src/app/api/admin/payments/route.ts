import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

  console.log('[admin/payments] Supabase:', {
    using: serviceKey ? 'service_role' : 'anon',
    hasServiceKey: !!serviceKey,
  });

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

const PLAN_PRICES: Record<string, number> = {
  starter: 9.9,
  pro: 19.9,
};

// ======================== Route ========================

export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token || !isAdminFromToken(token)) {
    console.log('[admin/payments] auth failed:', { hasToken: !!token });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getSupabaseClient();
  if (!client) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '10');

  try {
    const offset = (page - 1) * limit;

    const [txRes, totalRes] = await Promise.all([
      client.from('credit_transactions')
        .select('id, user_id, amount, description, type, created_at')
        .eq('type', 'purchase')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
      client.from('credit_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'purchase'),
    ]);

    console.log('[admin/payments] transactions:', {
      count: txRes.data?.length || 0,
      error: txRes.error?.message,
      total: totalRes.count,
      totalError: totalRes.error?.message,
    });

    const transactions = txRes.data || [];
    const total = totalRes.count || 0;
    const totalPages = Math.ceil(total / limit);

    // Fetch user info for each transaction
    const userIds = [...new Set(transactions.map(tx => tx.user_id))];
    const userMap: Record<string, { email: string; name: string | null }> = {};

    if (userIds.length > 0) {
      const usersRes = await client.from('users')
        .select('id, email, name')
        .in('id', userIds);

      console.log('[admin/payments] users lookup:', {
        queried: userIds.length,
        returned: usersRes.data?.length || 0,
        error: usersRes.error?.message,
      });

      for (const u of usersRes.data || []) {
        userMap[u.id] = { email: u.email, name: u.name };
      }
    }

    const payments = transactions.map(tx => {
      const user = userMap[tx.user_id];
      const desc = (tx.description || '').toLowerCase();
      let amount = tx.amount;
      let planType = 'unknown';

      for (const plan of Object.keys(PLAN_PRICES)) {
        if (desc.includes(plan)) {
          amount = PLAN_PRICES[plan];
          planType = plan;
          break;
        }
      }

      return {
        id: tx.id,
        user_id: tx.user_id,
        user_email: user?.email || '',
        user_name: user?.name || '',
        amount,
        plan_type: planType,
        description: tx.description,
        created_at: tx.created_at,
      };
    });

    // Calculate total revenue
    let totalRevenue = 0;
    const allTxRes = await client.from('credit_transactions')
      .select('description')
      .eq('type', 'purchase');

    for (const tx of allTxRes.data || []) {
      const desc = (tx.description || '').toLowerCase();
      for (const plan of Object.keys(PLAN_PRICES)) {
        if (desc.includes(plan)) {
          totalRevenue += PLAN_PRICES[plan];
          break;
        }
      }
    }

    return NextResponse.json({
      payments,
      total,
      totalPages,
      page,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalPayments: total,
    });
  } catch (err) {
    console.error('[admin/payments] failed:', err);
    return NextResponse.json({ error: 'Internal error', details: String(err) }, { status: 500 });
  }
}
