import { NextRequest } from 'next/server';
import { createHmac, createHash, timingSafeEqual } from 'crypto';

export const runtime = 'nodejs';

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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

function getSecret() {
  const explicit = process.env.EMAIL_OTP_SECRET || process.env.NEXTAUTH_SECRET;
  if (explicit) return explicit;

  const providerSeed = process.env.RESEND_API_KEY || process.env.SMTP_PASS || process.env.GMAIL_PASS;
  if (!providerSeed) return '';

  return createHash('sha256')
    .update(`clipop_email_otp:${providerSeed}`)
    .digest('hex');
}

/* ── Send email via Resend HTTP API ── */
async function sendViaResend(to: string, code: string): Promise<{ ok: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[Resend] Skipping, no API key');
    return { ok: false, reason: 'missing_resend_api_key' };
  }

  const fromDomain = process.env.RESEND_FROM || 'onboarding@resend.dev';

  try {
    console.log('[Resend] Sending email to:', to);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Clipop AI <${fromDomain}>`,
        to: [to],
        subject: '【Clipop AI】邮箱验证码',
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fff;">
            <div style="text-align:center;margin-bottom:24px;">
              <h1 style="color:#6366f1;margin:0;font-size:24px;">Clipop AI</h1>
              <p style="color:#6b7280;margin:4px 0 0;">验证你的邮箱地址</p>
            </div>
            <div style="background:#f9fafb;border-radius:12px;padding:32px;text-align:center;">
              <p style="color:#374151;margin:0 0 16px;font-size:15px;">你的验证码是：</p>
              <div style="font-size:42px;font-weight:700;letter-spacing:12px;color:#6366f1;padding:16px 0;font-family:monospace;">
                ${code}
              </div>
              <p style="color:#9ca3af;margin:16px 0 0;font-size:13px;">验证码 5 分钟内有效，请勿分享给他人。</p>
            </div>
            <p style="color:#d1d5db;font-size:12px;text-align:center;margin-top:24px;">
              如果你没有注册 Clipop AI，请忽略此邮件。
            </p>
          </div>
        `,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log('[Resend] Email sent successfully, id:', data.id);
      return { ok: true };
    }
    const errData = await res.json().catch(() => ({}));
    console.warn('[Resend] Send failed:', res.status, errData);
    return {
      ok: false,
      reason: typeof errData?.message === 'string' ? errData.message : `resend_http_${res.status}`,
    };
  } catch (err) {
    console.warn('[Resend] Network error:', err);
    return { ok: false, reason: 'resend_network_error' };
  }
}

