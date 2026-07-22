/**
 * @clipop/payments - Server-only subscription application
 *
 * SERVER-ONLY module. Do NOT add 'use client'.
 *
 * Exports:
 *   - applyPlanPurchase(config, { userId, planId, provider, orderId })
 *   - getPlanCredits(config, planId)
 *   - isPaidPlan(config, planId)
 *
 * Reads plan credits from AppConfig.plans (no hardcoded constants).
 * Idempotent: skips duplicate orders by checking credit_transactions.description.
 */

import type { AppConfig, PaymentProvider } from '@clipop/core';
import { getAdminClient, isSupabaseConfigured } from '@clipop/core';

export interface PlanPurchaseInput {
  userId: string;
  planId: string;
  provider: PaymentProvider;
  orderId: string;
}

export interface PlanPurchaseResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
}

/**
 * Look up dailyCredits for a plan from config.
 * Returns 0 if plan not found.
 */
export function getPlanCredits(config: AppConfig, planId: string): number {
  const plan = config.plans.find((p) => p.id === planId);
  if (!plan) return 0;
  return plan.dailyCredits;
}

/**
 * Check that planId exists in config and is a paid plan (priceIntl > 0).
 */
export function isPaidPlan(config: AppConfig, planId: string | null | undefined): boolean {
  if (!planId) return false;
  const plan = config.plans.find((p) => p.id === planId);
  if (!plan) return false;
  return plan.priceIntl > 0 || plan.priceCny > 0;
}

/**
 * Apply a successful plan purchase to the database:
 *  1. upsert subscriptions row (active, current_period_*)
 *  2. upsert credits row (balance = max(existing, plan.dailyCredits))
 *  3. insert credit_transactions row (type='purchase', amount=planCredits)
 *
 * Idempotent: if a transaction with the same orderId already exists, skip.
 */
export async function applyPlanPurchase(
  config: AppConfig,
  input: PlanPurchaseInput,
): Promise<PlanPurchaseResult> {
  if (!isSupabaseConfigured(config)) {
    return { ok: false, reason: 'Supabase is not configured' };
  }
  if (!isPaidPlan(config, input.planId)) {
    return { ok: false, reason: `Plan ${input.planId} is not a paid plan` };
  }

  const planConfig = config.plans.find((p) => p.id === input.planId);
  if (!planConfig) {
    return { ok: false, reason: `Plan ${input.planId} not found in config` };
  }

  const planCredits = planConfig.dailyCredits;
  const client = getAdminClient(config);

  const description = `Purchase ${input.planId} via ${input.provider} (${input.orderId})`;

  // ── Idempotency: check for existing transaction with same orderId ──
  try {
    const { data: existingTx } = await client
      .from('credit_transactions')
      .select('id')
      .eq('user_id', input.userId)
      .eq('description', description)
      .maybeSingle();

    if (existingTx) {
      return { ok: true, skipped: true, reason: 'Order already applied' };
    }
  } catch (err) {
    // If credit_transactions table missing or query error, log and continue
    console.warn('[payments] idempotency check failed:', err);
  }

  const now = new Date();
  const periodStart = now.toISOString();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const resetAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  ).toISOString();

  // ── 1. upsert subscriptions ──
  try {
    const { data: existingSub } = await client
      .from('subscriptions')
      .select('id')
      .eq('user_id', input.userId)
      .maybeSingle();

    if (existingSub?.id) {
      await client
        .from('subscriptions')
        .update({
          plan_type: input.planId,
          status: 'active',
          provider_subscription_id: input.orderId,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          updated_at: now.toISOString(),
        })
        .eq('id', existingSub.id);
    } else {
      await client.from('subscriptions').insert({
        user_id: input.userId,
        plan_type: input.planId,
        status: 'active',
        provider_subscription_id: input.orderId,
        current_period_start: periodStart,
        current_period_end: periodEnd,
      });
    }
  } catch (err) {
    console.error('[payments] subscriptions upsert failed:', err);
    return { ok: false, reason: 'Failed to update subscriptions table' };
  }

  // ── 2. upsert credits (balance = max(existing, planCredits)) ──
  try {
    const { data: existingCredits } = await client
      .from('credits')
      .select('id,balance')
      .eq('user_id', input.userId)
      .maybeSingle();

    if (existingCredits?.id) {
      const newBalance = Math.max(existingCredits.balance ?? 0, planCredits);
      await client
        .from('credits')
        .update({
          balance: newBalance,
          last_reset_at: resetAt,
          updated_at: now.toISOString(),
        })
        .eq('id', existingCredits.id);
    } else {
      await client.from('credits').insert({
        user_id: input.userId,
        balance: planCredits,
        last_reset_at: resetAt,
      });
    }
  } catch (err) {
    console.error('[payments] credits upsert failed:', err);
    return { ok: false, reason: 'Failed to update credits table' };
  }

  // ── 3. insert credit_transactions ──
  try {
    await client.from('credit_transactions').insert({
      user_id: input.userId,
      amount: planCredits,
      type: 'purchase',
      description,
    });
  } catch (err) {
    // Transaction log is best-effort: subscription & credits succeeded.
    console.warn('[payments] transaction log insert failed:', err);
  }

  return { ok: true };
}

/**
 * Backwards-compatible helper for callers that only need plan credits.
 * Equivalent to getPlanCredits(config, planId).
 */
export const PLAN_CREDITS = getPlanCredits;
