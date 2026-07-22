import { NextRequest } from 'next/server';
import { createSign, createVerify } from 'crypto';
import { applyPlanPurchase, isPaidPlan } from '@/lib/server/subscriptions';

// Force dynamic — prevents Next.js from trying to statically generate this API route at build time.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

function getAlipayGateway(sandbox: boolean) {
  return sandbox
    ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
    : 'https://openapi.alipay.com/gateway.do';
}

function signAlipay(params: Record<string, string>, privateKeyPem: string): string {
  const keys = Object.keys(params).sort();
  const str = keys.map(k => `${k}=${params[k]}`).join('&');
  const sign = createSign('RSA-SHA256');
  sign.update(str, 'utf8');
  return sign.sign(privateKeyPem, 'base64');
}

function toPem(base64Key: string, type: 'PRIVATE KEY' | 'PUBLIC KEY'): string {
  const normalized = base64Key.trim().replace(/\\n/g, '\n');
  if (normalized.includes('-----BEGIN')) return normalized;
  const clean = normalized.replace(/\s+/g, '');
  const lines = clean.match(/.{1,64}/g)?.join('\n') ?? clean;
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----`;
}

function formatAlipayTimestamp(date = new Date()) {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getAppUrl(request: NextRequest) {
  return (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '');
}

function buildPassbackParams(userId: string | undefined, planId: string) {
  if (!userId) return undefined;
  return encodeURIComponent(JSON.stringify({ user_id: userId, plan_id: planId }));
}

function buildSignedParams(params: Record<string, string>, privateKeyPem: string) {
  const signed = { ...params };
  signed.sign = signAlipay(signed, privateKeyPem);
  return signed;
}

function getPageProductCode() {
  return process.env.ALIPAY_PAGE_PRODUCT_CODE?.trim() || 'FAST_INSTANT_TRADE_PAY';
}

function paramsToBody(params: Record<string, string>) {
  const formBody = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    formBody.set(k, v);
  }
  return formBody;
}

function alipayConfigError(missing: string[]) {
  return Response.json({
    error: `Alipay is not configured. Missing: ${missing.join(', ')}`,
    configMissing: true,
    required: ['ALIPAY_APP_ID', 'ALIPAY_PRIVATE_KEY', 'ALIPAY_PUBLIC_KEY', 'ALIPAY_NOTIFY_URL'],
  }, { status: 503 });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    return handleAlipayNotify(request);
  }

  const body = await request.json().catch(() => ({}));
  const { planId, amount, subject, userId } = body as {
    planId?: string;
    amount?: number;
    subject?: string;
    userId?: string;
  };

  if (!planId || !amount || Number(amount) <= 0) {
    return Response.json({ error: 'planId and amount are required' }, { status: 400 });
  }

  const appId = process.env.ALIPAY_APP_ID;
  const privateKeyB64 = process.env.ALIPAY_PRIVATE_KEY;
  const appUrl = getAppUrl(request);
  const notifyUrl =
    process.env.ALIPAY_NOTIFY_URL ||
    `${appUrl}/api/payment/alipay`;
  const sandbox = process.env.ALIPAY_SANDBOX === 'true';

  const missing = [
    !appId && 'ALIPAY_APP_ID',
    !privateKeyB64 && 'ALIPAY_PRIVATE_KEY',
  ].filter(Boolean) as string[];
  if (missing.length > 0) return alipayConfigError(missing);

  const privateKeyPem = toPem(privateKeyB64, 'PRIVATE KEY');
  const outTradeNo = `vids_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const gateway = getAlipayGateway(sandbox);

  const baseParams: Record<string, string> = {
    app_id: appId,
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: formatAlipayTimestamp(),
    version: '1.0',
    notify_url: notifyUrl,
  };

  const pagePayParams = buildSignedParams({
    ...baseParams,
    method: 'alipay.trade.page.pay',
    return_url: `${appUrl}/dashboard?payment=alipay&plan=${planId}`,
    biz_content: JSON.stringify({
      out_trade_no: outTradeNo,
      total_amount: amount.toFixed(2),
      subject: subject || 'VidShorter AI 订阅',
      product_code: getPageProductCode(),
      passback_params: buildPassbackParams(userId, planId),
    }),
  }, privateKeyPem);

  return Response.json({
    payUrl: `${gateway}?${paramsToBody(pagePayParams).toString()}`,
    orderId: outTradeNo,
    demo: false,
    checkoutMode: 'page',
    productCode: getPageProductCode(),
    requiredProduct: '电脑网站支付',
    requiredApi: 'alipay.trade.page.pay',
    directMerchantMode: true,
    ignoredLegacyMode: {
      precreate: Boolean(process.env.ALIPAY_PAYMENT_MODE || process.env.ALIPAY_ENABLE_PRECREATE || process.env.ALIPAY_FORCE_PRECREATE),
      isv: Boolean(process.env.ALIPAY_ISV_MODE || process.env.ALIPAY_FORCE_ISV_MODE || process.env.ALIPAY_APP_AUTH_TOKEN),
    },
    checkoutInstruction: 'Open Alipay web checkout. Users can log in or scan the QR code shown by Alipay on the official checkout page.',
  });
}

async function handleAlipayNotify(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((v, k) => { params[k] = v.toString(); });

    console.log('[Alipay] Webhook received:', params.trade_status, params.out_trade_no);

    const publicKeyB64 = process.env.ALIPAY_PUBLIC_KEY;
    if (publicKeyB64 && params.sign) {
      try {
        const publicKeyPem = toPem(publicKeyB64, 'PUBLIC KEY');
        const sig = params.sign;
        const rest = { ...params };
        delete rest.sign;
        delete rest.sign_type;
        const keys = Object.keys(rest).sort();
        const str = keys.map(k => `${k}=${rest[k]}`).join('&');
        const verifier = createVerify('RSA-SHA256');
        verifier.update(str, 'utf8');
        const valid = verifier.verify(publicKeyPem, sig, 'base64');
        if (!valid) {
          console.warn('[Alipay] Webhook signature verification failed');
          return new Response('fail', { status: 200 });
        }
      } catch (e) {
        console.warn('[Alipay] Webhook signature check error:', e);
      }
    }

    const tradeStatus = params.trade_status || '';
    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
      try {
        const passback = params.passback_params ? decodeURIComponent(params.passback_params) : '';
        const meta = passback ? JSON.parse(passback) as { user_id?: string; plan_id?: string } : null;
        const userId = meta?.user_id;
        const planId = meta?.plan_id;
        const orderId = params.out_trade_no || params.trade_no || `alipay_${Date.now()}`;
        if (userId && planId && isPaidPlan(planId)) {
          await applyPlanPurchase({ userId, planId, provider: 'alipay', orderId });
          console.log('[Alipay] Plan applied:', { userId, planId, orderId });
        }
      } catch (err) {
        console.error('[Alipay] applyPlanPurchase failed:', err);
      }
    }
    return new Response('success', { status: 200 });
  } catch {
    return new Response('fail', { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  return handleAlipayNotify(request);
}
