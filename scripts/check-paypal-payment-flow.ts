import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/payment/paypal/route';

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

const originalEnv = {
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
  PAYPAL_ENV: process.env.PAYPAL_ENV,
  NEXT_PUBLIC_PAYPAL_CURRENCY: process.env.NEXT_PUBLIC_PAYPAL_CURRENCY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  COZE_SUPABASE_URL: process.env.COZE_SUPABASE_URL,
  COZE_SUPABASE_ANON_KEY: process.env.COZE_SUPABASE_ANON_KEY,
};
const originalFetch = globalThis.fetch;

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

async function main() {
  setEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID', undefined);
  setEnv('PAYPAL_CLIENT_SECRET', undefined);
  setEnv('PAYPAL_ENV', undefined);
  setEnv('NEXT_PUBLIC_PAYPAL_CURRENCY', undefined);
  setEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
  setEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', undefined);
  setEnv('COZE_SUPABASE_URL', undefined);
  setEnv('COZE_SUPABASE_ANON_KEY', undefined);

  const pendingConfig = await GET();
  assert.equal(pendingConfig.status, 200);
  assert.deepEqual(await json(pendingConfig), {
    enabled: false,
    clientId: null,
    currency: 'USD',
    environment: 'sandbox',
    status: 'pending_configuration',
  });

  const missingConfigCreate = await POST(new NextRequest('https://www.clipopai.com/api/payment/paypal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', planId: 'starter', userId: 'user_123' }),
  }));
  assert.equal(missingConfigCreate.status, 503);
  assert.equal((await json(missingConfigCreate)).configMissing, true);

  setEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID', 'paypal_client_id');
  setEnv('PAYPAL_CLIENT_SECRET', 'paypal_client_secret');
  setEnv('PAYPAL_ENV', 'sandbox');
  setEnv('NEXT_PUBLIC_PAYPAL_CURRENCY', 'USD');

  const fetchCalls: Array<{ url: string; body?: Record<string, unknown> | string; auth?: string | null }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    fetchCalls.push({
      url,
      body: typeof init?.body === 'string' && init.body.startsWith('{')
        ? JSON.parse(init.body)
        : String(init?.body || ''),
      auth: init?.headers instanceof Headers
        ? init.headers.get('authorization')
        : (init?.headers as Record<string, string> | undefined)?.Authorization || null,
    });

    if (url.endsWith('/v1/oauth2/token')) {
      return Response.json({ access_token: 'paypal_access_token' });
    }

    if (url.endsWith('/v2/checkout/orders')) {
      return Response.json({ id: 'PAYPAL_ORDER_123', status: 'CREATED' });
    }

    if (url.endsWith('/v2/checkout/orders/PAYPAL_ORDER_123/capture')) {
      return Response.json({ id: 'PAYPAL_ORDER_123', status: 'COMPLETED' });
    }

    return Response.json({ error: 'unexpected mock url' }, { status: 500 });
  };

  const readyConfig = await GET();
  assert.equal(readyConfig.status, 200);
  const readyJson = await json(readyConfig);
  assert.equal(readyJson.enabled, true);
  assert.equal(readyJson.clientId, 'paypal_client_id');
  assert.equal(readyJson.status, 'ready');

  const created = await POST(new NextRequest('https://www.clipopai.com/api/payment/paypal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', planId: 'starter', userId: 'user_123' }),
  }));
  assert.equal(created.status, 200);
  assert.deepEqual(await json(created), { orderId: 'PAYPAL_ORDER_123' });
  assert.match(fetchCalls[0].url, /\/v1\/oauth2\/token$/);
  assert.match(String(fetchCalls[0].auth), /^Basic /);
  assert.match(fetchCalls[1].url, /\/v2\/checkout\/orders$/);
  const createBody = fetchCalls[1].body as Record<string, unknown>;
  const purchaseUnits = createBody.purchase_units as Array<Record<string, unknown>>;
  assert.equal(createBody.intent, 'CAPTURE');
  assert.equal(purchaseUnits[0].custom_id, 'user_123');
  assert.deepEqual(purchaseUnits[0].amount, { currency_code: 'USD', value: '9.90' });

  const captured = await POST(new NextRequest('https://www.clipopai.com/api/payment/paypal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'capture',
      planId: 'starter',
      userId: 'user_123',
      orderId: 'PAYPAL_ORDER_123',
    }),
  }));
  assert.equal(captured.status, 200);
  assert.deepEqual(await json(captured), {
    paid: true,
    orderId: 'PAYPAL_ORDER_123',
    status: 'COMPLETED',
  });

  const modalSource = readFileSync('src/components/payment-modal.tsx', 'utf8');
  const paypalComponentSource = readFileSync('src/components/paypal-checkout.tsx', 'utf8');
  const pricingSource = readFileSync('src/app/pricing/page.tsx', 'utf8');
  const localeFiles = readdirSync('src/lib/i18n/locales')
    .filter(file => file.endsWith('.ts'))
    .map(file => readFileSync(`src/lib/i18n/locales/${file}`, 'utf8'));
  assert.match(modalSource, /PayPalCheckout/);
  assert.match(modalSource, /setMethod\('paypal'\)/);
  assert.doesNotMatch(modalSource, /setMethod\('alipay'\)/);
  assert.doesNotMatch(modalSource, /Open Alipay Checkout/);
  assert.match(paypalComponentSource, /https:\/\/www\.paypal\.com\/sdk\/js/);
  assert.match(paypalComponentSource, /components=buttons/);
  assert.match(paypalComponentSource, /\/api\/payment\/paypal/);
  assert.doesNotMatch(pricingSource, /ALI/);
  assert.match(pricingSource, /PayPal/);
  for (const localeSource of localeFiles) {
    assert.doesNotMatch(localeSource, /Alipay|支付宝|支付寶/);
  }

  console.log('PayPal payment flow checks passed.');
}

main().finally(() => {
  setEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID', originalEnv.NEXT_PUBLIC_PAYPAL_CLIENT_ID);
  setEnv('PAYPAL_CLIENT_SECRET', originalEnv.PAYPAL_CLIENT_SECRET);
  setEnv('PAYPAL_ENV', originalEnv.PAYPAL_ENV);
  setEnv('NEXT_PUBLIC_PAYPAL_CURRENCY', originalEnv.NEXT_PUBLIC_PAYPAL_CURRENCY);
  setEnv('NEXT_PUBLIC_SUPABASE_URL', originalEnv.NEXT_PUBLIC_SUPABASE_URL);
  setEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', originalEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  setEnv('COZE_SUPABASE_URL', originalEnv.COZE_SUPABASE_URL);
  setEnv('COZE_SUPABASE_ANON_KEY', originalEnv.COZE_SUPABASE_ANON_KEY);
  globalThis.fetch = originalFetch;
});
