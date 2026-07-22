/**
 * @clipop/payments - Webhook signature verification
 *
 * SERVER-ONLY module. Do NOT add 'use client'.
 *
 * Each provider has its own verification function:
 *   - verifyCreemWebhook(rawBody, signature, secret)         HMAC-SHA256
 *   - verifyPaypalWebhook(headers, rawBody, cfg)               PayPal webhooks API
 *   - verifyAlipayWebhook(params, publicKeyPem)                RSA2
 *   - verifyWechatWebhook(rawBody, apiV3Key)                   AES-256-GCM decrypt
 *
 * All functions return a boolean (or a structured result for WeChat).
 * None of these functions read process.env — secrets come from arguments.
 */

import { createHmac, timingSafeEqual, createVerify, createDecipheriv } from 'crypto';
import type { AppConfig, PaymentChannelConfig } from '@clipop/core';

// ── Creem ─────────────────────────────────────────────────────────────────────

/**
 * Verify a Creem webhook signature.
 *
 * The `signature` parameter is the value of the `creem-signature` HTTP header
 * from the incoming webhook request. Callers are responsible for extracting
 * the header (this function does not depend on Next.js Request objects).
 *
 * Equivalent to verifyCreemWebhookWithSignature — both names kept for clarity.
 */
export function verifyCreemWebhook(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  return verifyCreemWebhookWithSignature(rawBody, signature, secret);
}

/**
 * Verify a Creem webhook signature given the raw body, the signature header
 * value, and the webhook secret. Uses HMAC-SHA256 with timing-safe comparison.
 */
export function verifyCreemWebhookWithSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (!secret || !signature) return false;
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const sigBuf = Buffer.from(signature, 'hex');
    return (
      expectedBuf.length === sigBuf.length && timingSafeEqual(expectedBuf, sigBuf)
    );
  } catch {
    return false;
  }
}

// ── PayPal ────────────────────────────────────────────────────────────────────

export interface PayPalWebhookVerifyConfig {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  /** 'live' or 'sandbox'. Default 'sandbox'. */
  environment?: 'live' | 'sandbox';
}

export interface PayPalWebhookHeaders {
  'paypal-transmission-id'?: string;
  'paypal-transmission-time'?: string;
  'paypal-cert-url'?: string;
  'paypal-auth-algo'?: string;
  'paypal-transmission-sig'?: string;
  [key: string]: string | undefined;
}

/**
 * Verify a PayPal webhook using the PayPal Webhooks API.
 *
 * Calls POST /v1/notifications/verify-webhook-signature with the configured
 * webhook id and headers. Returns true on VERIFIED status.
 */
export async function verifyPaypalWebhook(
  headers: PayPalWebhookHeaders,
  rawBody: string,
  cfg: PayPalWebhookVerifyConfig,
): Promise<boolean> {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.webhookId) return false;

  const baseUrl =
    cfg.environment === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

  try {
    // 1. Get access token
    const credentials = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store',
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenRes.ok || !tokenData.access_token) return false;
    const accessToken = tokenData.access_token;

    // 2. Verify webhook signature
    const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: cfg.webhookId,
        webhook_event: JSON.parse(rawBody),
      }),
      cache: 'no-store',
    });
    const verifyData = (await verifyRes.json()) as { verification_status?: string };
    return verifyData.verification_status === 'SUCCESS';
  } catch (err) {
    console.warn('[payments] PayPal webhook verification failed:', err);
    return false;
  }
}

/**
 * Convenience wrapper that extracts the verify config from AppConfig.paymentChannels.
 * Returns false if PayPal is not configured.
 */
export async function verifyPaypalWebhookFromConfig(
  headers: PayPalWebhookHeaders,
  rawBody: string,
  config: AppConfig,
): Promise<boolean> {
  const channel = findChannel(config, 'paypal');
  if (!channel) return false;
  return verifyPaypalWebhook(headers, rawBody, {
    clientId: channel.config.clientId || channel.config.client_id || '',
    clientSecret: channel.config.clientSecret || channel.config.client_secret || '',
    webhookId: channel.config.webhookId || channel.config.webhook_id || '',
    environment: channel.config.environment === 'live' ? 'live' : 'sandbox',
  });
}

