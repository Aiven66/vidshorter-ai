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

// ======================== Payments API ========================

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
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '10');

  try {
    const offset = (page - 1) * limit;

    // Get all purchase transactions
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

    const transactions = txRes.data || [];
    const total = totalRes.count || 0;
    const totalPages = Math.ceil(total / limit);

    // Fetch user info for each transaction
    const paymentsWithUser = await Promise.all(
      transactions.map(async (tx) => {
        const userRes = await client.from('users')
          .select('email, name, location')
          .eq('id', tx.user_id)
          .maybeSingle();

        // Calculate amount from description or use fixed price
        let amount = tx.amount;
        if (tx.description) {
          const desc = tx.description.toLowerCase();
          for (const plan of Object.keys(PLAN_PRICES)) {
            if (desc.includes(plan)) {
              amount = PLAN_PRICES[plan];
              break;
            }
          }
        }

        return {
          id: tx.id,
          user_id: tx.user_id,
          user_email: userRes.data?.email || '',
          user_name: userRes.data?.name || '',
          user_location: userRes.data?.location || null,
          amount,
          plan_type: extractPlanFromDescription(tx.description || ''),
          description: tx.description,
          created_at: tx.created_at,
        };
      })
    );

    // Calculate total revenue
    const allTxRes = await client.from('credit_transactions')
      .select('description')
      .eq('type', 'purchase');
    let totalRevenue = 0;
    for (const tx of allTxRes.data || []) {
      const desc = tx.description.toLowerCase();
      for (const plan of Object.keys(PLAN_PRICES)) {
        if (desc.includes(plan)) {
          totalRevenue += PLAN_PRICES[plan];
          break;
        }
      }
    }

    return NextResponse.json({
      payments: paymentsWithUser,
      total,
      totalPages,
      page,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalPayments: total,
    });
  } catch (err) {
    console.error('[admin/payments] failed:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function extractPlanFromDescription(desc: string): string {
  const lowerDesc = desc.toLowerCase();
  if (lowerDesc.includes('pro')) return 'pro';
  if (lowerDesc.includes('starter')) return 'starter';
  return 'unknown';
}
