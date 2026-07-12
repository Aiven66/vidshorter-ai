import { NextRequest, NextResponse } from 'next/server';
import { applyPlanPurchase, isPaidPlan } from '@/lib/server/subscriptions';
import { trackSubscribeSuccess } from '@/lib/server/track-event';

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

export async function GET() {
  const config = getPaypalConfig();
  console.log('[PayPal] GET config:', { enabled: config.enabled, currency: config.currency, env: config.environment });
  return Response.json({
    enabled: config.enabled,
    clientId: config.clientId,
    currency: config.currency,
    environment: config.environment,
  });
}

export async function POST(request: NextRequest) {
  const config = getPaypalConfig();
  if (!config.enabled) {
    return Response.json({ error: 'PayPal not configured' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { action, planId, userId, orderId } = body;

  if (!action || !planId || !userId) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!isPaidPlan(planId)) {
    return Response.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const accessToken = await getAccessToken(config.clientId, config.clientSecret);

  if (action === 'create') {
    const price = PLAN_PRICES[planId];
    const planName = PLAN_NAMES[planId];

    console.log('[PayPal] Creating order:', { planId, userId, price });

    const response = await fetch(`${getPaypalBaseUrl()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: planId,
          custom_id: userId,
          description: `Clipop AI ${planName}`,
          amount: {
            currency_code: config.currency,
            value: price,
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
    console.log('[PayPal] Create order response:', { status: response.status, orderId: data.id });

    if (!response.ok || !data.id) {
      return Response.json({ error: 'Failed to create order' }, { status: 500 });
    }

    return Response.json({ orderId: data.id });
  }

  if (action === 'capture') {
    if (!orderId) {
      return Response.json({ error: 'Order ID required' }, { status: 400 });
    }

    console.log('[PayPal] Capturing order:', orderId);

    const captureResponse = await fetch(`${getPaypalBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const captureData = await captureResponse.json().catch(() => ({}));
    console.log('[PayPal] Capture response:', { status: captureResponse.status, data: captureData });

    if (captureResponse.ok && captureData.status === 'COMPLETED') {
      await applyPlanPurchase({ userId, planId, provider: 'paypal', orderId });
      // 服务端埋点：付费成功（PayPal）— 即使前端关闭浏览器也能记录
      await trackSubscribeSuccess({
        userId,
        paymentMethod: 'paypal',
        planId,
        planName: PLAN_NAMES[planId] || planId,
        amountUsd: parseFloat(PLAN_PRICES[planId] || '0'),
        orderId,
      });
      return Response.json({ paid: true });
    }

    if (captureData.details?.some((d: any) => d.issue === 'ORDER_ALREADY_CAPTURED')) {
      await applyPlanPurchase({ userId, planId, provider: 'paypal', orderId });
      // 服务端埋点：付费成功（PayPal，已捕获订单）
      await trackSubscribeSuccess({
        userId,
        paymentMethod: 'paypal',
        planId,
        planName: PLAN_NAMES[planId] || planId,
        amountUsd: parseFloat(PLAN_PRICES[planId] || '0'),
        orderId,
      });
      return Response.json({ paid: true });
    }

    return Response.json({ error: 'Failed to capture payment' }, { status: 500 });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
}
