import { createClient } from '@supabase/supabase-js';
import { isPaidPlan } from '@/lib/plan-credits';

/**
 * 订阅权益的**唯一生效判定**（server-authoritative）。
 *
 * 背景：`subscriptions.plan_type` 只回答「买过什么」，**不能**回答「现在还算不算数」。
 * 此前各门控（plan-gate / recap-studio）只读 plan_type，且把 `status === 'active'`
 * 直接当作放行条件——而注册流程给**每个**用户写的正是
 * `{ plan_type: 'free', status: 'active' }`（见 auth-context 的注册/OAuth 补建），
 * 于是「status 为 active」等价于「任何已登录用户都能过 Starter+ 门控」，付费墙形同虚设。
 *
 * 判定规则（宁可保留已付用户的宽限期，也不误砍真实的付费权益）：
 *   - 无订阅行 / 非付费 plan                → free
 *   - status ∈ {expired, revoked, refunded, unpaid} → free（立即回收）
 *   - 有 current_period_end 且已过期        → free（周期结束，回收）
 *   - 有 current_period_end 且未过期        → 付费（canceled 仍算，属「已付周期内」宽限）
 *   - 无 current_period_end 且 status 为取消 → free（无法确认已付窗口）
 *   - 无 current_period_end 且状态正常      → 付费（存量旧订阅，绝不静默削弱已售承诺）
 *
 * 本模块零 React/Next 依赖，判定部分是纯函数，可直接单测。
 */

export type EffectivePlan = 'free' | 'starter' | 'pro';

export interface SubscriptionSnapshot {
  plan_type?: string | null;
  status?: string | null;
  current_period_end?: string | null;
}

export type EntitlementReason =
  | 'no_row'
  | 'db_error'
  | 'free_plan'
  | 'active'
  | 'grace_period'
  | 'period_ended'
  | 'revoked';

export interface Entitlement {
  /** 当前真正生效的档位 */
  plan: EffectivePlan;
  /** 是否享受 Starter+ 权益（各门控只看这一个字段） */
  paid: boolean;
  /** 库中原始 status（排查用） */
  status: string | null;
  currentPeriodEnd: string | null;
  /** 判定依据（排查/埋点用） */
  reason: EntitlementReason;
}

/** 立即回收权益的状态（退款、撤销、过期）。 */
const REVOKED_STATUSES = new Set(['expired', 'revoked', 'refunded', 'unpaid']);

/** 取消状态：仅表示「不再续订」，已付周期内继续有效。 */
const CANCELED_STATUSES = new Set(['canceled', 'cancelled']);

function freeStatus(status: string | null, currentPeriodEnd: string | null, reason: EntitlementReason): Entitlement {
  return { plan: 'free', paid: false, status, currentPeriodEnd, reason };
}

/** 纯函数判定：给定订阅行与时间点，算出真正生效的档位。 */
export function decideEntitlement(
  row: SubscriptionSnapshot | null | undefined,
  now: Date = new Date(),
): Entitlement {
  if (!row) return freeStatus(null, null, 'no_row');

  const status = row.status ?? null;
  const periodEnd = row.current_period_end ?? null;
  const normalized = (status || '').toLowerCase();

  if (!isPaidPlan(row.plan_type)) return freeStatus(status, periodEnd, 'free_plan');
  if (REVOKED_STATUSES.has(normalized)) return freeStatus(status, periodEnd, 'revoked');

  const endMs = periodEnd ? Date.parse(periodEnd) : NaN;
  if (Number.isFinite(endMs)) {
    if (endMs <= now.getTime()) return freeStatus(status, periodEnd, 'period_ended');
    return {
      plan: row.plan_type,
      paid: true,
      status,
      currentPeriodEnd: periodEnd,
      reason: CANCELED_STATUSES.has(normalized) ? 'grace_period' : 'active',
    };
  }

  // 无周期边界：取消态无法确认已付窗口 → 回收
  if (CANCELED_STATUSES.has(normalized)) return freeStatus(status, periodEnd, 'revoked');

  // 无周期边界且状态正常：存量旧付费订阅，继续放行
  return { plan: row.plan_type, paid: true, status, currentPeriodEnd: periodEnd, reason: 'active' };
}

/** service-role 客户端（写/读订阅表用）；未配置 Supabase 时返回 null。 */
export function subscriptionServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** 读取指定用户的生效权益。任何异常都按 free 处理（fail-closed）。 */
export async function resolveEffectivePlan(
  userId: string,
  now: Date = new Date(),
): Promise<Entitlement> {
  const client = subscriptionServiceClient();
  if (!client) return freeStatus(null, null, 'db_error');
  try {
    const { data, error } = await client
      .from('subscriptions')
      .select('plan_type, status, current_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return freeStatus(null, null, 'db_error');
    return decideEntitlement(data as SubscriptionSnapshot | null, now);
  } catch (e) {
    console.warn('[effective-plan] resolve failed:', e instanceof Error ? e.message.slice(0, 200) : e);
    return freeStatus(null, null, 'db_error');
  }
}