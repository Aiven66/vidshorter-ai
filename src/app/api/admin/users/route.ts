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

// ======================== Route - GET /api/admin/users ========================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token || !isAdminFromToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getSupabaseClient();
  if (!client) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const offset = (page - 1) * limit;

  try {
    const [usersRes, totalRes] = await Promise.all([
      client.from('users')
        .select('id, email, name, role, avatar_url, google_id, created_at, is_active')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
      client.from('users').select('id', { count: 'exact', head: true }),
    ]);

    console.log('[admin/users] query:', {
      page, limit, dataLength: usersRes.data?.length, total: totalRes.count,
      usersError: usersRes.error?.message, totalError: totalRes.error?.message,
    });

    if (usersRes.error) {
      return NextResponse.json({ error: usersRes.error.message }, { status: 500 });
    }

    const users = (usersRes.data || []).map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      avatar_url: u.avatar_url,
      google_id: u.google_id,
      created_at: u.created_at,
      is_active: u.is_active ?? true,
    }));

    const total = totalRes.count || 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({ users, total, totalPages, page });
  } catch (err) {
    console.error('[admin/users] list failed:', err);
    return NextResponse.json({ error: 'Internal error', details: String(err) }, { status: 500 });
  }
}
