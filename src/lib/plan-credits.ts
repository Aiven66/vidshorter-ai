/**
 * 积分额度真源（server + client 共用）。
 *
 * 唯一的额度定义处。此前全站有 4 份互相同步的副本（video-job / process-video /
 * credits-context / subscriptions），任何一处漏改都会造成「UI 显示与库不一致」或
 * 「桌面端与 Web 端计费不同」。
 *
 * 定价模型（2026-09 cutover）：
 *   - Free    : 60 积分 / 日（= 1 条片子，CREDIT_COST=60）—— 保持不变
 *   - Starter : 6,000 积分 / 月（100 条）—— 原 500/日
 *   - Pro     : 20,000 积分 / 月（333 条）—— 原 1,000,000/日（伪无限）
 * 刷新语义：UTC 边界重置，**不结转**。免费档按日、付费档按月。
 *
 * 本模块必须保持零依赖（不 import supabase / next / react），以便客户端组件直接使用。
 */

/** 单条片子的积分成本（唯一定义处；video-refund 从这里再导出以保持既有 import 路径可用）。 */
export const CREDIT_COST = 60;

/** 免费档每日额度：恰好 1 条片子。 */
export const FREE_DAILY_CREDITS = 60;

export type PaidPlan = 'starter' | 'pro';

export const PLAN_MONTHLY_CREDITS: Record<PaidPlan, number> = {
  starter: 6000,
  pro: 20000,
};

/**
 * cutover 之前售出的付费订阅（其 subscriptions 行没有 current_period_end）沿用旧的**日**额度，
 * 以免静默削弱已售承诺。该日期之后统一转为月度额度。
 */
export const LEGACY_DAILY_SUNSET_ISO = '2026-10-26T00:00:00.000Z';

const LEGACY_PAID_DAILY_CREDITS: Record<PaidPlan, number> = {
  starter: 500,
  pro: 1_000_000,
};

export type QuotaPeriod = 'day' | 'month';

export interface Quota {
  /** 每个周期发放的额度 */
  amount: number;
  period: QuotaPeriod;
  /** 该额度来自 cutover 前的旧付费订阅（按日计） */
  legacy: boolean;
}

export function isPaidPlan(plan: string | null | undefined): plan is PaidPlan {
  return plan === 'starter' || plan === 'pro';
}

/**
 * 是否为「存量旧付费订阅」：有付费 plan，但订阅行从未记录周期边界
 * （即由 cutover 前的老代码写入），且尚未到 sunset。
 */
export function isLegacyPaidRow(
  plan: string | null | undefined,
  currentPeriodEnd: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!isPaidPlan(plan)) return false;
  if (currentPeriodEnd) return false;
  const sunset = Date.parse(LEGACY_DAILY_SUNSET_ISO);
  if (!Number.isFinite(sunset)) return false;
  return now.getTime() < sunset;
}

/** 某 plan 当前应发放的额度与周期。 */
export function planQuota(
  plan: string | null | undefined,
  opts?: { legacyPaid?: boolean },
): Quota {
  if (isPaidPlan(plan)) {
    if (opts?.legacyPaid) {
      return { amount: LEGACY_PAID_DAILY_CREDITS[plan], period: 'day', legacy: true };
    }
    return { amount: PLAN_MONTHLY_CREDITS[plan], period: 'month', legacy: false };
  }
  return { amount: FREE_DAILY_CREDITS, period: 'day', legacy: false };
}

/** 当前周期起点的 ISO 串（日界 = UTC 当日 00:00；月界 = UTC 当月 1 日 00:00）。 */
export function resetBoundary(period: QuotaPeriod, now: Date): string {
  if (period === 'month') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

/** 是否已跨过刷新边界：日额度比 y-m-d，月额度只比 y-m。 */
export function hasQuotaCrossed(
  period: QuotaPeriod,
  lastResetAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastResetAt) return true;
  const last = new Date(lastResetAt);
  if (Number.isNaN(last.getTime())) return true;
  if (last.getUTCFullYear() !== now.getUTCFullYear()) return true;
  if (last.getUTCMonth() !== now.getUTCMonth()) return true;
  if (period === 'day' && last.getUTCDate() !== now.getUTCDate()) return true;
  return false;
}

/** credit_transactions.type：区分日/月重置，便于审计与后台统计。 */
export function quotaTransactionType(period: QuotaPeriod): 'daily_reset' | 'monthly_reset' {
  return period === 'month' ? 'monthly_reset' : 'daily_reset';
}

/** 明文说明（绝不静默）：写清周期与额度，便于用户在流水里自查。 */
export function quotaResetDescription(
  plan: string | null | undefined,
  quota: Quota,
  isNewUser = false,
): string {
  const cycle = quota.period === 'month' ? 'Monthly' : 'Daily';
  const planName = isPaidPlan(plan) ? plan : 'free';
  const suffix = quota.legacy ? ' — legacy daily quota' : '';
  return `${cycle} credits reset (${planName}: ${quota.amount})${suffix}${isNewUser ? ' — new user' : ''}`;
}

/** 订阅周期终点：now 起 1 个月（用于订阅表 current_period_end）。 */
export function subscriptionPeriodEnd(now: Date): string {
  const end = new Date(now.getTime());
  end.setUTCMonth(end.getUTCMonth() + 1);
  return end.toISOString();
}