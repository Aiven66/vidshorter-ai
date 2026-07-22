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
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ======================== Route - GET /api/admin/users/:userId ========================

export async function GET(request: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!token || !isAdminFromToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getSupabaseClient();
  if (!client) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { userId } = await ctx.params;
  console.log('[admin/users/:userId] resolved userId:', JSON.stringify(userId), 'typeof:', typeof userId);

  if (!userId || userId === 'undefined' || userId.trim() === '') {
    console.error('[admin/users/:userId] Invalid userId:', userId);
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  try {
    const [userRes, creditsRes, subsRes, videosRes] = await Promise.all([
      client.from('users').select('*').eq('id', userId).maybeSingle(),
      client.from('credits').select('balance').eq('user_id', userId).maybeSingle(),
      client.from('subscriptions').select('plan_type, status').eq('user_id', userId).maybeSingle(),
      client.from('videos').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);

    if (userRes.error) {
      console.error('[admin/users/:userId] Supabase error:', userRes.error);
      return NextResponse.json({ error: userRes.error.message }, { status: 500 });
    }

    if (!userRes.data) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userRes.data;
    const response = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar_url: user.avatar_url,
      google_id: user.google_id,
      is_active: user.is_active ?? true,
      created_at: user.created_at,
      updated_at: user.updated_at,
      credits_balance: creditsRes.data?.balance || 0,
      subscription_plan: subsRes.data?.plan_type,
      subscription_status: subsRes.data?.status,
      videos_processed: videosRes.count || 0,
    };

    console.log('[admin/users/:userId] returning:', response.email);
    return NextResponse.json(response);
  } catch (err) {
    console.error('[admin/users/:userId] failed:', err);
    return NextResponse.json({ error: 'Internal error', details: String(err) }, { status: 500 });
  }
}
