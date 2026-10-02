import { NextRequest, NextResponse } from 'next/server';
import { subscriptionServiceClient } from '@/lib/server/effective-plan';
import { sendMail } from '@/lib/server/email';

/**
 * 每日订阅到期扫描（Vercel Cron，见 vercel.json）。
 *
 * 做两件事：
 *   ① 过期回收：`current_period_end` 已过且仍在付费档的行 → status='expired'、plan_type='free'。
 *      （webhook 的 subscription.expired 只在 Creem 主动回调时才走到；周期自然结束没有回调，
 *       必须靠这里兜底，否则「到期不回收」的漏洞依旧存在。）
 *   ② 到期前提醒：周期终点在未来 3 天内的行发一封提醒邮件。
 *      幂等键 `expiry_reminder_{subscriptionId}_{YYYY-MM-DD}`，写进 behavior_events.session_id，
 *      同一周期内不会重复发送。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const REMINDER_LEAD_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 未配置密钥则一律拒绝，避免裸奔的降级入口
  const header = req.headers.get('x-vercel-cron-secret') || req.headers.get('x-cron-secret');
  if (header === secret) return true;
  const auth = req.headers.get('authorization') || '';
  return auth.toLowerCase().startsWith('bearer ') && auth.slice(7).trim() === secret;
}

function reminderHtml(planName: string, endDate: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h1 style="color:#6366f1;margin:0 0 8px;font-size:22px;">Clipop AI</h1>
      <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 12px;">
        你的 <strong>${planName}</strong> 订阅将于 <strong>${endDate}</strong> 到期。
        到期后账号会回到免费版（每日 60 积分），付费权益（高清导出、竖屏成片、AI 粗剪等）将暂停。
      </p>
      <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 20px;">
        Your <strong>${planName}</strong> subscription expires on <strong>${endDate}</strong>.
        Renew to keep HD exports, vertical clips and AI jump-cut.
      </p>
      <a href="https://www.clipopai.com/pricing"
         style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;">
        续订订阅 / Renew
      </a>
    </div>
  `;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const client = subscriptionServiceClient();
  if (!client) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // ① 过期回收
  const { data: expiredRows, error: expiredError } = await client
    .from('subscriptions')
    .select('id, user_id, plan_type, current_period_end')
    .in('plan_type', ['starter', 'pro'])
    .not('current_period_end', 'is', null)
    .lt('current_period_end', nowIso)
    .neq('status', 'expired');

  if (expiredError) {
    return NextResponse.json({ error: expiredError.message }, { status: 500 });
  }

  let downgraded = 0;
  if (expiredRows && expiredRows.length > 0) {
    const ids = expiredRows.map((row) => row.id);
    const { error } = await client
      .from('subscriptions')
      .update({ status: 'expired', plan_type: 'free', updated_at: nowIso })
      .in('id', ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    downgraded = ids.length;
    console.log('[cron/subscription-expiry] downgraded:', ids.length);
  }

  // ② 到期前提醒（未来 REMINDER_LEAD_DAYS 天内到期）
  const leadUntil = new Date(now.getTime() + REMINDER_LEAD_DAYS * DAY_MS).toISOString();
  const { data: dueRows, error: dueError } = await client
    .from('subscriptions')
    .select('id, user_id, plan_type, current_period_end')
    .in('plan_type', ['starter', 'pro'])
    .not('current_period_end', 'is', null)
    .gte('current_period_end', nowIso)
    .lte('current_period_end', leadUntil)
    .neq('status', 'expired');

  if (dueError) {
    return NextResponse.json({ error: dueError.message }, { status: 500 });
  }

  let reminded = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const row of dueRows || []) {
    const periodEnd = row.current_period_end as string;
    const dedupKey = `expiry_reminder_${row.id}_${periodEnd.slice(0, 10)}`;

    const { data: existing } = await client
      .from('behavior_events')
      .select('id')
      .eq('session_id', dedupKey)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }

    const { data: userRow } = await client
      .from('users')
      .select('email')
      .eq('id', row.user_id)
      .maybeSingle();
    const email = (userRow?.email as string | undefined) || '';
    if (!email) {
      skipped += 1;
      continue;
    }

    const planName = row.plan_type === 'pro' ? 'Pro' : 'Starter';
    const endDate = periodEnd.slice(0, 10);
    const mail = await sendMail({
      to: email,
      subject: `【Clipop AI】${planName} 订阅将于 ${endDate} 到期`,
      html: reminderHtml(planName, endDate),
    });

    if (!mail.ok) {
      failures.push(`${email}: ${mail.reason || 'send_failed'}`);
      skipped += 1;
      continue;
    }

    await client.from('behavior_events').insert({
      event_name: 'subscription_expiring',
      funnel_id: 'subscription',
      step_index: 5,
      event_data: {
        plan_id: row.plan_type,
        subscription_id: row.id,
        current_period_end: periodEnd,
        provider: mail.provider || null,
      },
      session_id: dedupKey,
      user_id: row.user_id,
      user_email: email,
      page_url: '',
      referrer: '',
      user_agent: 'server/cron',
      ip: '',
    });
    reminded += 1;
  }

  return NextResponse.json({
    ok: true,
    checkedAt: nowIso,
    downgraded,
    reminded,
    skipped,
    failures: failures.length > 0 ? failures : undefined,
  });
}