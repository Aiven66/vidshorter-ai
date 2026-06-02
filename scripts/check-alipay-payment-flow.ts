import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { POST, PUT } from '../src/app/api/payment/alipay/route';

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

const originalEnv = {
  ALIPAY_APP_ID: process.env.ALIPAY_APP_ID,
  ALIPAY_PRIVATE_KEY: process.env.ALIPAY_PRIVATE_KEY,
  ALIPAY_PUBLIC_KEY: process.env.ALIPAY_PUBLIC_KEY,
  ALIPAY_NOTIFY_URL: process.env.ALIPAY_NOTIFY_URL,
  ALIPAY_PAYMENT_MODE: process.env.ALIPAY_PAYMENT_MODE,
  ALIPAY_PAGE_PAY_ENABLED: process.env.ALIPAY_PAGE_PAY_ENABLED,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};
const originalFetch = globalThis.fetch;

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

async function main() {
  setEnv('ALIPAY_APP_ID', undefined);
  setEnv('ALIPAY_PRIVATE_KEY', undefined);
  setEnv('ALIPAY_PUBLIC_KEY', undefined);
  setEnv('ALIPAY_NOTIFY_URL', undefined);
  setEnv('ALIPAY_PAYMENT_MODE', undefined);
  setEnv('ALIPAY_PAGE_PAY_ENABLED', undefined);
  setEnv('NEXT_PUBLIC_APP_URL', 'https://www.clipopai.com');

  const missingPlan = await POST(new NextRequest('https://www.clipopai.com/api/payment/alipay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }));
  assert.equal(missingPlan.status, 400);
  assert.equal((await json(missingPlan)).error, 'planId and amount are required');

  const missingConfigPayment = await POST(new NextRequest('https://www.clipopai.com/api/payment/alipay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      planId: 'starter',
      amount: 49,
      subject: 'Clipop AI Starter',
      userId: 'user_123',
    }),
  }));
  assert.equal(missingConfigPayment.status, 503);
  const missingConfigJson = await json(missingConfigPayment);
  assert.equal(missingConfigJson.configMissing, true);
  assert.match(String(missingConfigJson.error), /ALIPAY_APP_ID/);
  assert.equal('qrCode' in missingConfigJson, false);

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const alipayGatewayCalls: Array<{ url: string; body: URLSearchParams }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    alipayGatewayCalls.push({
      url: input.toString(),
      body: new URLSearchParams(String(init?.body || '')),
    });
    return Response.json({
      alipay_trade_precreate_response: {
        code: '10000',
        qr_code: 'https://qr.alipay.com/REAL_TEST_QR',
      },
    });
  };
  setEnv('ALIPAY_APP_ID', '2021000000000000');
  setEnv('ALIPAY_PRIVATE_KEY', privateKeyPem);

  const signedPayment = await POST(new NextRequest('https://www.clipopai.com/api/payment/alipay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      planId: 'pro',
      amount: 99,
      subject: 'Clipop AI Pro',
      userId: 'user_456',
    }),
  }));
  assert.equal(signedPayment.status, 200);
  assert.deepEqual(await json(signedPayment), {
    qrCode: 'https://qr.alipay.com/REAL_TEST_QR',
    orderId: alipayGatewayCalls[0].body.get('biz_content') ? JSON.parse(alipayGatewayCalls[0].body.get('biz_content') || '{}').out_trade_no : '',
    demo: false,
    checkoutMode: 'precreate',
  });
  assert.match(alipayGatewayCalls[0].url, /^https:\/\/openapi\.alipay\.com\/gateway\.do$/);
  assert.equal(alipayGatewayCalls[0].body.get('method'), 'alipay.trade.precreate');
  assert.equal(alipayGatewayCalls[0].body.get('notify_url'), 'https://www.clipopai.com/api/payment/alipay');
  assert.match(String(alipayGatewayCalls[0].body.get('timestamp')), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const bizContent = JSON.parse(alipayGatewayCalls[0].body.get('biz_content') || '{}');
  assert.equal(bizContent.product_code, 'FACE_TO_FACE_PAYMENT');
  assert.equal(bizContent.total_amount, '99.00');
  assert.deepEqual(JSON.parse(decodeURIComponent(bizContent.passback_params)), {
    user_id: 'user_456',
    plan_id: 'pro',
  });
  assert.equal(typeof alipayGatewayCalls[0].body.get('sign'), 'string');

  globalThis.fetch = async () => Response.json({
    alipay_trade_precreate_response: {
      code: '40004',
      msg: 'Business Failed',
      sub_code: 'isv.insufficient-permission',
      sub_msg: '接口调用权限不足',
    },
  }, { status: 200 });
  const missingPermissionPayment = await POST(new NextRequest('https://www.clipopai.com/api/payment/alipay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      planId: 'starter',
      amount: 49,
      subject: 'Clipop AI Starter',
      userId: 'user_789',
    }),
  }));
  assert.equal(missingPermissionPayment.status, 403);
  const missingPermissionJson = await json(missingPermissionPayment);
  assert.equal(missingPermissionJson.productPermissionMissing, true);
  assert.equal(missingPermissionJson.requiredApi, 'alipay.trade.precreate');
  assert.equal('qrCode' in missingPermissionJson, false);
  assert.equal('payUrl' in missingPermissionJson, false);

  setEnv('ALIPAY_PAYMENT_MODE', 'page');
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    alipayGatewayCalls.push({
      url: input.toString(),
      body: new URLSearchParams(String(init?.body || '')),
    });
    return Response.json({
      alipay_trade_precreate_response: {
        code: '10000',
        qr_code: 'https://qr.alipay.com/SAFE_QR_WHEN_PAGE_MODE_NOT_ENABLED',
      },
    });
  };
  const legacyPageModePayment = await POST(new NextRequest('https://www.clipopai.com/api/payment/alipay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      planId: 'starter',
      amount: 49,
      subject: 'Clipop AI Starter',
      userId: 'user_789',
    }),
  }));
  assert.equal(legacyPageModePayment.status, 200);
  const legacyPageModeJson = await json(legacyPageModePayment);
  assert.equal(legacyPageModeJson.checkoutMode, 'precreate');
  assert.equal(legacyPageModeJson.qrCode, 'https://qr.alipay.com/SAFE_QR_WHEN_PAGE_MODE_NOT_ENABLED');
  assert.equal('payUrl' in legacyPageModeJson, false);

  setEnv('ALIPAY_PAGE_PAY_ENABLED', 'true');
  const pagePayPayment = await POST(new NextRequest('https://www.clipopai.com/api/payment/alipay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      planId: 'starter',
      amount: 49,
      subject: 'Clipop AI Starter',
      userId: 'user_789',
    }),
  }));
  assert.equal(pagePayPayment.status, 200);
  const pagePayPaymentJson = await json(pagePayPayment);
  assert.equal(pagePayPaymentJson.checkoutMode, 'page');
  assert.equal('qrCode' in pagePayPaymentJson, false);
  const payUrl = new URL(String(pagePayPaymentJson.payUrl));
  assert.equal(payUrl.origin + payUrl.pathname, 'https://openapi.alipay.com/gateway.do');
  assert.equal(payUrl.searchParams.get('method'), 'alipay.trade.page.pay');
  assert.equal(payUrl.searchParams.get('return_url'), 'https://www.clipopai.com/dashboard?payment=alipay&plan=starter');
  const pagePayBiz = JSON.parse(payUrl.searchParams.get('biz_content') || '{}');
  assert.equal(pagePayBiz.product_code, 'FAST_INSTANT_TRADE_PAY');
  assert.equal(pagePayBiz.total_amount, '49.00');
  setEnv('ALIPAY_PAYMENT_MODE', undefined);
  setEnv('ALIPAY_PAGE_PAY_ENABLED', undefined);

  globalThis.fetch = async () => Response.json({
    alipay_trade_precreate_response: {
      code: '40004',
      msg: 'Business Failed',
      sub_code: 'isv.invalid-signature',
      sub_msg: '验签出错',
    },
  }, { status: 200 });
  const rejectedPayment = await POST(new NextRequest('https://www.clipopai.com/api/payment/alipay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      planId: 'pro',
      amount: 99,
      subject: 'Clipop AI Pro',
      userId: 'user_456',
    }),
  }));
  assert.equal(rejectedPayment.status, 502);
  const rejectedPaymentJson = await json(rejectedPayment);
  assert.equal(rejectedPaymentJson.error, '验签出错');
  assert.equal('qrCode' in rejectedPaymentJson, false);

  const formBody = new URLSearchParams({
    trade_status: 'TRADE_SUCCESS',
    out_trade_no: 'alipay_order_123',
  });
  const postNotify = await POST(new NextRequest('https://www.clipopai.com/api/payment/alipay', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody,
  }));
  assert.equal(postNotify.status, 200);
  assert.equal(await postNotify.text(), 'success');

  const putNotify = await PUT(new NextRequest('https://www.clipopai.com/api/payment/alipay', {
    method: 'PUT',
    body: formBody,
  }));
  assert.equal(putNotify.status, 200);
  assert.equal(await putNotify.text(), 'success');

  const routeSource = readFileSync('src/app/api/payment/alipay/route.ts', 'utf8');
  assert.match(routeSource, /NEXT_PUBLIC_APP_URL/);
  assert.match(routeSource, /ALIPAY_NOTIFY_URL/);
  assert.match(routeSource, /application\/x-www-form-urlencoded/);
  assert.match(routeSource, /passback_params: buildPassbackParams\(userId, planId\)/);
  assert.match(routeSource, /alipay\.trade\.page\.pay/);
  assert.match(routeSource, /FAST_INSTANT_TRADE_PAY/);
  assert.match(routeSource, /productPermissionMissing/);
  assert.match(routeSource, /ALIPAY_PAYMENT_MODE/);
  assert.match(routeSource, /ALIPAY_PAGE_PAY_ENABLED/);
  assert.match(routeSource, /configMissing/);
  assert.doesNotMatch(routeSource, /DEMO_/);
  assert.doesNotMatch(routeSource, /demoQr/);
  assert.match(routeSource, /export async function PUT/);

  const modalSource = readFileSync('src/components/payment-modal.tsx', 'utf8');
  assert.match(modalSource, /Pay with Alipay/);
  assert.match(modalSource, /\/api\/payment\/alipay/);
  assert.match(modalSource, /qrCode/);
  assert.match(modalSource, /alipayCheckoutUrl/);
  assert.match(modalSource, /productPermissionMissing/);
  assert.match(modalSource, /Face-to-Face Payment/);
  assert.doesNotMatch(modalSource, /qr\.alipay\.com\/demo/);

  console.log('Alipay payment flow checks passed.');
}

main().finally(() => {
  setEnv('ALIPAY_APP_ID', originalEnv.ALIPAY_APP_ID);
  setEnv('ALIPAY_PRIVATE_KEY', originalEnv.ALIPAY_PRIVATE_KEY);
  setEnv('ALIPAY_PUBLIC_KEY', originalEnv.ALIPAY_PUBLIC_KEY);
  setEnv('ALIPAY_NOTIFY_URL', originalEnv.ALIPAY_NOTIFY_URL);
  setEnv('ALIPAY_PAYMENT_MODE', originalEnv.ALIPAY_PAYMENT_MODE);
  setEnv('ALIPAY_PAGE_PAY_ENABLED', originalEnv.ALIPAY_PAGE_PAY_ENABLED);
  setEnv('NEXT_PUBLIC_APP_URL', originalEnv.NEXT_PUBLIC_APP_URL);
  globalThis.fetch = originalFetch;
});
