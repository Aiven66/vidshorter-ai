import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

// Force dynamic — prevents Next.js from trying to statically generate this API route at build time.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REFERRAL_REWARD = 100;

/**
 * Build a service-role Supabase client (bypasses RLS).
 * Reads the service role key from env (server-only — never exposed to the client).
 * Returns null if not configured, so the caller can return a 503.
 */
function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
    '';
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/referral/reward
 *
 * Called right after a new user registers via a referral link. Claims the
 * referral reward: inserts a row into `referrals` (unique on referee_id —
 * idempotent), then grants 100 credits to the new user via the service-role
 * client (bypasses RLS).
 *
 * Body: { referrerId: string }  — the inviter's user id (from ?ref= query param)
 * Auth: requires the new user's access token (used to identify the referee).
 *
 * Idempotency: the unique(referee_id) constraint means a second call for the
 * same user returns 409 — the first call already granted the reward.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: 'Database not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { referrerId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { referrerId } = body;
  if (!referrerId || typeof referrerId !== 'string') {
    return Response.json({ error: 'referrerId is required' }, { status: 400 });
  }

  try {
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const client = getSupabaseClient(token);

    // Identify the referee (the newly-registered caller)
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Self-referral guard
    if (user.id === referrerId) {
      return Response.json({ error: 'Cannot refer yourself' }, { status: 400 });
    }

    // Validate the referrer exists
    const { data: referrer } = await client
      .from('users')
      .select('id')
      .eq('id', referrerId)
      .maybeSingle();
    if (!referrer) {
      return Response.json({ error: 'Referrer not found' }, { status: 400 });
    }

    // Already rewarded? (idempotency check before insert to give a clear message)
    const { data: existing } = await client
      .from('referrals')
      .select('id')
      .eq('referee_id', user.id)
      .maybeSingle();
    if (existing) {
      return Response.json({ alreadyRewarded: true, reward: 0, message: 'Referral already claimed' });
    }

    // Grant the reward via service-role client (bypasses RLS on credits).
    const serviceClient = getServiceRoleClient();
    if (!serviceClient) {
      return Response.json({ error: 'Server not configured for rewards' }, { status: 503 });
    }

    // Insert referral record (unique constraint protects against races)
    const { error: insertError } = await serviceClient.from('referrals').insert({
      referrer_id: referrerId,
      referee_id: user.id,
      reward_amount: REFERRAL_REWARD,
      status: 'completed',
    });

    if (insertError) {
      // 23505 = unique_violation — a parallel request already inserted it
      if (insertError.code === '23505') {
        return Response.json({ alreadyRewarded: true, reward: 0, message: 'Referral already claimed' });
      }
      console.error('[Referral Reward] Insert failed:', insertError);
      return Response.json({ error: 'Failed to record referral' }, { status: 500 });
    }

    // Upsert credits row for the new user — add the reward
    const { data: existingCredits } = await serviceClient
      .from('credits')
      .select('id, balance')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingCredits) {
      await serviceClient
        .from('credits')
        .update({ balance: (existingCredits.balance ?? 0) + REFERRAL_REWARD, updated_at: new Date().toISOString() })
        .eq('id', existingCredits.id);
    } else {
      await serviceClient
        .from('credits')
        .insert({ user_id: user.id, balance: 100 + REFERRAL_REWARD });
    }

    // Record a credit transaction for auditability
    await serviceClient.from('credit_transactions').insert({
      user_id: user.id,
      amount: REFERRAL_REWARD,
      type: 'referral_bonus',
      description: `Referral bonus: invited by ${referrerId}`,
      related_id: referrerId,
    });

    return Response.json({
      alreadyRewarded: false,
      reward: REFERRAL_REWARD,
      message: 'Referral bonus credited successfully',
    });
  } catch (err) {
    console.error('[Referral Reward] Failed:', err);
    return Response.json({ error: 'Failed to claim referral reward' }, { status: 500 });
  }
}
