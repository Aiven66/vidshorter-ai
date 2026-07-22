import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { applyPlanPurchase } from '@/lib/server/subscriptions';
import { trackSubscribeSuccess } from '@/lib/server/track-event';

// Force dynamic — prevents Next.js from trying to statically generate this API route at build time.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const webhookSecret = process.env.CREEM_WEBHOOK_SECRET;

  if (webhookSecret) {
    const signature = request.headers.get('creem-signature') || '';
    try {
      const hmac = createHmac('sha256', webhookSecret);
      hmac.update(rawBody);
      const expected = hmac.digest('hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      const sigBuf = Buffer.from(signature, 'hex');

      if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) {
        console.warn('[Creem Webhook] Signature mismatch');
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } catch {
      console.warn('[Creem Webhook] Signature verification error');
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  try {
    const event = JSON.parse(rawBody);
    const eventType = event.eventType || event.type;
    console.log('[Creem Webhook] Event:', eventType, event.id);

    // 应用订阅并埋点（付费成功）
    const applyAndTrack = async (params: {
      userId: string;
      planId: string;
      orderId: string;
    }) => {
      try {
        await applyPlanPurchase({
          userId: params.userId,
          planId: params.planId,
          provider: 'creem',
          orderId: params.orderId,
        });
        console.log('[Creem Webhook] Plan applied:', params);
        // 服务端埋点：付费成功（Creem）— 即使前端关闭浏览器也能记录
        await trackSubscribeSuccess({
          userId: params.userId,
          paymentMethod: 'creem',
          planId: params.planId,
          planName: params.planId === 'pro' ? 'Pro' : 'Starter',
          amountUsd: params.planId === 'pro' ? 19.9 : 9.9,
          orderId: params.orderId,
        });
      } catch (err) {
        console.error('[Creem Webhook] applyPlanPurchase failed:', err);
      }
    };

    if (eventType === 'checkout.completed') {
      const obj = event.object || {};
      const metadata = obj.metadata || {};
      const planId = metadata.plan_id;
      const userId = metadata.user_id;
      const orderId = obj.order?.id || event.id || `creem_${Date.now()}`;

      if (planId && userId) {
        await applyAndTrack({ userId, planId, orderId });
      }
    }

    if (eventType === 'subscription.active' || eventType === 'subscription.paid') {
      const obj = event.object || {};
      const metadata = obj.metadata || {};
      const planId = metadata.plan_id;
      const userId = metadata.user_id;
      const orderId = obj.last_transaction_id || event.id || `creem_sub_${Date.now()}`;

      if (planId && userId) {
        await applyAndTrack({ userId, planId, orderId });
      }
    }

    if (eventType === 'subscription.canceled' || eventType === 'subscription.expired') {
      const obj = event.object || {};
      const metadata = obj.metadata || {};
      const userId = metadata.user_id;
      console.log('[Creem Webhook] Subscription canceled/expired:', { userId, eventType });
    }

    return Response.json({ received: true });
  } catch (err) {
    console.error('[Creem Webhook] Processing error:', err);
    return Response.json({ error: 'Webhook processing failed' }, { status: 400 });
  }
}
