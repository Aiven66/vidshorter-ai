import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import { PLAN_MONTHLY_CREDITS, resetBoundary, subscriptionPeriodEnd } from '@/lib/plan-credits';

type PlanId = 'starter' | 'pro';

const PLAN_TO_TYPE: Record<PlanId, 'starter' | 'pro'> = {
  starter: 'starter',
  pro: 'pro',
};

// One-time credit packs. Keep ids/credits/prices in sync with
// packages/core/config.tsx `creditPacks` default.
export interface CreditPackInfo {
  name: string;
  credits: number;
  priceIntl: number;
  priceCny: number;
}

export const CREDIT_PACKS: Record<string, CreditPackInfo> = {
  credits_120: { name: 'Starter Pack', credits: 120, priceIntl: 2.99, priceCny: 19 },
  credits_300: { name: 'Boost Pack', credits: 300, priceIntl: 6.99, priceCny: 49 },
  credits_900: { name: 'Creator Pack', credits: 900, priceIntl: 16.99, priceCny: 119 },
};

export function isCreditPack(packId: string | null | undefined): packId is string {
  return !!packId && Object.prototype.hasOwnProperty.call(CREDIT_PACKS, packId);
}

/**
 * Unified dispatcher: route a completed purchase to the right handler —
 * one-time credit pack vs recurring subscription plan.
 */
export async function applyPurchase(input: {
  userId: string;
  planId: string;
  provider: 'wechat' | 'alipay' | 'creem' | 'paypal' | 'waffo';
  orderId: string;
}) {
  if (isCreditPack(input.planId)) {
    return applyCreditPackage({
      userId: input.userId,
      packId: input.planId,
      provider: input.provider,
      orderId: input.orderId,
    });
  }
  return applyPlanPurchase(input);
}

export function isPaidPlan(planId: string | null | undefined): planId is PlanId {
  return planId === 'starter' || planId === 'pro';
}

export async function applyPlanPurchase(input: {
  userId: string;
  planId: string;
  provider: 'wechat' | 'alipay' | 'creem' | 'paypal' | 'waffo';
  orderId: string;
}) {
  if (!isSupabaseConfigured()) return false;
  if (!isPaidPlan(input.planId)) return false;

  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
  const client = getSupabaseClient();

  const planType = PLAN_TO_TYPE[input.planId];
  // 月度额度池：购买即发放当月整月额度（同月重复购买沿用 max()，不叠加）。
  const credits = PLAN_MONTHLY_CREDITS[input.planId];
  const now = new Date();
  const resetAt = resetBoundary('month', now);
  const nowIso = now.toISOString();
  const periodEnd = subscriptionPeriodEnd(now);

  const { data: existingSub } = await client
    .from('subscriptions')
    .select('*')
    .eq('user_id', input.userId)
    .maybeSingle();

  if (existingSub) {
    await client.from('subscriptions').update({
      plan_type: planType,
      status: 'active',
      current_period_start: nowIso,
      current_period_end: periodEnd,
      updated_at: nowIso,
    }).eq('id', existingSub.id);
  } else {
    await client.from('subscriptions').insert({
      user_id: input.userId,
      plan_type: planType,
      status: 'active',
      current_period_start: nowIso,
      current_period_end: periodEnd,
    });
  }

  const { data: existingCredits } = await client
    .from('credits')
    .select('*')
    .eq('user_id', input.userId)
    .maybeSingle();

  if (existingCredits) {
    await client.from('credits').update({
      balance: Math.max(existingCredits.balance ?? 0, credits),
      last_reset_at: resetAt,
      updated_at: nowIso,
    }).eq('id', existingCredits.id);
  } else {
    await client.from('credits').insert({
      user_id: input.userId,
      balance: credits,
      last_reset_at: resetAt,
    });
  }

  await client.from('credit_transactions').insert({
    user_id: input.userId,
    amount: credits,
    type: 'purchase',
    description: `Purchase ${planType} via ${input.provider} (${input.orderId}) — monthly quota ${credits}`,
  });

  return true;
}

