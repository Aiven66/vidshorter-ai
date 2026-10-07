import { createClient } from '@supabase/supabase-js';
import {
  CHECKIN_SESSION_PREFIX,
  RETENTION_TASKS,
  TASK_REWARD_CREDITS,
  TASK_REWARD_MARKER,
  TASK_REWARD_TX_TYPE,
  checkinSessionId,
  computeStreak,
  daysToNextMilestone,
  shiftDayKey,
  streakMilestoneCredits,
  taskRewardDescription,
  utcDayKey,
  utcDayStartIso,
  type RetentionStatus,
  type RetentionTask,
  type RetentionTaskId,
} from '@/lib/retention';

/**
 * 留存引擎 —— 服务端实现（每日任务 / 连续签到 / 奖励发放）。
 *
 * 数据来源全部为既有表，**不新建表**（本仓库无法执行 DDL）：
 *   - 签到：`behavior_events.session_id = daily_checkin_{userId}_{YYYY-MM-DD}`（整串即幂等键）
 *   - 创作：`credit_transactions.type='video_process'` 当日计数
 *   - 导出：`behavior_events.event_name='clip_download'` 当日计数
 *   - 领取：`credit_transactions.type='task_reward'` 当日是否存在（幂等），description 带标记
 *
 * 所有查询都带 `user_id` 精确过滤，绝不跨用户聚合。
 */

/** 签到回放窗口：Streak 只需回看这一段即可覆盖任意真实连续天数。 */
const STREAK_LOOKBACK_DAYS = 400;

export function retentionServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

type ServiceClient = NonNullable<ReturnType<typeof retentionServiceClient>>;

/** 某用户已签到的 UTC 日键集合。 */
async function loadSignedDays(client: ServiceClient, userId: string): Promise<Set<string>> {
  const since = `${shiftDayKey(utcDayKey(), -STREAK_LOOKBACK_DAYS)}T00:00:00.000Z`;
  const days = new Set<string>();
  const { data } = await client
    .from('behavior_events')
    .select('session_id')
    .like('session_id', `${CHECKIN_SESSION_PREFIX}${userId}_%`)
    .gte('created_at', since);
  for (const row of data || []) {
    const sid = String((row as { session_id?: string }).session_id || '');
    const day = sid.slice(`${CHECKIN_SESSION_PREFIX}${userId}_`.length);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) days.add(day);
  }
  return days;
}

/** 当日某类流水的条数（head:true 只取 count，不传数据体）。 */
async function countTransactions(
  client: ServiceClient,
  userId: string,
  type: string,
  sinceIso: string,
): Promise<number> {
  const { count } = await client
    .from('credit_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', type)
    .gte('created_at', sinceIso);
  return count ?? 0;
}

/** 当日某类埋点事件的条数。 */
async function countEvents(
  client: ServiceClient,
  userId: string,
  eventName: string,
  sinceIso: string,
): Promise<number> {
  const { count } = await client
    .from('behavior_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_name', eventName)
    .gte('created_at', sinceIso);
  return count ?? 0;
}

/**
 * 汇总当前留存状态。任何一步查询失败都按「未完成」处理（fail-closed），
 * 绝不因为一次读失败而误判用户已完成任务并多发积分。
 */
export async function getRetentionStatus(userId: string): Promise<RetentionStatus | null> {
  const client = retentionServiceClient();
  if (!client) return null;

  const today = utcDayKey();
  const sinceIso = utcDayStartIso(today);
  const yesterday = shiftDayKey(today, -1);

  const [signedDays, createCount, exportCount, claimedCount] = await Promise.all([
    loadSignedDays(client, userId),
    countTransactions(client, userId, 'video_process', sinceIso),
    countEvents(client, userId, 'clip_download', sinceIso),
    countTransactions(client, userId, TASK_REWARD_TX_TYPE, sinceIso),
  ]);

  const done: Record<RetentionTaskId, number> = {
    checkin: signedDays.has(today) ? 1 : 0,
    create: createCount,
    export: exportCount,
  };
  const tasks: RetentionTask[] = RETENTION_TASKS.map((t) => ({
    id: t.id,
    done: done[t.id] > 0,
    count: done[t.id],
  }));
  const allDone = tasks.every((t) => t.done);
  const claimed = claimedCount > 0;

  const streak = computeStreak(signedDays, today);
  // 里程碑按「签到当天」判定：今天没签到就不该提前发里程碑奖励。
  const milestone = signedDays.has(today) ? streakMilestoneCredits(streak) : 0;
  const claimableCredits = allDone && !claimed ? TASK_REWARD_CREDITS + milestone : 0;

  return {
    dayKey: today,
    streak,
    tasks,
    allDone,
    claimed,
    canClaim: claimableCredits > 0,
    claimableCredits,
    daysToMilestone: daysToNextMilestone(streak),
  };
}

