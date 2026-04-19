import { NextRequest } from 'next/server';

// In-memory store for demo mode (in production, use Redis or DB)
const codeStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanupExpired() {
  const now = Date.now();
  for (const [key, val] of codeStore.entries()) {
    if (val.expiresAt < now) codeStore.delete(key);
  }
}

/* ── Send email via Resend HTTP API (no extra npm package, just fetch) ── */
async function sendViaResend(to: string, code: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const fromDomain = process.env.RESEND_FROM || 'onboarding@resend.dev';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `VidShorter AI <${fromDomain}>`,
        to: [to],
        subject: '【VidShorter AI】邮箱验证码',
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fff;">
            <div style="text-align:center;margin-bottom:24px;">
              <h1 style="color:#6366f1;margin:0;font-size:24px;">VidShorter AI</h1>
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
              如果你没有注册 VidShorter AI，请忽略此邮件。
            </p>
          </div>
        `,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log('[Resend] Email sent successfully, id:', data.id);
      return true;
    }
    const errData = await res.json().catch(() => ({}));
    console.warn('[Resend] Send failed:', res.status, errData);
    return false;
  } catch (err) {
    console.warn('[Resend] Network error:', err);
    return false;
  }
}

/* ── Send email via SMTP (nodemailer) ── */
async function sendViaSMTP(to: string, code: string): Promise<boolean> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) return false;

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: `"VidShorter AI" <${smtpFrom}>`,
      to,
      subject: '【VidShorter AI】邮箱验证码',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
          <h2 style="color:#6366f1;">VidShorter AI</h2>
          <p>你的验证码是：</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#6366f1;padding:16px 0;">
            ${code}
          </div>
          <p style="color:#888;">验证码 5 分钟内有效，请勿分享给他人。</p>
        </div>
      `,
    });
    console.log('[SMTP] Email sent to', to);
    return true;
  } catch (err) {
    console.warn('[SMTP] Send failed, falling back to demo mode:', err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'Invalid email address' }, { status: 400 });
  }

  cleanupExpired();

  // Rate limit: 1 code per 60s
  const existing = codeStore.get(email);
  if (existing && existing.expiresAt - Date.now() > 4 * 60 * 1000) {
    return Response.json({ error: 'Please wait before requesting another code' }, { status: 429 });
  }

  const code = generateCode();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  codeStore.set(email, { code, expiresAt, attempts: 0 });

  // ── Priority 1: Resend API (free, no extra packages) ──
  const sentViaResend = await sendViaResend(email, code);
  if (sentViaResend) {
    return Response.json({ success: true, demo: false, provider: 'resend' });
  }

  // ── Priority 2: SMTP (nodemailer) ──
  const sentViaSMTP = await sendViaSMTP(email, code);
  if (sentViaSMTP) {
    return Response.json({ success: true, demo: false, provider: 'smtp' });
  }

  // ── Priority 3: Demo mode – return code in response (shown in UI) ──
  console.log(`[DEMO] Verification code for ${email}: ${code}`);
  return Response.json({ success: true, demo: true, code });
}

export async function PUT(request: NextRequest) {
  // Verify code endpoint
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const inputCode = typeof body.code === 'string' ? body.code.trim() : '';

  if (!email || !inputCode) {
    return Response.json({ error: 'Email and code are required' }, { status: 400 });
  }

  cleanupExpired();
  const stored = codeStore.get(email);

  if (!stored) {
    return Response.json({ error: 'No verification code found. Please request a new one.' }, { status: 400 });
  }

  if (stored.expiresAt < Date.now()) {
    codeStore.delete(email);
    return Response.json({ error: 'Code has expired. Please request a new one.' }, { status: 400 });
  }

  stored.attempts += 1;
  if (stored.attempts > 5) {
    codeStore.delete(email);
    return Response.json({ error: 'Too many attempts. Please request a new code.' }, { status: 400 });
  }

  if (stored.code !== inputCode) {
    return Response.json({ error: `Incorrect code. ${5 - stored.attempts} attempts remaining.` }, { status: 400 });
  }

  // Code verified - remove it
  codeStore.delete(email);
  return Response.json({ success: true });
}
