import { NextRequest } from 'next/server';
import { applyPlanPurchase, isPaidPlan } from '@/lib/server/subscriptions';

// Plan prices must match pricing page exactly
const PLAN_PRICES: Record<string, string> = {
  starter: '9.90',
  pro: '19.90',
};

const PLAN_NAMES: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
};

function getPaypalBaseUrl() {
  return process.env.PAYPAL_ENV?.trim().toLowerCase() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

function getPaypalConfig() {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim() || '';
  return {
    clientId,
    clientSecret,
    currency: process.env.NEXT_PUBLIC_PAYPAL_CURRENCY?.trim() || 'USD',
    enabled: Boolean(clientId && clientSecret),
    environment: process.env.PAYPAL_ENV?.trim().toLowerCase() === 'live' ? 'live' : 'sandbox',
  };
}

async function getAccessToken(clientId: string, clientSecret: string) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${getPaypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    console.error('[PayPal] Failed to get access token:', response.status, JSON.stringify(data));
    throw new Error('PayPal authentication failed');
  }
  return String(data.access_token);
}

/** GET /api/payment/paypal — return config for frontend */
export async function GET() {
  const config = getPaypalConfig();
  return Response.json({
    enabled: config.enabled,
    clientId: config.clientId || null,
    currency: config.currency,
    environment: config.environment,
    status: config.enabled ? 'ready' : 'pending_configuration',
  });
}

/** POST /api/payment/paypal — create order or capture order */
export async function POST(request: NextRequest) {
  const config = getPaypalConfig();
  if (!config.enabled) {
    return Response.json({
      error: 'PayPal is pending configuration',
      configMissing: true,
      requiredEnv: ['NEXT_PUBLIC_PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
    }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { action, planId, userId, orderId } = body as {
    action?: 'create' | 'capture';
    planId?: string;
    userId?: string;
    orderId?: string;
  };

  if (!action || (action !== 'create' && action !== 'capture')) {
    return Response.json({ error: 'action must be "create" or "capture"' }, { status: 400 });
  }

  if (!isPaidPlan(planId)) {
    return Response.json({ error: 'Invalid paid plan' }, { status: 400 });
  }

  if (!userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 });
  }

  const accessToken = await getAccessToken(config.clientId, config.clientSecret);

  // ── Create Order ──────────────────────────────────────────────
  if (action === 'create') {
    const price = PLAN_PRICES[planId];
    const planName = PLAN_NAMES[planId] || planId;

    const response = await fetch(`${getPaypalBaseUrl()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `clipop-${planId}-${userId}-${Date.now()}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: planId,
          custom_id: userId,
          description: `Clipop AI ${planName} Plan`,
          amount: {
            currency_code: config.currency,
            value: price,
          },
        }],
        application_context: {
          brand_name: 'Clipop AI',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
          return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.clipopai.com'}/pricing?paypal=success`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.clipopai.com'}/pricing?paypal=cancelled`,
        },
      }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.id) {
      console.error('[PayPal] Create order failed:', response.status, JSON.stringify(data));
      return Response.json({ error: 'Failed to create PayPal order', details: data }, { status: 502 });
    }

    console.log(`[PayPal] Order created: ${data.id} plan=${planId} user=${userId}`);
    return Response.json({ orderId: data.id, status: data.status });
  }

  // ── Capture Order ─────────────────────────────────────────────
  if (action === 'capture') {
    if (!orderId) {
      return Response.json({ error: 'orderId is required for capture' }, { status: 400 });
    }

    // First, verify the order details before capturing
    const orderDetailsRes = await fetch(`${getPaypalBaseUrl()}/v2/checkout/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    const orderDetails = await orderDetailsRes.json().catch(() => ({}));

    if (orderDetailsRes.ok && orderDetails.purchase_units) {
      const unit = orderDetails.purchase_units[0];
      // Verify the order matches the expected plan and user
      if (unit?.custom_id !== userId || unit?.reference_id !== planId) {
        console.error('[PayPal] Order verification failed: mismatch', {
          expectedUser: userId, orderUser: unit?.custom_id,
          expectedPlan: planId, orderPlan: unit?.reference_id,
        });
        return Response.json({ error: 'Order verification failed' }, { status: 400 });
      }
      // Verify amount
      const expectedPrice = PLAN_PRICES[planId];
      if (unit?.amount?.value !== expectedPrice || unit?.amount?.currency_code !== config.currency) {
        console.error('[PayPal] Amount mismatch:', {
          expected: `${expectedPrice} ${config.currency}`,
          actual: `${unit?.amount?.value} ${unit?.amount?.currency_code}`,
        });
        return Response.json({ error: 'Payment amount mismatch' }, { status: 400 });
      }
    }

    // Capture the order
    const response = await fetch(`${getPaypalBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('[PayPal] Capture order failed:', response.status, JSON.stringify(data));
      // Handle already captured
      if (data.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
        console.log(`[PayPal] Order ${orderId} was already captured, treating as success`);
        await applyPlanPurchase({ userId, planId, provider: 'paypal', orderId });
        return Response.json({ paid: true, orderId, status: 'ALREADY_CAPTURED' });
      }
      return Response.json({ error: 'Failed to capture PayPal order', details: data }, { status: 502 });
    }

    if (data.status !== 'COMPLETED') {
      console.error('[PayPal] Capture not completed:', data.status, JSON.stringify(data));
      return Response.json({ error: 'Payment not completed', status: data.status }, { status: 502 });
    }

    // Apply the purchase
    const success = await applyPlanPurchase({ userId, planId, provider: 'paypal', orderId });

    if (!success) {
      console.error('[PayPal] Failed to apply plan purchase:', { userId, planId, orderId });
      return Response.json({ error: 'Payment received but failed to activate plan. Please contact support.' }, { status: 500 });
    }

    console.log(`[PayPal] Payment captured and plan activated: order=${orderId} plan=${planId} user=${userId}`);
    return Response.json({ paid: true, orderId, status: data.status });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
}
