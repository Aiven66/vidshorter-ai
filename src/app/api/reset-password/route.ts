import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

export const runtime = 'nodejs';

const COOKIE_NAME = 'clipop_email_otp';
const MAX_ATTEMPTS = 5;

function base64url(input: string) {
  return Buffer.from(input).toString('base64url');
}

function fromBase64url(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

function sign(payloadB64: string, secret: string) {
  return createHmac('sha256', secret).update(payloadB64).digest('hex');
}

function getOtpSecret() {
  const explicit = process.env.EMAIL_OTP_SECRET || process.env.NEXTAUTH_SECRET;
  if (explicit) return explicit;

  const providerSeed = process.env.RESEND_API_KEY || process.env.SMTP_PASS || process.env.GMAIL_PASS;
  if (!providerSeed) return '';

  return createHash('sha256')
    .update(`clipop_email_otp:${providerSeed}`)
    .digest('hex');
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_TOKEN ||
    '';

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function verifyCode(request: NextRequest, email: string, inputCode: string): {
  ok: boolean;
  error?: string;
  nextCookie?: string;
} {
  const host = request.headers.get('host') || '';
  const isLocal = host.includes('127.0.0.1') || host.includes('localhost');
  const secret = getOtpSecret() || ((process.env.NODE_ENV !== 'production' || isLocal) ? 'dev' : '');
  if (!secret) return { ok: false, error: 'Verification service is not configured.' };

  const cookie = request.cookies.get(COOKIE_NAME)?.value || '';
  const [payloadB64, sig] = cookie.split('.');
  if (!payloadB64 || !sig) {
    return { ok: false, error: 'No verification code found. Please request a new code.' };
  }

  const expected = sign(payloadB64, secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'Invalid verification code. Please request a new one.' };
  }

  let payload: { email: string; expiresAt: number; attempts: number; codeHash: string } | null = null;
  try {
    payload = JSON.parse(fromBase64url(payloadB64));
  } catch {
    payload = null;
  }

  if (!payload || payload.email !== email) {
    return { ok: false, error: 'Invalid verification code. Please request a new one.' };
  }

  if (payload.expiresAt < Date.now()) {
    return { ok: false, error: 'Code has expired. Please request a new one.', nextCookie: `${COOKIE_NAME}=; Path=/; Max-Age=0` };
  }

  const nextAttempts = (payload.attempts || 0) + 1;
  if (nextAttempts > MAX_ATTEMPTS) {
    return { ok: false, error: 'Too many attempts. Please request a new code.', nextCookie: `${COOKIE_NAME}=; Path=/; Max-Age=0` };
  }

  const ok = sha256(`${inputCode}:${secret}`) === payload.codeHash;
  if (!ok) {
    const nextPayload = { ...payload, attempts: nextAttempts };
    const nextPayloadB64 = base64url(JSON.stringify(nextPayload));
    const nextToken = `${nextPayloadB64}.${sign(nextPayloadB64, secret)}`;
    const maxAge = Math.max(1, Math.floor((payload.expiresAt - Date.now()) / 1000));
    return {
      ok: false,
      error: `Incorrect code. ${MAX_ATTEMPTS - nextAttempts} attempts remaining.`,
      nextCookie: `${COOKIE_NAME}=${nextToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    };
  }

  return { ok: true, nextCookie: `${COOKIE_NAME}=; Path=/; Max-Age=0` };
}

async function findAuthUserByEmail(adminClient: any, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const found = data?.users?.find((user: any) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (!data?.users || data.users.length < 1000) break;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'Invalid email address' }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return Response.json({ error: 'Please enter the 6-digit verification code.' }, { status: 400 });
  }
  if (password.length < 6) {
    return Response.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }

  const verified = verifyCode(request, email, code);
  if (!verified.ok) {
    const res = Response.json({ error: verified.error || 'Invalid verification code.' }, { status: 400 });
    if (verified.nextCookie) res.headers.append('Set-Cookie', verified.nextCookie);
    return res;
  }

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return Response.json({
      error: 'Password reset is not configured. Please add SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables.',
    }, { status: 500 });
  }

  try {
    const authUser = await findAuthUserByEmail(adminClient, email);
    if (!authUser?.id) {
      const res = Response.json({ error: 'No account found for this email.' }, { status: 404 });
      if (verified.nextCookie) res.headers.append('Set-Cookie', verified.nextCookie);
      return res;
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
    });
    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 400 });
    }

    await adminClient.from('users').upsert({
      id: authUser.id,
      email,
      name: authUser.user_metadata?.name || email.split('@')[0],
      role: 'user',
      google_id: authUser.app_metadata?.provider === 'google' ? authUser.id : null,
    }, { onConflict: 'id' });

    const res = Response.json({ success: true });
    if (verified.nextCookie) res.headers.append('Set-Cookie', verified.nextCookie);
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reset password.';
    return Response.json({ error: message }, { status: 500 });
  }
}
