/**
 * 留存引擎 —— 每日创作任务 + 连续创作（Streak）的共享定义。
 *
 * 服务端与客户端共用同一份任务/奖励定义，避免「UI 说送 30、服务端发 20」这类口径漂移。
 *
 * 设计约束（务必遵守）：
 *  1) **不建新表**：本仓库无 Supabase PAT、无法执行 DDL。任务完成度从既有
 *     `credit_transactions` / `behavior_events` 派生；领取的幂等键落在
 *     `credit_transactions(description)`，签到记录落在 `behavior_events.session_id`。
 *  2) 本模块保持零依赖（不 import next / react / supabase），供路由与页面直接引用。
 *  3) 日界一律用 **UTC**，与 `plan-credits.ts` 的额度重置边界保持一致。
 */

/** 三项任务全部完成的一次性奖励积分（半条片子的成本，够用但不替代付费）。 */
export const TASK_REWARD_CREDITS = 30;

/** 连续签到达成该天数时，额外发放里程碑奖励。 */
export const STREAK_MILESTONE_DAYS = 7;

/** 里程碑额外奖励积分（约 1.5 条片子的成本）。 */
export const STREAK_MILESTONE_CREDITS = 90;

/** 里程碑按 7 天循环叠加：7/14/21… 每次都在当日奖励之上再加一份。 */
export function streakMilestoneCredits(streak: number): number {
  if (streak <= 0 || streak % STREAK_MILESTONE_DAYS !== 0) return 0;
  return STREAK_MILESTONE_CREDITS;
}

export type RetentionTaskId = 'checkin' | 'create' | 'export';

export interface RetentionTask {
  id: RetentionTaskId;
  done: boolean;
  /** 当日计数（签到恒为 0/1；create/export 为真实条数） */
  count: number;
}

export interface RetentionStatus {
  /** UTC 日键 YYYY-MM-DD */
  dayKey: string;
  /** 连续签到天数（含今天；今天未签到则为截至昨天的连续天数） */
  streak: number;
  tasks: RetentionTask[];
  /** 三项是否全部完成 */
  allDone: boolean;
  /** 今日是否已领取 */
  claimed: boolean;
  /** 现在是否可领（全部完成且未领取） */
  canClaim: boolean;
  /** 本次可领积分（任务奖励 + 里程碑加赠） */
  claimableCredits: number;
  /** 距离下一个里程碑还差几天；已在里程碑当天为 0 */
  daysToMilestone: number;
}

/** UTC 日键：'2026-10-07'。日界与 quota 重置一致（UTC 00:00）。 */
export function utcDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** 某个 UTC 日的起点（ISO 串），用于 created_at >= 过滤。 */
export function utcDayStartIso(dayKey: string): string {
  return `${dayKey}T00:00:00.000Z`;
}

/** 把日键回推 n 天。 */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const t = Date.parse(`${dayKey}T00:00:00.000Z`);
  if (!Number.isFinite(t)) return dayKey;
  return new Date(t + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 签到记录的 session_id 前缀：`daily_checkin_{userId}_`。
 * 用前缀检索即可回放某用户的全部签到日，从而推导 Streak；同时该整串充当幂等键，
 * 同一天重复签到不会产生第二条记录（调用方 check-then-insert）。
 */
export const CHECKIN_SESSION_PREFIX = 'daily_checkin_';

export function checkinSessionId(userId: string, dayKey: string): string {
  return `${CHECKIN_SESSION_PREFIX}${userId}_${dayKey}`;
}

/** 领取奖励在 `credit_transactions.description` 上的标记（幂等判定用）。 */
export const TASK_REWARD_MARKER = 'daily_task_reward';
export const TASK_REWARD_TX_TYPE = 'task_reward';

/** 领取奖励的流水描述：`daily_task_reward 2026-10-07 (+30)`。 */
export function taskRewardDescription(dayKey: string, credits: number): string {
  return `${TASK_REWARD_MARKER} ${dayKey} (+${credits})`;
}

/**
 * 从「有签到的日键集合」推导连续天数。
 *
 * 今天已签到 → 从今天往前数；今天未签到 → 从昨天往前数（当天尚未签到不算断签，
 * 否则用户上午打开页面时会看到 streak 归零，属于明确的体验事故）。
 */
export function computeStreak(signedDays: Set<string>, today: string): number {
  let cursor = signedDays.has(today) ? today : shiftDayKey(today, -1);
  let streak = 0;
  while (signedDays.has(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

/** 距离下一个里程碑的天数（1..7；恰好在里程碑当天返回 0）。 */
export function daysToNextMilestone(streak: number): number {
  const mod = streak % STREAK_MILESTONE_DAYS;
  return mod === 0 && streak > 0 ? 0 : STREAK_MILESTONE_DAYS - mod;
}

/** 任务元信息（顺序即 UI 展示顺序）。 */
export const RETENTION_TASKS: ReadonlyArray<{ id: RetentionTaskId }> = [
  { id: 'checkin' },
  { id: 'create' },
  { id: 'export' },
];