export interface ClaimResult {
  ok: boolean;
  /** 调用方展示用：本次实发积分 */
  credits: number;
  /** 重复领取（幂等命中） */
  already?: boolean;
  reason?: string;
  status?: RetentionStatus;
}

/**
 * 签到（幂等）：写入 `behavior_events` 一条 checkin 记录。
 * 已签到直接返回，不重复写入。
 */
export async function checkIn(userId: string): Promise<{ ok: boolean; already: boolean }> {
  const client = retentionServiceClient();
  if (!client) return { ok: false, already: false };

  const today = utcDayKey();
  const sessionId = checkinSessionId(userId, today);

  const { data: existing } = await client
    .from('behavior_events')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (existing) return { ok: true, already: true };

  const { error } = await client.from('behavior_events').insert({
    event_name: 'daily_checkin',
    funnel_id: 'retention',
    step_index: 1,
    event_data: { day: today },
    session_id: sessionId,
    user_id: userId,
    user_email: '',
    page_url: '',
    referrer: '',
    user_agent: 'server/retention',
    ip: '',
  });
  if (error) {
    console.warn('[retention] checkin insert failed:', error.message);
    return { ok: false, already: false };
  }
  return { ok: true, already: false };
}

/**
 * 领取每日任务奖励（幂等）。
 *
 * 幂等依据：`credit_transactions` 当日已存在 `type='task_reward'` 的行。
 * 发放顺序刻意如此 —— **先写流水（幂等锁），再更新余额**：
 * 若第二步失败，用户看到的是「已领取但余额未加」，可由客服按流水补发；
 * 反过来先加余额再写流水，失败时无法判定是否已发，会重复加钱。
 */
export async function claimTaskReward(userId: string): Promise<ClaimResult> {
  const client = retentionServiceClient();
  if (!client) return { ok: false, credits: 0, reason: 'not_configured' };

  const status = await getRetentionStatus(userId);
  if (!status) return { ok: false, credits: 0, reason: 'not_configured' };

  if (status.claimed) return { ok: true, credits: 0, already: true, status };
  if (!status.allDone) return { ok: false, credits: 0, reason: 'tasks_incomplete', status };

  const credits = TASK_REWARD_CREDITS + streakMilestoneCredits(status.streak);
  if (credits <= 0) return { ok: false, credits: 0, reason: 'nothing_to_claim', status };

  // ① 幂等锁：先落流水
  const { error: txError } = await client.from('credit_transactions').insert({
    user_id: userId,
    amount: credits,
    type: TASK_REWARD_TX_TYPE,
    description: taskRewardDescription(status.dayKey, credits),
    related_id: null,
  });
  if (txError) {
    console.warn('[retention] reward tx insert failed:', txError.message);
    return { ok: false, credits: 0, reason: 'tx_failed', status };
  }

  // ② 加余额
  const { data: row } = await client
    .from('credits')
    .select('id, balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (row) {
    await client
      .from('credits')
      .update({ balance: (row.balance ?? 0) + credits, updated_at: new Date().toISOString() })
      .eq('id', row.id);
  } else {
    await client.from('credits').insert({ user_id: userId, balance: credits });
  }

  const next = await getRetentionStatus(userId);
  return { ok: true, credits, status: next ?? status };
}
