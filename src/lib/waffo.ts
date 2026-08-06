import { WaffoPancake } from '@waffo/pancake-ts';

/**
 * Waffo Pancake MoR client factory.
 *
 * Reads credentials from environment variables — the RSA private key is NEVER
 * hardcoded in source. The SDK auto-normalizes key formats (PEM, PKCS#1, literal
 * `\n` from env vars, raw base64, Windows line endings), so a single-line env
 * var with `\n` escapes works fine.
 *
 * Required env:
 *   WAFFO_MERCHANT_ID  — MER_{base62}
 *   WAFFO_PRIVATE_KEY  — RSA private key (PEM)
 * Optional env:
 *   WAFFO_STORE_ID     — STO_{base62}, used for customer self-service (cancel/refund)
 *   WAFFO_BASE_URL     — API base URL override (default https://api.waffo.ai)
 *   WAFFO_ENVIRONMENT  — "test" | "prod" (default "test")
 *   WAFFO_PRODUCT_IDS  — JSON map { "starter": "PROD_xxx", "pro": "PROD_yyy" }
 */

export type WaffoEnvironment = 'test' | 'prod';

let cachedClient: WaffoPancake | null = null;

export function getWaffoConfig() {
  return {
    merchantId: process.env.WAFFO_MERCHANT_ID || '',
    privateKey: process.env.WAFFO_PRIVATE_KEY || '',
    storeId: process.env.WAFFO_STORE_ID || '',
    baseUrl: process.env.WAFFO_BASE_URL || undefined,
    environment: (process.env.WAFFO_ENVIRONMENT as WaffoEnvironment) || 'test',
  };
}

export function isWaffoConfigured(): boolean {
  const { merchantId, privateKey } = getWaffoConfig();
  return Boolean(merchantId && privateKey);
}

/** Returns a cached WaffoPancake client. Throws if not configured. */
export function getWaffoClient(): WaffoPancake {
  if (cachedClient) return cachedClient;
  const { merchantId, privateKey, baseUrl } = getWaffoConfig();
  if (!merchantId || !privateKey) {
    throw new Error('Waffo not configured: set WAFFO_MERCHANT_ID and WAFFO_PRIVATE_KEY');
  }
  cachedClient = new WaffoPancake({ merchantId, privateKey, baseUrl });
  return cachedClient;
}

/**
 * Resolve a Waffo product ID for a given plan.
 * WAFFO_PRODUCT_IDS is a JSON map: { "starter": "PROD_xxx", "pro": "PROD_yyy" }
 */
export function getWaffoProductId(planId: string): string | undefined {
  const raw = process.env.WAFFO_PRODUCT_IDS;
  if (!raw) return undefined;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map[planId];
  } catch {
    console.warn('[Waffo] Failed to parse WAFFO_PRODUCT_IDS');
    return undefined;
  }
}
