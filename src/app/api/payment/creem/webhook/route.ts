import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { applyPlanPurchase } from '@/lib/server/subscriptions';

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

    if (eventType === 'checkout.completed') {
      const obj = event.object || {};
      const metadata = obj.metadata || {};
      const planId = metadata.plan_id;
      const userId = metadata.user_id;
      const orderId = obj.order?.id || event.id || `creem_${Date.now()}`;

      if (planId && userId) {
        try {
          await applyPlanPurchase({ userId, planId, provider: 'creem', orderId });
          console.log('[Creem Webhook] Plan applied:', { userId, planId, orderId });
        } catch (err) {
          console.error('[Creem Webhook] applyPlanPurchase failed:', err);
        }
      }
    }

    if (eventType === 'subscription.active' || eventType === 'subscription.paid') {
      const obj = event.object || {};
      const metadata = obj.metadata || {};
      const planId = metadata.plan_id;
      const userId = metadata.user_id;
      const orderId = obj.last_transaction_id || event.id || `creem_sub_${Date.now()}`;

      if (planId && userId) {
        try {
          await applyPlanPurchase({ userId, planId, provider: 'creem', orderId });
          console.log('[Creem Webhook] Subscription applied:', { userId, planId, orderId });
        } catch (err) {
          console.error('[Creem Webhook] Subscription applyPlanPurchase failed:', err);
        }
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
