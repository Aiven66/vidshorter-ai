import { NextRequest } from 'next/server';
import { verifyWebhook, WebhookEventType } from '@waffo/pancake-ts';
import { applyPlanPurchase, applySubscriptionLapse, applySubscriptionRestore } from '@/lib/server/subscriptions';
import { trackSubscribeSuccess, trackSubscriptionLapsed } from '@/lib/server/track-event';

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

  let event;
  try {
    // 不锁定单一环境：SDK 会依次尝试 prod / test 内置公钥，避免环境错配导致合法 webhook 被拒。
    event = verifyWebhook(rawBody, signature);
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

  // 订阅回收：落库降级 + 埋点（与 Creem 共用同一套 handler，避免"只打日志不落库"）
  const lapseAndTrack = async (reason: 'canceled' | 'expired') => {
    if (!userId) {
      console.warn('[Waffo Webhook] Lapse without userId:', event.eventType, orderId);
      return;
    }
    try {
      const applied = await applySubscriptionLapse({ userId, reason, orderId });
      console.log('[Waffo Webhook] Subscription lapsed:', { userId, reason, applied });
      await trackSubscriptionLapsed({ userId, reason, planId, orderId });
    } catch (err) {
      console.error('[Waffo Webhook] lapse failed:', err);
    }
  };

  switch (event.eventType) {
    case WebhookEventType.OrderCompleted:
    case WebhookEventType.SubscriptionActivated:
    case WebhookEventType.SubscriptionPaymentSucceeded:
      await applyAndTrack();
      break;

    // 用户发起取消：不再续订，但已付周期内仍有效（宽限到 current_period_end）
    case WebhookEventType.SubscriptionCanceling:
      await lapseAndTrack('canceled');
      break;

    // SDK 语义：subscription fully terminated → 立即回收
    case WebhookEventType.SubscriptionCanceled:
      await lapseAndTrack('expired');
      break;

    // 用户撤回取消：必须恢复 active，否则周期末会被每日扫描误降级
    case WebhookEventType.SubscriptionUncanceled: {
      if (!userId) {
        console.warn('[Waffo Webhook] Uncanceled without userId:', orderId);
        break;
      }
      const restored = await applySubscriptionRestore(userId);
      console.log('[Waffo Webhook] Subscription restored:', { userId, restored });
      break;
    }

    default:
      console.log('[Waffo Webhook] Unhandled event type:', event.eventType);
  }

  return Response.json({ received: true });
}
