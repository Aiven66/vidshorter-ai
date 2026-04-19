/**
 * Alipay PC Web Payment API Route
 *
 * Creates an Alipay trade.precreate (QR code) order for PC web payment.
 * Returns either a QR code string (for QR display) or a form-post payUrl.
 *
 * Required env vars (production):
 *   ALIPAY_APP_ID          - 支付宝开放平台应用 AppID
 *   ALIPAY_PRIVATE_KEY     - 应用私钥（RSA2/PKCS8，base64 encoded）
 *   ALIPAY_PUBLIC_KEY      - 支付宝公钥（用于验签，base64 encoded）
 *   ALIPAY_NOTIFY_URL      - 异步通知地址
 *   ALIPAY_SANDBOX         - "true" 启用沙箱, 默认正式环境
 *
 * Without env vars → returns demo mode response
 */

import { NextRequest } from 'next/server';
import { createSign, createVerify } from 'crypto';

function getAlipayGateway(sandbox: boolean) {
  return sandbox
    ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
    : 'https://openapi.alipay.com/gateway.do';
}

/** Build RSA2 signature for Alipay */
function signAlipay(params: Record<string, string>, privateKeyPem: string): string {
  // Sort keys, build query string
  const keys = Object.keys(params).sort();
  const str = keys.map(k => `${k}=${params[k]}`).join('&');

  const sign = createSign('RSA-SHA256');
  sign.update(str, 'utf8');
  return sign.sign(privateKeyPem, 'base64');
}

/** Convert raw base64 key → PEM format */
function toPem(base64Key: string, type: 'PRIVATE KEY' | 'PUBLIC KEY'): string {
  // If already wrapped in PEM header, return as-is
  if (base64Key.includes('-----BEGIN')) return base64Key;
  const clean = base64Key.replace(/\s+/g, '');
  const lines = clean.match(/.{1,64}/g)?.join('\n') ?? clean;
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----`;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { planId, amount, subject } = body as {
    planId?: string;
    amount?: number;    // 元 (CNY)
    subject?: string;
  };

  if (!planId || !amount) {
    return Response.json({ error: 'planId and amount are required' }, { status: 400 });
  }

  const appId         = process.env.ALIPAY_APP_ID;
  const privateKeyB64 = process.env.ALIPAY_PRIVATE_KEY;
  const notifyUrl     = process.env.ALIPAY_NOTIFY_URL || '';
  const sandbox       = process.env.ALIPAY_SANDBOX === 'true';

  // ── Demo mode when not configured ──
  if (!appId || !privateKeyB64) {
    console.log('[Alipay] Running in demo mode (env vars not set)');
    const demoQr = `https://qr.alipay.com/DEMO_${planId}_${Date.now()}`;
    return Response.json({ qrCode: demoQr, demo: true, orderId: `alipay_demo_${Date.now()}` });
  }

  const privateKeyPem = toPem(privateKeyB64, 'PRIVATE KEY');
  const outTradeNo = `vids_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const gateway = getAlipayGateway(sandbox);

  // Common params
  const commonParams: Record<string, string> = {
    app_id: appId,
    method: 'alipay.trade.precreate',  // QR code pay (扫码支付)
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    version: '1.0',
    notify_url: notifyUrl,
    biz_content: JSON.stringify({
      out_trade_no: outTradeNo,
      total_amount: amount.toFixed(2),
      subject: subject || 'VidShorter AI 订阅',
      product_code: 'FACE_TO_FACE_PAYMENT',
    }),
  };

  // Sign
  commonParams.sign = signAlipay(commonParams, privateKeyPem);

  // Build form-post body
  const formBody = new URLSearchParams();
  for (const [k, v] of Object.entries(commonParams)) {
    formBody.set(k, v);
  }

  try {
    const res = await fetch(gateway, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: formBody.toString(),
    });

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('[Alipay] Non-JSON response:', text.slice(0, 200));
      const demoQr = `https://qr.alipay.com/ERR_${planId}_${Date.now()}`;
      return Response.json({ qrCode: demoQr, demo: true, orderId: outTradeNo });
    }

    const responseKey = 'alipay_trade_precreate_response';
    const resp = data[responseKey] as Record<string, string> | undefined;

    if (resp && resp.code === '10000' && resp.qr_code) {
      return Response.json({ qrCode: resp.qr_code, orderId: outTradeNo, demo: false });
    }

    // Also try page pay (web redirect) as fallback
    const pagePayParams: Record<string, string> = {
      ...commonParams,
      method: 'alipay.trade.page.pay',
      return_url: notifyUrl || 'https://example.com',
      biz_content: JSON.stringify({
        out_trade_no: outTradeNo,
        total_amount: amount.toFixed(2),
        subject: subject || 'VidShorter AI 订阅',
        product_code: 'FAST_INSTANT_TRADE_PAY',
      }),
    };
    delete pagePayParams.sign;
    pagePayParams.sign = signAlipay(pagePayParams, privateKeyPem);

    const pageFormBody = new URLSearchParams();
    for (const [k, v] of Object.entries(pagePayParams)) {
      pageFormBody.set(k, v);
    }
    const payUrl = `${gateway}?${pageFormBody.toString()}`;

    console.log('[Alipay] precreate failed, returning page pay URL. Error:', resp);
    return Response.json({ payUrl, orderId: outTradeNo, demo: false });
  } catch (err) {
    console.error('[Alipay] Request failed:', err);
    const demoQr = `https://qr.alipay.com/FAIL_${planId}_${Date.now()}`;
    return Response.json({ qrCode: demoQr, demo: true, orderId: outTradeNo });
  }
}

/** Webhook: Alipay async notification (POST form data) */
export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((v, k) => { params[k] = v.toString(); });

    console.log('[Alipay] Webhook received:', params);

    // In production: verify RSA2 signature, update order status
    const publicKeyB64 = process.env.ALIPAY_PUBLIC_KEY;
    if (publicKeyB64 && params.sign) {
      try {
        const publicKeyPem = toPem(publicKeyB64, 'PUBLIC KEY');
        const { sign: sig, sign_type, ...rest } = params;
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

    // TODO: Update order status in DB based on params.trade_status
    return new Response('success', { status: 200 });
  } catch {
    return new Response('fail', { status: 400 });
  }
}
