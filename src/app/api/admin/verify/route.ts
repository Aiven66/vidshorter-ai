import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const VERIFIED_ADMINS = new Set([
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

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token) {
    return NextResponse.json({ isAdmin: false, error: 'No token' }, { status: 200 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY || '';
  const key = serviceKey || anonKey;

  if (!url || !key) {
    const payload = decodeJwtPayload(token);
    const email = typeof payload?.email === 'string' ? payload.email : '';
    const role = typeof payload?.role === 'string' ? payload.role : '';
    const isAdmin = role === 'admin' || (email && VERIFIED_ADMINS.has(email.toLowerCase()));
    return NextResponse.json({ isAdmin }, { status: 200 });
  }

  try {
    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload = decodeJwtPayload(token);
    const email = typeof payload?.email === 'string' ? payload.email : '';
    const sub = typeof payload?.sub === 'string' ? payload.sub : '';

    if (!email && !sub) {
      return NextResponse.json({ isAdmin: false }, { status: 200 });
    }

    let dbEmail: string | null = null;
    let dbRole: string | null = null;

    if (sub) {
      const { data } = await client
        .from('users')
        .select('email, role')
        .eq('id', sub)
        .maybeSingle();
      if (data) {
        dbEmail = data.email;
        dbRole = data.role;
      }
    }

    const finalEmail = dbEmail || email;
    const finalRole = dbRole || (typeof payload?.role === 'string' ? payload.role : null);

    const isAdmin =
      finalRole === 'admin' ||
      (finalEmail && VERIFIED_ADMINS.has(finalEmail.toLowerCase()));

    return NextResponse.json({ isAdmin }, { status: 200 });
  } catch {
    const payload = decodeJwtPayload(token);
    const email = typeof payload?.email === 'string' ? payload.email : '';
    const role = typeof payload?.role === 'string' ? payload.role : '';
    const isAdmin = role === 'admin' || (email && VERIFIED_ADMINS.has(email.toLowerCase()));
    return NextResponse.json({ isAdmin }, { status: 200 });
  }
}