/**
 * 订阅生命周期回收（webhook: subscription.canceled / subscription.expired）。
 *
 * 与 applyPlanPurchase 对称：那边「落库升档 + 发额度」，这边「落库降档」。
 * 语义区分（决定了权益何时真正失效）：
 *   - expired：立即回收 —— status='expired'、plan_type='free'（生效判定随即按 free 处理）。
 *   - canceled：仅表示「不再续订」——保留 plan_type，宽限到 current_period_end；
 *     到期后由每日 cron / 生效判定回收。若行内没有周期边界，则立即回收（无法确认已付窗口）。
 */
export async function applySubscriptionLapse(input: {
  userId: string;
  reason: 'canceled' | 'expired';
  orderId: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
  const client = getSupabaseClient();
  const nowIso = new Date().toISOString();

  const { data: existingSub } = await client
    .from('subscriptions')
    .select('*')
    .eq('user_id', input.userId)
    .maybeSingle();
  if (!existingSub) return false;

  if (input.reason === 'expired') {
    await client.from('subscriptions').update({
      status: 'expired',
      plan_type: 'free',
      updated_at: nowIso,
    }).eq('id', existingSub.id);
    return true;
  }

  const periodEnd = existingSub.current_period_end as string | null | undefined;
  const endMs = periodEnd ? Date.parse(periodEnd) : NaN;
  const withinPaidPeriod = Number.isFinite(endMs) && endMs > Date.now();

  await client.from('subscriptions').update({
    status: 'canceled',
    plan_type: withinPaidPeriod ? existingSub.plan_type : 'free',
    updated_at: nowIso,
  }).eq('id', existingSub.id);
  return true;
}

/**
 * 撤回取消（webhook: subscription.uncanceled）——把订阅恢复为 active。
 *
 * 必须有这一步：`subscription.canceling` 已把 status 置为 'canceled'，若用户随后撤回取消
 * 而 status 一直停在 canceled，周期末的每日扫描会把这个**仍在付费**的用户降级。
 * 已彻底终止（plan_type 已回落 free）的订阅不复活——那属于重新购买，走 applyPlanPurchase。
 */
export async function applySubscriptionRestore(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
  const client = getSupabaseClient();

  const { data: existingSub } = await client
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!existingSub) return false;
  if (!isPaidPlan(existingSub.plan_type)) return false;

  await client.from('subscriptions').update({
    status: 'active',
    updated_at: new Date().toISOString(),
  }).eq('id', existingSub.id);
  return true;
}

/**
 * Apply a successful ONE-TIME credit pack purchase.
 * Unlike applyPlanPurchase, this does NOT touch the subscription table and adds
 * the pack credits ADDITIVELY to the existing balance (no max(), no reset).
 * Idempotent: skips when a matching credit_transactions row already exists.
 */
export async function applyCreditPackage(input: {
  userId: string;
  packId: string;
  provider: 'wechat' | 'alipay' | 'creem' | 'paypal' | 'waffo';
  orderId: string;
}) {
  if (!isSupabaseConfigured()) return false;
  const pack = CREDIT_PACKS[input.packId];
  if (!pack) return false;

  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
  const client = getSupabaseClient();

  const description = `Purchase ${input.packId} via ${input.provider} (${input.orderId})`;

  // Idempotency: same user + pack + order already recorded → skip.
  const { data: existingTx } = await client
    .from('credit_transactions')
    .select('id')
    .eq('user_id', input.userId)
    .eq('description', description)
    .maybeSingle();
  if (existingTx) return true;

  // Additive credit grant (also creates the row if a free user never had one).
  const { data: existingCredits } = await client
    .from('credits')
    .select('id,balance')
    .eq('user_id', input.userId)
    .maybeSingle();

  if (existingCredits) {
    await client
      .from('credits')
      .update({
        balance: (existingCredits.balance ?? 0) + pack.credits,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingCredits.id);
  } else {
    await client.from('credits').insert({
      user_id: input.userId,
      balance: pack.credits,
      last_reset_at: new Date().toISOString(),
    });
  }

  await client.from('credit_transactions').insert({
    user_id: input.userId,
    amount: pack.credits,
    type: 'purchase',
    description,
  });

  return true;
}
