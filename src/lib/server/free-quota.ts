import type { SupabaseClient } from '@supabase/supabase-js';
import { FREE_DAILY_CREDITS, FREE_MONTHLY_CAP, resetBoundary } from '@/lib/plan-credits';

/**
 * 免费档的「每月发放封顶」对账。
 *
 * 规则：免费档每个自然月（UTC 月界）最多发放 FREE_MONTHLY_CAP=600 积分，
 * 包含注册时一次性赠送的 180。每日重置只发放「月度剩余额度」与 60 的较小值；
 * 本月已封顶时不再发放，但不会清空用户手里尚未用完的余额。
 *
 * 已发放额度直接由 credit_transactions 汇总得出（daily_reset + welcome_bonus），
 * 不新增表结构，也不会因为 credits.last_reset_at 被覆盖而丢失累计口径。
 */

const GRANT_TX_TYPES = ['daily_reset', 'welcome_bonus'];

/** 某用户本自然月已发放的免费额度总额；查询失败按 0 处理（最多多发 60，不会错扣）。 */
export async function getFreeMonthlyGranted(
  client: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const monthStart = resetBoundary('month', now);
  try {
    const { data, error } = await client
      .from('credit_transactions')
      .select('amount')
      .eq('user_id', userId)
      .in('type', GRANT_TX_TYPES)
      .gte('created_at', monthStart);
    if (error || !data) return 0;
    return data.reduce((sum, row) => {
      const amount = Number((row as { amount?: number }).amount ?? 0);
      return amount > 0 ? sum + amount : sum;
    }, 0);
  } catch {
    return 0;
  }
}

/**
 * 计算跨周期重置后应写入的余额。
 * @param currentBalance 用户当前余额（本月封顶时保留，不清零）
 * @returns balance 新余额；grant 本次发放额度（0 = 本月已封顶）；capped 是否已封顶
 */
export async function nextFreeResetBalance(
  client: SupabaseClient,
  userId: string,
  currentBalance: number,
  now: Date = new Date(),
): Promise<{ balance: number; grant: number; capped: boolean }> {
  const granted = await getFreeMonthlyGranted(client, userId, now);
  const remaining = Math.max(0, FREE_MONTHLY_CAP - granted);
  const grant = Math.min(FREE_DAILY_CREDITS, remaining);
  if (grant <= 0) {
    return { balance: Math.max(0, currentBalance), grant: 0, capped: true };
  }
  return { balance: grant, grant, capped: false };
}