/* ── Send email via SMTP (nodemailer) ── */
async function sendViaSMTP(to: string, code: string): Promise<{ ok: boolean; reason?: string }> {
  console.log('[SMTP] Starting sendViaSMTP...');
  
  // Check for Gmail configuration first
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;
  
  let smtpHost = process.env.SMTP_HOST;
  let smtpUser = process.env.SMTP_USER;
  let smtpPass = process.env.SMTP_PASS;
  let smtpPort = Number(process.env.SMTP_PORT || 587);
  let smtpSecure = process.env.SMTP_SECURE === 'true';
  
  // Auto-configure for Gmail if Gmail credentials are provided
  if (gmailUser && gmailPass) {
    smtpHost = 'smtp.gmail.com';
    smtpUser = gmailUser;
    smtpPass = gmailPass;
    smtpPort = 587;
    smtpSecure = false; // Gmail uses STARTTLS on port 587
    console.log('[SMTP] Using Gmail configuration for:', gmailUser);
  }

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('[SMTP] Missing configuration');
    return { ok: false, reason: 'missing_smtp_config' };
  }

  console.log('[SMTP] Configuration:', { host: smtpHost, port: smtpPort, user: smtpUser, secure: smtpSecure });

  try {
    const nodemailer = await import('nodemailer');
    console.log('[SMTP] Nodemailer imported');
    
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      requireTLS: true, // Require TLS for Gmail
      auth: { user: smtpUser, pass: smtpPass },
      tls: {
        rejectUnauthorized: false // Accept self-signed certificates
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    console.log('[SMTP] Transporter created, verifying connection...');
    
    // Verify connection
    await transporter.verify();
    console.log('[SMTP] Connection verified successfully');

    console.log('[SMTP] Sending email to:', to);
    
    const result = await transporter.sendMail({
      from: `"Clipop AI" <${smtpUser}>`,
      to,
      subject: '【Clipop AI】邮箱验证码',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fff;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#6366f1;margin:0;font-size:24px;">Clipop AI</h1>
            <p style="color:#6b7280;margin:4px 0 0;">验证你的邮箱地址</p>
          </div>
          <div style="background:#f9fafb;border-radius:12px;padding:32px;text-align:center;">
            <p style="color:#374151;margin:0 0 16px;font-size:15px;">你的验证码是：</p>
            <div style="font-size:42px;font-weight:700;letter-spacing:12px;color:#6366f1;padding:16px 0;font-family:monospace;">
              ${code}
            </div>
            <p style="color:#9ca3af;margin:16px 0 0;font-size:13px;">验证码 5 分钟内有效，请勿分享给他人。</p>
          </div>
          <p style="color:#d1d5db;font-size:12px;text-align:center;margin-top:24px;">
            如果你没有注册 Clipop AI，请忽略此邮件。
          </p>
        </div>
      `,
    });

    console.log('[SMTP] Email sent successfully! MessageId:', result.messageId);
    return { ok: true };
  } catch (err: any) {
    console.error('[SMTP] Send failed with error:', err);
    console.error('[SMTP] Error details:', {
      message: err.message,
      code: err.code,
      command: err.command,
      response: err.response,
      responseCode: err.responseCode
    });
    return { ok: false, reason: `smtp_error: ${err.message}` };
  }
}

export async function POST(request: NextRequest) {
  console.log('=== [send-verification-code] POST request received ===');
  
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const host = request.headers.get('host') || '';
  const isDesktop = host.includes('127.0.0.1') || host.includes('localhost');

  console.log('[send-verification-code] Email:', email, 'Host:', host, 'isDesktop:', isDesktop);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.log('[send-verification-code] Invalid email');
    return Response.json({ error: 'Invalid email address' }, { status: 400 });
  }

  const secret = getSecret();
  console.log('[send-verification-code] Secret available:', !!secret);

  const code = generateCode();
  console.log('[send-verification-code] Generated code:', code);
  const expiresAt = Date.now() + 5 * 60 * 1000;

  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || process.env.SERVER_URL || 'https://clipopai.vercel.app';

  if (isDesktop && SERVER_URL && !SERVER_URL.includes('127.0.0.1') && !SERVER_URL.includes('localhost')) {
    console.log('[send-verification-code] Desktop mode, proxying to server:', SERVER_URL);
    try {
      const proxyRes = await fetch(`${SERVER_URL}/api/send-verification-code`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Desktop-Proxy': 'true',
        },
        body: JSON.stringify({ email }),
      });
      const proxyData = await proxyRes.json();
      
      if (proxyRes.ok) {
        console.log('[send-verification-code] Proxy request successful');
        const serverCode = proxyData.code || code;
        const serverExpiresAt = proxyData.expiresAt || expiresAt;
        const payload = {
          email,
          expiresAt: serverExpiresAt,
          attempts: 0,
          codeHash: sha256(`${serverCode}:${secret || 'dev'}`),
        };
        const payloadB64 = base64url(JSON.stringify(payload));
        const token = `${payloadB64}.${sign(payloadB64, secret || 'dev')}`;
        const res = Response.json({ success: true, provider: 'proxy', code: serverCode });
        res.headers.append('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`);
        return res;
      } else {
        console.log('[send-verification-code] Proxy request failed:', proxyData);
      }
    } catch (proxyError) {
      console.log('[send-verification-code] Proxy request error:', proxyError);
    }
  }

  if (!secret && process.env.NODE_ENV === 'production' && !isDesktop) {
    console.log('[send-verification-code] Verification service not configured');
    return Response.json({ error: 'Verification service not configured' }, { status: 500 });
  }

  const prefer = (process.env.EMAIL_PROVIDER || '').toLowerCase();
  const hasGmailConfig = !!(process.env.GMAIL_USER && process.env.GMAIL_PASS);
  const order: Array<'smtp' | 'resend'> = prefer === 'smtp' || hasGmailConfig ? ['smtp', 'resend'] : ['resend', 'smtp'];

  let sentResult: { ok: boolean; reason?: string } | undefined;

  for (const p of order) {
    if (p === 'smtp') {
      sentResult = await sendViaSMTP(email, code);
    } else {
      sentResult = await sendViaResend(email, code);
    }

    if (sentResult.ok) break;
  }

  const isProxyRequest = request.headers.get('X-Desktop-Proxy') === 'true';

  if (sentResult?.ok) {
    const payload = {
      email,
      expiresAt,
      attempts: 0,
      codeHash: sha256(`${code}:${secret}`),
    };
    const payloadB64 = base64url(JSON.stringify(payload));
    const token = `${payloadB64}.${sign(payloadB64, secret)}`;
    const res = Response.json({ success: true, code: isProxyRequest ? code : undefined, expiresAt });
    res.headers.append(
      'Set-Cookie',
      `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    );
    return res;
  }

  if (process.env.NODE_ENV !== 'production' || isDesktop) {
    const payload = {
      email,
      expiresAt,
      attempts: 0,
      codeHash: sha256(`${code}:${secret || 'dev'}`),
    };
    const payloadB64 = base64url(JSON.stringify(payload));
    const token = `${payloadB64}.${sign(payloadB64, secret || 'dev')}`;
    const res = Response.json({ success: true, provider: 'demo', code });
    res.headers.append('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`);
    return res;
  }

  console.log('[send-verification-code] All providers failed');
  const errorMessage = sentResult?.reason ? `Failed to send verification code: ${sentResult.reason}` : 'Failed to send verification code';
  return Response.json({ error: errorMessage }, { status: 500 });
}

