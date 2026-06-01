import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/payment/creem/route';
import { POST as webhookPOST } from '../src/app/api/payment/creem/webhook/route';

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

const originalEnv = {
  CREEM_API_KEY: process.env.CREEM_API_KEY,
  CREEM_PRODUCT_IDS: process.env.CREEM_PRODUCT_IDS,
  CREEM_WEBHOOK_SECRET: process.env.CREEM_WEBHOOK_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};
const originalFetch = globalThis.fetch;

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function asRecord(value: unknown) {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

async function main() {
  setEnv('CREEM_API_KEY', undefined);
  setEnv('CREEM_PRODUCT_IDS', undefined);
  setEnv('NEXT_PUBLIC_APP_URL', 'https://www.clipopai.com');

  const missingPlan = await POST(new NextRequest('https://www.clipopai.com/api/payment/creem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }));
  assert.equal(missingPlan.status, 400);
  assert.equal((await json(missingPlan)).error, 'planId is required');

  const demoCheckout = await POST(new NextRequest('https://www.clipopai.com/api/payment/creem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      planId: 'starter',
      userId: 'user_123',
      userEmail: 'buyer@example.com',
    }),
  }));
  assert.equal(demoCheckout.status, 200);
  const demoCheckoutJson = await json(demoCheckout);
  assert.equal(demoCheckoutJson.demo, true);
  assert.match(demoCheckoutJson.checkoutUrl, /^https:\/\/www\.clipopai\.com\/dashboard\?payment=success&plan=starter/);
  assert.match(demoCheckoutJson.sessionId, /^demo_/);

  const missingSession = await GET(new NextRequest('https://www.clipopai.com/api/payment/creem'));
  assert.equal(missingSession.status, 400);
  assert.equal((await json(missingSession)).error, 'session_id is required');

  const demoStatus = await GET(new NextRequest('https://www.clipopai.com/api/payment/creem?session_id=demo_123'));
  assert.equal(demoStatus.status, 200);
  assert.deepEqual(await json(demoStatus), { status: 'demo', paid: false });

  const fetchCalls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    fetchCalls.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });

    if (url.includes('/checkouts?checkout_id=')) {
      return Response.json({ status: 'completed' });
    }

    return Response.json({
      id: 'checkout_123',
      status: 'pending',
      checkout_url: 'https://checkout.creem.io/session_123',
    });
  };
  setEnv('CREEM_API_KEY', 'creem_test_mock_key');
  setEnv('CREEM_PRODUCT_IDS', JSON.stringify({ starter: 'prod_starter_123' }));

  const liveCheckoutShape = await POST(new NextRequest('https://www.clipopai.com/api/payment/creem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      planId: 'starter',
      userId: 'user_123',
      userEmail: 'buyer@example.com',
    }),
  }));
  assert.equal(liveCheckoutShape.status, 200);
  assert.deepEqual(await json(liveCheckoutShape), {
    checkoutUrl: 'https://checkout.creem.io/session_123',
    sessionId: 'checkout_123',
    demo: false,
  });
  assert.match(fetchCalls[0].url, /^https:\/\/test-api\.creem\.io\/v1\/checkouts$/);
  assert.equal(fetchCalls[0].body?.product_id, 'prod_starter_123');
  const metadata = asRecord(fetchCalls[0].body?.metadata);
  const customer = asRecord(fetchCalls[0].body?.customer);
  assert.equal(metadata.plan_id, 'starter');
  assert.equal(metadata.user_id, 'user_123');
  assert.equal(customer.email, 'buyer@example.com');

  const paidStatus = await GET(new NextRequest('https://www.clipopai.com/api/payment/creem?session_id=checkout_123'));
  assert.equal(paidStatus.status, 200);
  assert.deepEqual(await json(paidStatus), { status: 'completed', paid: true });

  setEnv('CREEM_WEBHOOK_SECRET', 'test_creem_secret');
  const webhookBody = JSON.stringify({
    id: 'evt_123',
    eventType: 'checkout.completed',
    object: {
      metadata: {},
      order: { id: 'order_123' },
    },
  });
  const signature = createHmac('sha256', 'test_creem_secret').update(webhookBody).digest('hex');
  const webhookOk = await webhookPOST(new NextRequest('https://www.clipopai.com/api/payment/creem/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'creem-signature': signature,
    },
    body: webhookBody,
  }));
  assert.equal(webhookOk.status, 200);
  assert.deepEqual(await json(webhookOk), { received: true });

  const webhookBadSignature = await webhookPOST(new NextRequest('https://www.clipopai.com/api/payment/creem/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'creem-signature': 'bad',
    },
    body: webhookBody,
  }));
  assert.equal(webhookBadSignature.status, 401);

  const routeSource = readFileSync('src/app/api/payment/creem/route.ts', 'utf8');
  assert.match(routeSource, /CREEM_API_KEY/);
  assert.match(routeSource, /CREEM_PRODUCT_IDS/);
  assert.match(routeSource, /success_url: `\$\{appUrl\}\/dashboard\?payment=success&plan=\$\{planId\}`/);
  assert.match(routeSource, /metadata:\s*{\s*plan_id: planId,\s*user_id: userId \|\| '',\s*source: 'clipop_ai'/s);

  const webhookSource = readFileSync('src/app/api/payment/creem/webhook/route.ts', 'utf8');
  assert.match(webhookSource, /CREEM_WEBHOOK_SECRET/);
  assert.match(webhookSource, /timingSafeEqual/);
  assert.match(webhookSource, /applyPlanPurchase\(\{ userId, planId, provider: 'creem', orderId \}\)/);

  console.log('Creem payment flow checks passed.');
}

main().finally(() => {
  setEnv('CREEM_API_KEY', originalEnv.CREEM_API_KEY);
  setEnv('CREEM_PRODUCT_IDS', originalEnv.CREEM_PRODUCT_IDS);
  setEnv('CREEM_WEBHOOK_SECRET', originalEnv.CREEM_WEBHOOK_SECRET);
  setEnv('NEXT_PUBLIC_APP_URL', originalEnv.NEXT_PUBLIC_APP_URL);
  globalThis.fetch = originalFetch;
});
