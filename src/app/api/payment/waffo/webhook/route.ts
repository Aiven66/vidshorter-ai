import { NextRequest } from 'next/server';
import { verifyWebhook, WebhookEventType } from '@waffo/pancake-ts';
import { applyPlanPurchase } from '@/lib/server/subscriptions';
import { trackSubscribeSuccess } from '@/lib/server/track-event';
import { getWaffoConfig } from '@/lib/waffo';

// Force dynamic — prevents Next.js from trying to statically generate this API route at build time.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PLAN_AMOUNT_USD: Record<string, number> = {
  starter: 9.9,
  pro: 19.9,
};

export async function POST(request: NextRequest) {
  // IMPORTANT: use raw body — parsed JSON breaks RSA signature verification.
  const rawBody = await request.text();
  const signature = request.headers.get('x-waffo-signature');
  const { environment } = getWaffoConfig();

  let event;
  try {
    // The SDK embeds test/prod public keys; pass environment to select the right one.
    event = verifyWebhook(rawBody, signature, { environment });
  } catch (err) {
    console.warn('[Waffo Webhook] Signature verification failed:', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  console.log('[Waffo Webhook] Event:', event.eventType, event.id);

  const data = event.data as {
    orderId: string;
    buyerEmail?: string;
    merchantProvidedBuyerIdentity?: string;
    orderMerchantExternalId?: string;
    orderMetadata?: Record<string, string>;
    currency?: string;
    amount?: string;
    total?: string;
    productName?: string;
    billingPeriod?: string;
  };

  // Resolve plan_id + user_id from orderMetadata (set at checkout), with fallbacks
  // to orderMerchantExternalId and merchantProvidedBuyerIdentity.
  const meta = data.orderMetadata || {};
  const planId = meta.plan_id || data.orderMerchantExternalId?.split(':').pop() || '';
  const userId = meta.user_id || data.merchantProvidedBuyerIdentity || '';
  const orderId = data.orderId || event.id;

  const applyAndTrack = async () => {
    if (!userId || !planId) {
      console.warn('[Waffo Webhook] Missing userId/planId', { userId, planId, orderId });
      return;
    }
    try {
      await applyPlanPurchase({ userId, planId, provider: 'waffo', orderId });
      console.log('[Waffo Webhook] Plan applied:', { userId, planId, orderId });
      await trackSubscribeSuccess({
        userId,
        userEmail: data.buyerEmail,
        paymentMethod: 'waffo',
        planId,
        planName: planId === 'pro' ? 'Pro' : 'Starter',
        amountUsd: PLAN_AMOUNT_USD[planId],
        orderId,
      });
    } catch (err) {
      console.error('[Waffo Webhook] applyPlanPurchase failed:', err);
    }
  };

  switch (event.eventType) {
    case WebhookEventType.OrderCompleted:
    case WebhookEventType.SubscriptionActivated:
    case WebhookEventType.SubscriptionPaymentSucceeded:
      await applyAndTrack();
      break;

    case WebhookEventType.SubscriptionCanceling:
    case WebhookEventType.SubscriptionCanceled:
      console.log('[Waffo Webhook] Subscription canceled:', { userId, eventType: event.eventType });
      break;

    default:
      console.log('[Waffo Webhook] Unhandled event type:', event.eventType);
  }

  return Response.json({ received: true });
}
