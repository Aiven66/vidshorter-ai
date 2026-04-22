/**
 * WeChat Pay Native v3 API Route
 *
 * Creates a Native QR payment order and returns the code_url for QR rendering.
 *
 * Required env vars (production):
 *   WECHAT_APP_ID        - 公众号/小程序/APP AppID
 *   WECHAT_MCH_ID        - 商户号
 *   WECHAT_API_V3_KEY    - APIv3 密钥（32位）
 *   WECHAT_SERIAL_NO     - 证书序列号
 *   WECHAT_PRIVATE_KEY   - RSA 私钥（PEM 格式，base64 encoded）
 *   WECHAT_NOTIFY_URL    - 异步回调地址（需公网可访问）
 *
 * Without env vars → returns demo mode response
 */

import { NextRequest } from 'next/server';
import { createDecipheriv, createSign, randomBytes } from 'crypto';
import { applyPlanPurchase } from '@/lib/server/subscriptions';

const WECHAT_API = 'https://api.mch.weixin.qq.com';

/** Build the Authorization header for WeChat Pay v3 */
function buildWechatAuth(
  method: string,
  url: string,
  body: string,
  mchId: string,
  serialNo: string,
  privateKeyPem: string,
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = randomBytes(16).toString('hex');

  // Canonical message for signature
  const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;

  const sign = createSign('RSA-SHA256');
  sign.update(message, 'utf8');
  const signature = sign.sign(privateKeyPem, 'base64');

  return (
    `WECHATPAY2-SHA256-RSA2048 ` +
    `mchid="${mchId}",` +
    `nonce_str="${nonceStr}",` +
    `timestamp="${timestamp}",` +
    `serial_no="${serialNo}",` +
    `signature="${signature}"`
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { planId, amount, description, userId, config } = body as {
    planId?: string;
    amount?: number;    // 分 (cents)
    description?: string;
    userId?: string;
    config?: {
      wechat?: {
        appId?: string;
        mchId?: string;
        apiKey?: string;
        serialNo?: string;
        privateKey?: string;
        notifyUrl?: string;
      };
    };
  };

  if (!planId || !amount) {
    return Response.json({ error: 'planId and amount are required' }, { status: 400 });
  }

  const appId = process.env.WECHAT_APP_ID || config?.wechat?.appId;
  const mchId = process.env.WECHAT_MCH_ID || config?.wechat?.mchId;
  const apiV3Key = process.env.WECHAT_API_V3_KEY || config?.wechat?.apiKey;
  const serialNo = process.env.WECHAT_SERIAL_NO || config?.wechat?.serialNo;
  const privateKeyB64 = process.env.WECHAT_PRIVATE_KEY || config?.wechat?.privateKey;
  const notifyUrl =
    process.env.WECHAT_NOTIFY_URL ||
    config?.wechat?.notifyUrl ||
    `${request.nextUrl.origin}/api/payment/wechat`;

  // ── Demo mode when not configured ──
  if (!appId || !mchId || !apiV3Key || !serialNo || !privateKeyB64) {
    console.log('[WeChat Pay] Running in demo mode (env vars not set)');
    const demoCodeUrl = `weixin://wxpay/bizpayurl?pr=DEMO_${planId}_${Date.now()}`;
    return Response.json({ codeUrl: demoCodeUrl, demo: true, orderId: `demo_${Date.now()}` });
  }

  // Decode PEM private key
  let privateKeyPem: string;
  try {
    privateKeyPem = Buffer.from(privateKeyB64, 'base64').toString('utf8');
    if (!privateKeyPem.includes('-----BEGIN')) {
      // Already raw PEM
      privateKeyPem = privateKeyB64;
    }
  } catch {
    return Response.json({ error: 'Invalid WECHAT_PRIVATE_KEY format' }, { status: 500 });
  }

  const outTradeNo = `vids_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const urlPath = '/v3/pay/transactions/native';

  const reqBody = JSON.stringify({
    appid: appId,
    mchid: mchId,
    description: description || 'VidShorter AI 订阅',
    out_trade_no: outTradeNo,
    notify_url: notifyUrl,
    attach: userId ? JSON.stringify({ user_id: userId, plan_id: planId }) : undefined,
    amount: {
      total: amount,
      currency: 'CNY',
    },
    scene_info: {
      payer_client_ip: request.headers.get('x-forwarded-for') || '127.0.0.1',
    },
  });

  try {
    const authorization = buildWechatAuth('POST', urlPath, reqBody, mchId, serialNo, privateKeyPem);

    const res = await fetch(`${WECHAT_API}${urlPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization,
      },
      body: reqBody,
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[WeChat Pay] API error:', data);
      // Fallback to demo mode on API error
      const demoCodeUrl = `weixin://wxpay/bizpayurl?pr=ERR_${planId}_${Date.now()}`;
      return Response.json({ codeUrl: demoCodeUrl, demo: true, orderId: outTradeNo, apiError: data });
    }

    return Response.json({
      codeUrl: data.code_url,
      orderId: outTradeNo,
      demo: false,
    });
  } catch (err) {
    console.error('[WeChat Pay] Request failed:', err);
    const demoCodeUrl = `weixin://wxpay/bizpayurl?pr=FAIL_${planId}_${Date.now()}`;
    return Response.json({ codeUrl: demoCodeUrl, demo: true, orderId: outTradeNo });
  }
}

/** Webhook: WeChat Pay async notification */
export async function PUT(request: NextRequest) {
  try {
    const raw = await request.text();
    const evt = JSON.parse(raw) as {
      resource?: { ciphertext?: string; nonce?: string; associated_data?: string };
    };

    const apiV3Key = process.env.WECHAT_API_V3_KEY || '';
    if (apiV3Key && evt.resource?.ciphertext && evt.resource?.nonce) {
      const key = Buffer.from(apiV3Key, 'utf8');
      const nonce = Buffer.from(evt.resource.nonce, 'utf8');
      const aad = Buffer.from(evt.resource.associated_data || '', 'utf8');
      const data = Buffer.from(evt.resource.ciphertext, 'base64');
      const ciphertext = data.subarray(0, data.length - 16);
      const tag = data.subarray(data.length - 16);

      try {
        const decipher = createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAuthTag(tag);
        if (aad.length) decipher.setAAD(aad);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
        const payload = JSON.parse(decrypted) as {
          out_trade_no?: string;
          trade_state?: string;
          attach?: string;
        };

        if (payload.trade_state === 'SUCCESS' && payload.attach) {
          try {
            const attach = JSON.parse(payload.attach) as { user_id?: string; plan_id?: string };
            if (attach.user_id && attach.plan_id && payload.out_trade_no) {
              await applyPlanPurchase({
                userId: attach.user_id,
                planId: attach.plan_id,
                provider: 'wechat',
                orderId: payload.out_trade_no,
              });
            }
          } catch {}
        }
      } catch {}
    }

    return Response.json({ code: 'SUCCESS', message: '成功' });
  } catch {
    return Response.json({ code: 'FAIL', message: '处理失败' }, { status: 400 });
  }
}
