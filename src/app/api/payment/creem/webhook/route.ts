import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { applyPlanPurchase } from '@/lib/server/subscriptions';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const webhookSecret = process.env.CREEM_WEBHOOK_SECRET;

  if (webhookSecret) {
    const signature = request.headers.get('creem-signature') || request.headers.get('x-creem-signature') || '';
    try {
      const hmac = createHmac('sha256', webhookSecret);
      hmac.update(rawBody);
      const expected = hmac.digest('hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      const sigBuf = Buffer.from(signature.replace('sha256=', ''), 'hex');
      if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) {
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } catch {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  try {
    const event = JSON.parse(rawBody);
    if (event.type === 'checkout.completed' || event.type === 'payment.succeeded') {
      const planId = event.data?.metadata?.plan_id;
      const userId = event.data?.metadata?.user_id;
      const orderId = event.data?.id || event.id || `creem_${Date.now()}`;
      if (planId && userId) {
        await applyPlanPurchase({ userId, planId, provider: 'creem', orderId });
      }
    }
    return Response.json({ received: true });
  } catch {
    return Response.json({ error: 'Webhook processing failed' }, { status: 400 });
  }
}

