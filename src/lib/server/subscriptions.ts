import { isSupabaseConfigured } from '@/storage/database/supabase-client';

type PlanId = 'basic' | 'pro';

const PLAN_TO_TYPE: Record<PlanId, 'basic' | 'pro'> = {
  basic: 'basic',
  pro: 'pro',
};

const PLAN_CREDITS: Record<PlanId, number> = {
  basic: 2000,
  pro: 10000,
};

export function isPaidPlan(planId: string | null | undefined): planId is PlanId {
  return planId === 'basic' || planId === 'pro';
}

export async function applyPlanPurchase(input: {
  userId: string;
  planId: string;
  provider: 'wechat' | 'alipay' | 'creem';
  orderId: string;
}) {
  if (!isSupabaseConfigured()) return false;
  if (!isPaidPlan(input.planId)) return false;

  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
  const client = getSupabaseClient();

  const planType = PLAN_TO_TYPE[input.planId];
  const credits = PLAN_CREDITS[input.planId];

  const { data: existingSub } = await client
    .from('subscriptions')
    .select('*')
    .eq('user_id', input.userId)
    .maybeSingle();

  if (existingSub) {
    await client.from('subscriptions').update({
      plan_type: planType,
      status: 'active',
      updated_at: new Date().toISOString(),
    }).eq('id', existingSub.id);
  } else {
    await client.from('subscriptions').insert({
      user_id: input.userId,
      plan_type: planType,
      status: 'active',
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
      updated_at: new Date().toISOString(),
    }).eq('id', existingCredits.id);
  } else {
    await client.from('credits').insert({
      user_id: input.userId,
      balance: credits,
      last_reset_at: new Date().toISOString(),
    });
  }

  await client.from('credit_transactions').insert({
    user_id: input.userId,
    amount: credits,
    type: 'purchase',
    description: `Purchase ${planType} via ${input.provider} (${input.orderId})`,
  });

  return true;
}

