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
  ALIPAY_APP_AUTH_TOKEN: process.env.ALIPAY_APP_AUTH_TOKEN,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};
const originalFetch = globalThis.fetch;

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function paymentRequest(body: Record<string, unknown>) {
  return new NextRequest('https://www.clipopai.com/api/payment/alipay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function main() {
  setEnv('ALIPAY_APP_ID', undefined);
  setEnv('ALIPAY_PRIVATE_KEY', undefined);
  setEnv('ALIPAY_PUBLIC_KEY', undefined);
  setEnv('ALIPAY_NOTIFY_URL', undefined);
  setEnv('ALIPAY_PAYMENT_MODE', undefined);
  setEnv('ALIPAY_PAGE_PAY_ENABLED', undefined);
  setEnv('ALIPAY_APP_AUTH_TOKEN', undefined);
  setEnv('NEXT_PUBLIC_APP_URL', 'https://www.clipopai.com');

  const missingPlan = await POST(paymentRequest({}));
  assert.equal(missingPlan.status, 400);
  assert.equal((await json(missingPlan)).error, 'planId and amount are required');

  const missingConfigPayment = await POST(paymentRequest({
    planId: 'starter',
    amount: 49,
    subject: 'Clipop AI Starter',
    userId: 'user_123',
  }));
  assert.equal(missingConfigPayment.status, 503);
  const missingConfigJson = await json(missingConfigPayment);
  assert.equal(missingConfigJson.configMissing, true);
  assert.match(String(missingConfigJson.error), /ALIPAY_APP_ID/);
  assert.equal('qrCode' in missingConfigJson, false);

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  setEnv('ALIPAY_APP_ID', '2021000000000000');
  setEnv('ALIPAY_PRIVATE_KEY', privateKeyPem);

  let gatewayCallCount = 0;
  globalThis.fetch = async () => {
    gatewayCallCount++;
    return Response.json({});
  };

  const defaultPagePayment = await POST(paymentRequest({
    planId: 'pro',
    amount: 99,
    subject: 'Clipop AI Pro',
    userId: 'user_456',
  }));
  assert.equal(defaultPagePayment.status, 200);
  const defaultPageJson = await json(defaultPagePayment);
  assert.equal(defaultPageJson.checkoutMode, 'page');
  assert.equal(defaultPageJson.demo, false);
  assert.equal('qrCode' in defaultPageJson, false);
  assert.equal(gatewayCallCount, 0, 'page mode must not call the gateway from the server');
  const defaultPayUrl = new URL(String(defaultPageJson.payUrl));
  assert.equal(defaultPayUrl.origin + defaultPayUrl.pathname, 'https://openapi.alipay.com/gateway.do');
  assert.equal(defaultPayUrl.searchParams.get('method'), 'alipay.trade.page.pay');
  assert.equal(defaultPayUrl.searchParams.get('notify_url'), 'https://www.clipopai.com/api/payment/alipay');
  assert.equal(defaultPayUrl.searchParams.get('return_url'), 'https://www.clipopai.com/dashboard?payment=alipay&plan=pro');
  assert.match(String(defaultPayUrl.searchParams.get('timestamp')), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const defaultPageBiz = JSON.parse(defaultPayUrl.searchParams.get('biz_content') || '{}');
  assert.equal(defaultPageBiz.product_code, 'FAST_INSTANT_TRADE_PAY');
  assert.equal(defaultPageBiz.total_amount, '99.00');
  assert.deepEqual(JSON.parse(decodeURIComponent(defaultPageBiz.passback_params)), {
    user_id: 'user_456',
    plan_id: 'pro',
  });
  assert.equal(typeof defaultPayUrl.searchParams.get('sign'), 'string');

  setEnv('ALIPAY_PAYMENT_MODE', 'precreate');
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

  const precreatePayment = await POST(paymentRequest({
    planId: 'pro',
    amount: 99,
    subject: 'Clipop AI Pro',
    userId: 'user_456',
  }));
  assert.equal(precreatePayment.status, 200);
  assert.deepEqual(await json(precreatePayment), {
    qrCode: 'https://qr.alipay.com/REAL_TEST_QR',
    orderId: JSON.parse(alipayGatewayCalls[0].body.get('biz_content') || '{}').out_trade_no,
    demo: false,
    checkoutMode: 'precreate',
    productCode: 'FACE_TO_FACE_PAYMENT',
  });
  assert.match(alipayGatewayCalls[0].url, /^https:\/\/openapi\.alipay\.com\/gateway\.do$/);
  assert.equal(alipayGatewayCalls[0].body.get('method'), 'alipay.trade.precreate');
  assert.equal(alipayGatewayCalls[0].body.get('notify_url'), 'https://www.clipopai.com/api/payment/alipay');
  const precreateBiz = JSON.parse(alipayGatewayCalls[0].body.get('biz_content') || '{}');
  assert.equal(precreateBiz.product_code, 'FACE_TO_FACE_PAYMENT');

  setEnv('ALIPAY_APP_AUTH_TOKEN', 'merchant_auth_token_123');
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    alipayGatewayCalls.push({
      url: input.toString(),
      body: new URLSearchParams(String(init?.body || '')),
    });
    return Response.json({
      alipay_trade_precreate_response: {
        code: '10000',
        qr_code: 'https://qr.alipay.com/AUTH_TOKEN_QR',
      },
    });
  };
  const authTokenPayment = await POST(paymentRequest({
    planId: 'starter',
    amount: 49,
    subject: 'Clipop AI Starter',
    userId: 'user_auth_token',
  }));
  assert.equal(authTokenPayment.status, 200);
  const authTokenCall = alipayGatewayCalls.at(-1)!.body;
  assert.equal(authTokenCall.get('app_auth_token'), 'merchant_auth_token_123');
  assert.equal((await json(authTokenPayment)).qrCode, 'https://qr.alipay.com/AUTH_TOKEN_QR');
  setEnv('ALIPAY_APP_AUTH_TOKEN', undefined);

  globalThis.fetch = async () => Response.json({
    alipay_trade_precreate_response: {
      code: '40004',
      msg: 'Business Failed',
      sub_code: 'isv.insufficient-permission',
      sub_msg: '接口调用权限不足',
    },
  }, { status: 200 });
  const missingPermissionPayment = await POST(paymentRequest({
    planId: 'starter',
    amount: 49,
    subject: 'Clipop AI Starter',
    userId: 'user_789',
  }));
  assert.equal(missingPermissionPayment.status, 403);
  const missingPermissionJson = await json(missingPermissionPayment);
  assert.equal(missingPermissionJson.productPermissionMissing, true);
  assert.equal(missingPermissionJson.requiredApi, 'alipay.trade.precreate');
  assert.equal(missingPermissionJson.appAuthTokenConfigured, false);
  assert.equal('qrCode' in missingPermissionJson, false);
  assert.equal('payUrl' in missingPermissionJson, false);

  let fallbackCallCount = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    fallbackCallCount++;
    alipayGatewayCalls.push({
      url: input.toString(),
      body: new URLSearchParams(String(init?.body || '')),
    });
    const biz = JSON.parse(new URLSearchParams(String(init?.body || '')).get('biz_content') || '{}');
    if (biz.product_code === 'FACE_TO_FACE_PAYMENT') {
      return Response.json({
        alipay_trade_precreate_response: {
          code: '40006',
          msg: 'Insufficient Permissions',
          sub_code: 'isv.insufficient-isv-permissions',
          sub_msg: '接口调用权限不足',
        },
      });
    }
    return Response.json({
      alipay_trade_precreate_response: {
        code: '10000',
        qr_code: 'https://qr.alipay.com/FALLBACK_OFFLINE_PAYMENT_QR',
      },
    });
  };
  const fallbackPayment = await POST(paymentRequest({
    planId: 'starter',
    amount: 49,
    subject: 'Clipop AI Starter',
    userId: 'user_789',
  }));
  assert.equal(fallbackPayment.status, 200);
  const fallbackJson = await json(fallbackPayment);
  assert.equal(fallbackJson.qrCode, 'https://qr.alipay.com/FALLBACK_OFFLINE_PAYMENT_QR');
  assert.equal(fallbackJson.productCode, 'OFFLINE_PAYMENT');
  assert.equal(fallbackCallCount, 2);

  globalThis.fetch = async () => Response.json({
    alipay_trade_precreate_response: {
      code: '40004',
      msg: 'Business Failed',
      sub_code: 'isv.invalid-signature',
      sub_msg: '验签出错',
    },
  }, { status: 200 });
  const rejectedPayment = await POST(paymentRequest({
    planId: 'pro',
    amount: 99,
    subject: 'Clipop AI Pro',
    userId: 'user_456',
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
  assert.match(routeSource, /OFFLINE_PAYMENT/);
  assert.match(routeSource, /ALIPAY_PRODUCT_CODE/);
  assert.match(routeSource, /ALIPAY_APP_AUTH_TOKEN/);
  assert.match(routeSource, /app_auth_token/);
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
  assert.match(modalSource, /Web Payment mode/);
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
  setEnv('ALIPAY_APP_AUTH_TOKEN', originalEnv.ALIPAY_APP_AUTH_TOKEN);
  setEnv('NEXT_PUBLIC_APP_URL', originalEnv.NEXT_PUBLIC_APP_URL);
  globalThis.fetch = originalFetch;
});
