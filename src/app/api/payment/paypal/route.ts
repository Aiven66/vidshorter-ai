import { NextRequest } from 'next/server';
import { applyPlanPurchase, isPaidPlan } from '@/lib/server/subscriptions';

const PLAN_PRICES: Record<'starter' | 'pro', string> = {
  starter: '9.90',
  pro: '19.90',
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
    console.error('[PayPal] Failed to get access token:', response.status, data);
    throw new Error('PayPal authentication failed');
  }
  return String(data.access_token);
}

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

export async function POST(request: NextRequest) {
  const config = getPaypalConfig();
  if (!config.enabled) {
    return Response.json({
      error: 'PayPal is pending approval/configuration',
      configMissing: true,
      requiredEnv: ['NEXT_PUBLIC_PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
    }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const { action, planId, userId, orderId } = body as {
    action?: 'create' | 'capture';
    planId?: string;
    userId?: string;
    orderId?: string;
  };

  if (!isPaidPlan(planId)) {
    return Response.json({ error: 'Invalid paid plan' }, { status: 400 });
  }

  if (!userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 });
  }

  const accessToken = await getAccessToken(config.clientId, config.clientSecret);

  if (action === 'create') {
    const response = await fetch(`${getPaypalBaseUrl()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: planId,
          custom_id: userId,
          description: `Clipop AI ${planId} subscription`,
          amount: {
            currency_code: config.currency,
            value: PLAN_PRICES[planId],
          },
        }],
        application_context: {
          brand_name: 'Clipop AI',
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
        },
      }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.id) {
      console.error('[PayPal] Create order failed:', response.status, data);
      return Response.json({ error: 'Failed to create PayPal order', apiError: data }, { status: 502 });
    }
    return Response.json({ orderId: data.id });
  }

  if (action === 'capture') {
    if (!orderId) {
      return Response.json({ error: 'orderId is required' }, { status: 400 });
    }

    const response = await fetch(`${getPaypalBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== 'COMPLETED') {
      console.error('[PayPal] Capture order failed:', response.status, data);
      return Response.json({ error: 'Failed to capture PayPal order', apiError: data }, { status: 502 });
    }

    await applyPlanPurchase({ userId, planId, provider: 'paypal', orderId });
    return Response.json({ paid: true, orderId, status: data.status });
  }

  return Response.json({ error: 'Invalid PayPal action' }, { status: 400 });
}
