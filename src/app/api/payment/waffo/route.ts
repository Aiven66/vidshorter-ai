import { NextRequest } from 'next/server';
import { getWaffoClient, getWaffoConfig, isWaffoConfigured, getWaffoProductId } from '@/lib/waffo';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

// Force dynamic — prevents Next.js from trying to statically generate this API route at build time.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { planId, userId, userEmail } = body as {
    planId?: string;
    userId?: string;
    userEmail?: string;
  };

  if (!planId) {
    return Response.json({ error: 'planId is required' }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Demo mode when Waffo credentials are not configured
  if (!isWaffoConfigured()) {
    console.log('[Waffo] Running in demo mode (WAFFO_MERCHANT_ID/WAFFO_PRIVATE_KEY not set)');
    const demoUrl = `${appUrl}/dashboard?payment=success&plan=${planId}&demo=true`;
    return Response.json({ checkoutUrl: demoUrl, demo: true, sessionId: `demo_${Date.now()}` });
  }

  const productId = getWaffoProductId(planId);
  if (!productId) {
    console.error('[Waffo] No product ID mapping found for plan:', planId);
    return Response.json({ error: `No product ID configured for plan: ${planId}` }, { status: 400 });
  }

  try {
    const client = getWaffoClient();

    // Use authenticated checkout: buyerIdentity binds the order to our userId
    // (enables customer self-service later via the Store ID). metadata is echoed
    // back in the webhook as event.data.orderMetadata — same shape as Creem.
    const result = await client.checkout.authenticated.create({
      productId,
      currency: 'USD',
      buyerIdentity: userId || userEmail || `anon_${Date.now()}`,
      buyerEmail: userEmail,
      successUrl: `${appUrl}/dashboard?payment=success&plan=${planId}`,
      metadata: {
        plan_id: planId,
        user_id: userId || '',
        source: 'clipop_ai',
      },
      orderMerchantExternalId: `clipop:${userId || 'anon'}:${planId}`.slice(0, 128),
    });

    console.log('[Waffo] Checkout created:', {
      sessionId: result.sessionId,
      planId,
      productId,
    });

    return Response.json({
      checkoutUrl: result.checkoutUrl,
      sessionId: result.sessionId,
      demo: false,
    });
  } catch (err) {
    console.error('[Waffo] Checkout creation failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to create Waffo checkout';
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * GET — poll subscription status by userId.
 *
 * Waffo's source of truth is the webhook (which calls applyPlanPurchase). The
 * frontend polls this endpoint after redirecting to checkout; once the webhook
 * fires and activates the subscription, this returns { paid: true }. This is
 * provider-agnostic and avoids coupling to Waffo's session-status API.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');

  if (!userId) {
    return Response.json({ error: 'user_id is required' }, { status: 400 });
  }

  if (!isWaffoConfigured()) {
    return Response.json({ status: 'demo', paid: false });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ status: 'unknown', paid: false });
  }

  try {
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const client = getSupabaseClient();
    const { data: sub } = await client
      .from('subscriptions')
      .select('status, plan_type')
      .eq('user_id', userId)
      .maybeSingle();

    const paid = Boolean(sub && sub.status === 'active' && (sub.plan_type === 'starter' || sub.plan_type === 'pro'));
    return Response.json({ status: sub?.status || 'none', paid });
  } catch (err) {
    console.error('[Waffo] Status check failed:', err);
    return Response.json({ status: 'unknown', paid: false });
  }
}
