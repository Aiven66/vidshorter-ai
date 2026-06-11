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

  const useServiceKey = !!serviceKey;
  const key = serviceKey || anonKey;

  console.log('[admin/users] Supabase config:', {
    hasUrl: !!url,
    hasServiceKey: !!serviceKey,
    hasAnonKey: !!anonKey,
    using: useServiceKey ? 'service_role' : 'anon',
  });

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

// ======================== Route ========================

export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token || !isAdminFromToken(token)) {
    console.log('[admin/users] auth failed:', { hasToken: !!token });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getSupabaseClient();
  if (!client) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '10');

  // Check userId from both:
  // - Path: /api/admin/users/abc123
  // - Query string: /api/admin/users?userId=abc123
  const pathParts = url.pathname.split('/').filter(Boolean);
  const lastSegment = pathParts[pathParts.length - 1];
  const userIdFromPath = lastSegment && lastSegment !== 'users' && lastSegment !== 'page' ? lastSegment : null;
  const userId = url.searchParams.get('userId') || userIdFromPath;

  console.log('[admin/users] request:', {
    pathname: url.pathname,
    userId,
    page,
    limit,
    pathParts,
  });

  // Single user detail
  if (userId) {
    try {
      const [userRes, creditsRes, subsRes, videosRes] = await Promise.all([
        client.from('users').select('*').eq('id', userId).maybeSingle(),
        client.from('credits').select('balance').eq('user_id', userId).maybeSingle(),
        client.from('subscriptions').select('plan_type, status').eq('user_id', userId).maybeSingle(),
        client.from('videos').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);

      // Check for errors
      if (userRes.error) {
        console.error('[admin/users] detail query error:', userRes.error);
      }

      if (!userRes.data) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json({
        ...userRes.data,
        credits_balance: creditsRes.data?.balance || 0,
        subscription_plan: subsRes.data?.plan_type,
        subscription_status: subsRes.data?.status,
        videos_processed: videosRes.count || 0,
      });
    } catch (err) {
      console.error('[admin/users] detail fetch failed:', err);
      return NextResponse.json({ error: 'Internal error', details: String(err) }, { status: 500 });
    }
  }

  // User list with pagination
  try {
    const offset = (page - 1) * limit;

    console.log('[admin/users] querying users list, offset:', offset, 'limit:', limit);

    const [usersRes, totalRes] = await Promise.all([
      client.from('users')
        .select('id, email, name, role, avatar_url, google_id, created_at, is_active')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
      client.from('users').select('id', { count: 'exact', head: true }),
    ]);

    console.log('[admin/users] query result:', {
      usersCount: usersRes.data?.length || 0,
      usersError: usersRes.error?.message,
      totalCount: totalRes.count,
      totalError: totalRes.error?.message,
    });

    const users = (usersRes.data || []).map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      avatar_url: u.avatar_url,
      google_id: u.google_id,
      created_at: u.created_at,
      is_active: u.is_active,
    }));

    const total = totalRes.count || 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      users,
      total,
      totalPages,
      page,
    });
  } catch (err) {
    console.error('[admin/users] list fetch failed:', err);
    return NextResponse.json({ error: 'Internal error', details: String(err) }, { status: 500 });
  }
}
