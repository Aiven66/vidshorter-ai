/**
 * Creem Payment API Route
 *
 * Creates a Creem checkout session for international card payments
 * (Visa, Mastercard, Apple Pay, Google Pay).
 *
 * Required env vars (production):
 *   CREEM_API_KEY       - Creem secret key (creem_sk_...)
 *   CREEM_WEBHOOK_SECRET - Webhook signing secret (whsec_...)
 *   NEXT_PUBLIC_APP_URL  - Your app's public URL for redirect/cancel URLs
 *
 * Without env vars → returns demo mode response
 *
 * Creem API docs: https://docs.creem.io
 */

import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { applyPlanPurchase } from '@/lib/server/subscriptions';

const CREEM_API_BASE = 'https://api.creem.io/v1';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { planId, amount, currency = 'USD', userId } = body as {
    planId?: string;
    amount?: number;    // USD dollars
    currency?: string;
    userId?: string;
  };

  if (!planId || !amount) {
    return Response.json({ error: 'planId and amount are required' }, { status: 400 });
  }

  const apiKey = process.env.CREEM_API_KEY;
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // ── Demo mode when not configured ──
  if (!apiKey) {
    console.log('[Creem] Running in demo mode (env vars not set)');
    const demoUrl = `https://www.creem.io/payment?product=${planId}&amount=${Math.round(amount * 100)}&currency=${currency}&demo=true`;
    return Response.json({ checkoutUrl: demoUrl, demo: true, sessionId: `demo_${Date.now()}` });
  }

  try {
    // Create a Creem checkout session
    const checkoutBody = {
      amount: Math.round(amount * 100),    // Creem accepts cents
      currency: currency.toLowerCase(),
      success_url: `${appUrl}/dashboard?payment=success&plan=${planId}`,
      cancel_url:  `${appUrl}/pricing?payment=cancelled`,
      metadata: {
        plan_id: planId,
        user_id: userId || '',
        source: 'vidshorter_ai',
      },
    };

    const res = await fetch(`${CREEM_API_BASE}/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(checkoutBody),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[Creem] API error:', data);
      // Fall back to Creem payment page URL with params
      const fallbackUrl = `https://www.creem.io/payment?product=${planId}&amount=${Math.round(amount * 100)}&currency=${currency}`;
      return Response.json({ checkoutUrl: fallbackUrl, demo: false, apiError: data });
    }

    // Creem typically returns { id, url, ... }
    const checkoutUrl = data.url || data.checkout_url || data.payment_url;
    if (!checkoutUrl) {
      console.error('[Creem] No checkout URL in response:', data);
      const fallbackUrl = `https://www.creem.io/payment?product=${planId}&amount=${Math.round(amount * 100)}&currency=${currency}`;
      return Response.json({ checkoutUrl: fallbackUrl, demo: false });
    }

    return Response.json({
      checkoutUrl,
      sessionId: data.id,
      demo: false,
    });
  } catch (err) {
    console.error('[Creem] Request failed:', err);
    const demoUrl = `https://www.creem.io/payment?product=${planId}&amount=${Math.round(amount * 100)}&currency=${currency}`;
    return Response.json({ checkoutUrl: demoUrl, demo: true });
  }
}

/** Webhook: Creem payment webhook */
export async function PUT(request: NextRequest) {
  const rawBody = await request.text();
  const webhookSecret = process.env.CREEM_WEBHOOK_SECRET;

  // Verify signature if secret is configured
  if (webhookSecret) {
    const signature = request.headers.get('creem-signature') || request.headers.get('x-creem-signature') || '';
    try {
      const hmac = createHmac('sha256', webhookSecret);
      hmac.update(rawBody);
      const expected = hmac.digest('hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      const sigBuf = Buffer.from(signature.replace('sha256=', ''), 'hex');

      if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) {
        console.warn('[Creem] Webhook signature mismatch');
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } catch (e) {
      console.warn('[Creem] Webhook signature error:', e);
    }
  }

  try {
    const event = JSON.parse(rawBody);
    console.log('[Creem] Webhook event:', event.type, event.id);

    // Handle payment success
    if (event.type === 'checkout.completed' || event.type === 'payment.succeeded') {
      const planId = event.data?.metadata?.plan_id;
      const userId = event.data?.metadata?.user_id;
      const orderId = event.data?.id || event.id || `creem_${Date.now()}`;
      if (planId && userId) {
        try {
          await applyPlanPurchase({ userId, planId, provider: 'creem', orderId });
        } catch {}
      }
    }

    return Response.json({ received: true });
  } catch (err) {
    console.error('[Creem] Webhook processing error:', err);
    return Response.json({ error: 'Webhook processing failed' }, { status: 400 });
  }
}

/** Check payment status */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return Response.json({ error: 'session_id is required' }, { status: 400 });
  }

  const apiKey = process.env.CREEM_API_KEY;
  if (!apiKey) {
    return Response.json({ status: 'demo', paid: false });
  }

  try {
    const res = await fetch(`${CREEM_API_BASE}/checkouts/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });
    const data = await res.json();
    return Response.json({ status: data.status, paid: data.status === 'completed' || data.paid === true });
  } catch (err) {
    console.error('[Creem] Status check failed:', err);
    return Response.json({ status: 'unknown', paid: false });
  }
}