// ── Alipay ────────────────────────────────────────────────────────────────────

/**
 * Verify Alipay webhook signature (RSA2).
 *
 * `params` should be all form fields from the notification (excluding `sign` and `sign_type`).
 * The function reconstructs the signature string in alphabetical order.
 */
export function verifyAlipayWebhook(
  params: Record<string, string>,
  publicKeyPem: string,
): boolean {
  if (!publicKeyPem) return false;
  const sign = params.sign;
  if (!sign) return false;

  // Build the canonical string: sorted keys, sign and sign_type excluded.
  const rest = { ...params };
  delete rest.sign;
  delete rest.sign_type;
  const keys = Object.keys(rest).filter((k) => rest[k] !== '' && rest[k] !== undefined).sort();
  const canonical = keys.map((k) => `${k}=${rest[k]}`).join('&');

  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(canonical, 'utf8');
    return verifier.verify(publicKeyPem, sign, 'base64');
  } catch (err) {
    console.warn('[payments] Alipay signature verification failed:', err);
    return false;
  }
}

/**
 * Wrap a base64 / single-line PEM string into a properly formatted PEM block.
 */
export function toPem(base64Key: string, type: 'PRIVATE KEY' | 'PUBLIC KEY' | 'CERTIFICATE'): string {
  const normalized = base64Key.trim().replace(/\\n/g, '\n');
  if (normalized.includes('-----BEGIN')) return normalized;
  const clean = normalized.replace(/\s+/g, '');
  const lines = clean.match(/.{1,64}/g)?.join('\n') ?? clean;
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----`;
}

// ── WeChat Pay ────────────────────────────────────────────────────────────────

export interface WechatWebhookResult {
  ok: boolean;
  decrypted: unknown | null;
  error?: string;
}

/**
 * Decrypt and verify a WeChat Pay v3 webhook notification.
 *
 * The resource field contains: { ciphertext, nonce, associated_data }.
 * Returns the decrypted JSON payload (parsed) and ok=true on success.
 */
export function verifyWechatWebhook(
  rawBody: string,
  apiV3Key: string,
): WechatWebhookResult {
  if (!apiV3Key) {
    return { ok: false, decrypted: null, error: 'APIv3 key not configured' };
  }

  let event: {
    resource?: {
      ciphertext?: string;
      nonce?: string;
      associated_data?: string;
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return { ok: false, decrypted: null, error: 'Invalid JSON' };
  }

  const resource = event.resource;
  if (!resource?.ciphertext || !resource?.nonce) {
    return { ok: false, decrypted: null, error: 'Missing resource fields' };
  }

  try {
    const key = Buffer.from(apiV3Key, 'utf8');
    const nonce = Buffer.from(resource.nonce, 'utf8');
    const aad = Buffer.from(resource.associated_data || '', 'utf8');
    const data = Buffer.from(resource.ciphertext, 'base64');
    const ciphertext = data.subarray(0, data.length - 16);
    const tag = data.subarray(data.length - 16);

    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    if (aad.length) decipher.setAAD(aad);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return { ok: true, decrypted: JSON.parse(decrypted) };
  } catch (err) {
    return {
      ok: false,
      decrypted: null,
      error: err instanceof Error ? err.message : 'Decryption failed',
    };
  }
}

/**
 * Convenience wrapper that extracts the APIv3 key from AppConfig.
 */
export function verifyWechatWebhookFromConfig(
  rawBody: string,
  config: AppConfig,
): WechatWebhookResult {
  const channel = findChannel(config, 'wechat');
  if (!channel) {
    return { ok: false, decrypted: null, error: 'WeChat Pay not configured' };
  }
  const apiV3Key =
    channel.config.apiV3Key ||
    channel.config.api_v3_key ||
    channel.config.apiKey ||
    channel.config.api_key ||
    '';
  return verifyWechatWebhook(rawBody, apiV3Key);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findChannel(
  config: AppConfig,
  provider: PaymentChannelConfig['provider'],
): PaymentChannelConfig | undefined {
  return config.paymentChannels.find((c) => c.provider === provider);
}
