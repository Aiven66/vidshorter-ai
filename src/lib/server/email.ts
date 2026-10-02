/**
 * 事务邮件统一发送口（server 侧）。
 *
 * 提供方顺序与 `send-verification-code` 保持一致：Resend HTTP API 优先，SMTP(nodemailer) 兜底。
 * 未配置任何通道时返回 `{ ok: false, reason }`，**绝不抛错**——调用方（cron）按 best-effort 处理，
 * 单个用户发信失败不能中断整批扫描。
 */

export interface OutboundMail {
  to: string;
  subject: string;
  html: string;
}

export interface MailResult {
  ok: boolean;
  provider?: 'resend' | 'smtp';
  reason?: string;
}

async function sendViaResend(mail: OutboundMail): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: 'missing_resend_api_key' };

  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Clipop AI <${from}>`,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
      }),
    });

    if (res.ok) return { ok: true, provider: 'resend' };
    const errData = await res.json().catch(() => ({}));
    return {
      ok: false,
      provider: 'resend',
      reason: typeof errData?.message === 'string' ? errData.message : `resend_http_${res.status}`,
    };
  } catch (err) {
    console.warn('[email] Resend network error:', err instanceof Error ? err.message : err);
    return { ok: false, provider: 'resend', reason: 'resend_network_error' };
  }
}

async function sendViaSmtp(mail: OutboundMail): Promise<MailResult> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;

  let host = process.env.SMTP_HOST;
  let user = process.env.SMTP_USER;
  let pass = process.env.SMTP_PASS;
  let port = Number(process.env.SMTP_PORT || 587);
  let secure = process.env.SMTP_SECURE === 'true';

  if (gmailUser && gmailPass) {
    host = 'smtp.gmail.com';
    user = gmailUser;
    pass = gmailPass;
    port = 587;
    secure = false; // Gmail 走 587 STARTTLS
  }

  if (!host || !user || !pass) return { ok: false, reason: 'missing_smtp_config' };

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `Clipop AI <${user}>`,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
    });
    return { ok: true, provider: 'smtp' };
  } catch (err) {
    console.warn('[email] SMTP send failed:', err instanceof Error ? err.message : err);
    return { ok: false, provider: 'smtp', reason: 'smtp_send_error' };
  }
}

/** 依次尝试已配置的通道，任一成功即返回；全部失败时返回最后一个失败原因。 */
export async function sendMail(mail: OutboundMail): Promise<MailResult> {
  const attempts: Array<() => Promise<MailResult>> = [];
  if (process.env.RESEND_API_KEY) attempts.push(() => sendViaResend(mail));
  attempts.push(() => sendViaSmtp(mail));

  let last: MailResult = { ok: false, reason: 'no_mail_channel' };
  for (const attempt of attempts) {
    const res = await attempt();
    if (res.ok) return res;
    last = res;
  }
  return last;
}