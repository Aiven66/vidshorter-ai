import { NextRequest, NextResponse } from 'next/server';
import { subscriptionServiceClient } from '@/lib/server/effective-plan';
import { sendMail } from '@/lib/server/email';
import {
  CHECKIN_SESSION_PREFIX,
  STREAK_MILESTONE_DAYS,
  TASK_REWARD_CREDITS,
  computeStreak,
  shiftDayKey,
  utcDayKey,
} from '@/lib/retention';

/**
 * 每日订阅到期扫描（Vercel Cron，见 vercel.json）。
 *
 * 做三件事（Vercel Hobby 只允许 2 个 Cron，两条槽位已被 blog/auto-publish 与
 * subscription-expiry 占满，因此留存提醒必须并入本任务，不能新增 Cron）：
 *   ① 过期回收：`current_period_end` 已过且仍在付费档的行 → status='expired'、plan_type='free'。
 *      （webhook 的 subscription.expired 只在 Creem 主动回调时才走到；周期自然结束没有回调，
 *       必须靠这里兜底，否则「到期不回收」的漏洞依旧存在。）
 *   ② 到期前提醒：周期终点在未来 3 天内的行发一封提醒邮件。
 *      幂等键 `expiry_reminder_{subscriptionId}_{YYYY-MM-DD}`，写进 behavior_events.session_id，
 *      同一周期内不会重复发送。
 *   ③ 留存提醒（额度到账 + 断签预警）：昨天为止连续创作 ≥2 天、今天尚未签到的用户，
 *      发一封「额度已到账 + 任务待完成」的召回邮件。幂等键 `retention_nudge_{userId}_{YYYY-MM-DD}`。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const REMINDER_LEAD_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 断签召回只发给已有连续创作习惯的用户，避免对一次性用户产生骚扰。 */
const NUDGE_MIN_STREAK = 2;
/** 单次 Cron 的召回邮件上限，防止一次跑爆邮件配额。 */
const NUDGE_MAX_PER_RUN = 300;
/** 回看窗口：足够覆盖任意真实连续天数，同时限制查询体积。 */
const NUDGE_LOOKBACK_DAYS = 60;

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

/**
 * 留存召回邮件：额度到账 + 断签预警 + 任务奖励提示。
 * 三件事合并成一封，避免一天两封造成打扰。
 */
function retentionNudgeHtml(streak: number, milestoneDays: number): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h1 style="color:#6366f1;margin:0 0 8px;font-size:22px;">Clipop AI</h1>
      <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 12px;">
        你已连续创作 <strong>${streak}</strong> 天，今天的签到还没完成 —— 别让纪录断在这里。
        今日免费额度已到账，完成「签到 / 生成 1 条 / 导出 1 条」三项任务即可领取
        <strong>${TASK_REWARD_CREDITS} 积分</strong>；连续 ${milestoneDays} 天还有额外奖励。
      </p>
      <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 20px;">
        You're on a <strong>${streak}</strong>-day streak. Today's credits are in —
        finish 3 quick tasks to claim <strong>${TASK_REWARD_CREDITS} bonus credits</strong>.
      </p>
      <a href="https://www.clipopai.com/dashboard"
         style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;">
        继续创作 / Keep creating
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

  // ③ 留存召回（额度到账 + 断签预警）
  const nudged = await runRetentionNudges(client);

  return NextResponse.json({
    ok: true,
    checkedAt: nowIso,
    downgraded,
    reminded,
    nudged: nudged.sent,
    nudgeSkipped: nudged.skipped,
    skipped,
    failures: failures.length > 0 ? failures : undefined,
  });
}

type CronClient = NonNullable<ReturnType<typeof subscriptionServiceClient>>;

/**
 * 断签召回：找出「连续创作进行中、但今天还没签到」的用户，发召回邮件。
 *
 * 判定口径与 `/api/retention/daily` 完全一致（同一套纯函数），避免 UI 说 5 天、
 * 邮件说 3 天这类口径漂移。幂等键落在 behavior_events.session_id。
 */
async function runRetentionNudges(client: CronClient): Promise<{ sent: number; skipped: number }> {
  const today = utcDayKey();
  const since = `${shiftDayKey(today, -NUDGE_LOOKBACK_DAYS)}T00:00:00.000Z`;

  const { data, error } = await client
    .from('behavior_events')
    .select('user_id, session_id')
    .eq('event_name', 'daily_checkin')
    .gte('created_at', since)
    .limit(50000);

  if (error) {
    console.warn('[cron/retention] checkin query failed:', error.message);
    return { sent: 0, skipped: 0 };
  }

  const signedByUser = new Map<string, Set<string>>();
  for (const row of data || []) {
    const uid = String((row as { user_id?: string }).user_id || '');
    const sid = String((row as { session_id?: string }).session_id || '');
    if (!uid || !sid.startsWith(`${CHECKIN_SESSION_PREFIX}${uid}_`)) continue;
    const day = sid.slice(`${CHECKIN_SESSION_PREFIX}${uid}_`.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    let set = signedByUser.get(uid);
    if (!set) {
      set = new Set<string>();
      signedByUser.set(uid, set);
    }
    set.add(day);
  }

  let sent = 0;
  let skipped = 0;

  for (const [userId, signedDays] of signedByUser) {
    if (sent >= NUDGE_MAX_PER_RUN) break;
    // 今天已签到 → 无需召回
    if (signedDays.has(today)) continue;
    const streak = computeStreak(signedDays, today);
    // 只有「已在养成习惯」的用户才提醒，避免骚扰一次性用户
    if (streak < NUDGE_MIN_STREAK) continue;

    const dedupKey = `retention_nudge_${userId}_${today}`;
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
      .eq('id', userId)
      .maybeSingle();
    const email = (userRow?.email as string | undefined) || '';
    if (!email) {
      skipped += 1;
      continue;
    }

    const mail = await sendMail({
      to: email,
      subject: `【Clipop AI】你已连续创作 ${streak} 天，今天还没签到`,
      html: retentionNudgeHtml(streak, STREAK_MILESTONE_DAYS),
    });
    if (!mail.ok) {
      skipped += 1;
      continue;
    }

    await client.from('behavior_events').insert({
      event_name: 'retention_nudge_sent',
      funnel_id: 'retention',
      step_index: 2,
      event_data: { streak, day: today, provider: mail.provider || null },
      session_id: dedupKey,
      user_id: userId,
      user_email: email,
      page_url: '',
      referrer: '',
      user_agent: 'server/cron',
      ip: '',
    });
    sent += 1;
  }

  console.log('[cron/retention] nudges sent:', sent, 'skipped:', skipped);
  return { sent, skipped };
}