export async function PUT(request: NextRequest) {
  console.log('=== [send-verification-code] PUT request (verify) received ===');
  
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const inputCode = typeof body.code === 'string' ? body.code.trim() : '';
  const host = request.headers.get('host') || '';
  const isDesktop = host.includes('127.0.0.1') || host.includes('localhost');

  console.log('[verify-code] Email:', email, 'Code:', inputCode, 'Host:', host, 'isDesktop:', isDesktop);

  if (!email || !inputCode) {
    return Response.json({ error: 'Email and code are required' }, { status: 400 });
  }

  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || process.env.SERVER_URL || 'https://clipopai.vercel.app';

  if (isDesktop && SERVER_URL && !SERVER_URL.includes('127.0.0.1') && !SERVER_URL.includes('localhost')) {
    console.log('[verify-code] Desktop mode, proxying verification to server:', SERVER_URL);
    try {
      const proxyRes = await fetch(`${SERVER_URL}/api/send-verification-code`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: inputCode }),
      });
      const proxyData = await proxyRes.json();
      
      if (proxyRes.ok) {
        console.log('[verify-code] Proxy verification successful');
        return Response.json({ success: true });
      } else {
        console.log('[verify-code] Proxy verification failed:', proxyData);
      }
    } catch (proxyError) {
      console.log('[verify-code] Proxy verification error:', proxyError);
    }
  }

  const secret = getSecret() || ((process.env.NODE_ENV !== 'production' || isDesktop) ? 'dev' : '');
  if (!secret) return Response.json({ error: 'Verification service not configured' }, { status: 500 });

  const cookie = request.cookies.get(COOKIE_NAME)?.value || '';
  const [payloadB64, sig] = cookie.split('.');
  if (!payloadB64 || !sig) {
    return Response.json({ error: 'No verification code found. Please request a new code.' }, { status: 400 });
  }

  const expected = sign(payloadB64, secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: 'Invalid verification code. Please request a new one.' }, { status: 400 });
  }

  let payload: { email: string; expiresAt: number; attempts: number; codeHash: string } | null = null;
  try {
    payload = JSON.parse(fromBase64url(payloadB64));
  } catch {
    payload = null;
  }
  if (!payload || payload.email !== email) {
    return Response.json({ error: 'Invalid verification code. Please request a new one.' }, { status: 400 });
  }

  if (payload.expiresAt < Date.now()) {
    const res = Response.json({ error: 'Code has expired. Please request a new one.' }, { status: 400 });
    res.headers.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0`);
    return res;
  }

  const nextAttempts = (payload.attempts || 0) + 1;
  if (nextAttempts > MAX_ATTEMPTS) {
    const res = Response.json({ error: 'Too many attempts. Please request a new code.' }, { status: 400 });
    res.headers.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0`);
    return res;
  }

  const ok = sha256(`${inputCode}:${secret}`) === payload.codeHash;
  if (!ok) {
    const nextPayload = { ...payload, attempts: nextAttempts };
    const nextPayloadB64 = base64url(JSON.stringify(nextPayload));
    const nextToken = `${nextPayloadB64}.${sign(nextPayloadB64, secret)}`;
    const res = Response.json({ error: `Incorrect code. ${MAX_ATTEMPTS - nextAttempts} attempts remaining.` }, { status: 400 });
    res.headers.append(
      'Set-Cookie',
      `${COOKIE_NAME}=${nextToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(1, Math.floor((payload.expiresAt - Date.now()) / 1000))}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    );
    return res;
  }

  const res = Response.json({ success: true });
  res.headers.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0`);
  return res;
}
