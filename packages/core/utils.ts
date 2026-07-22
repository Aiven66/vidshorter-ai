/**
 * @clipop/core - Shared utility functions
 */

/** Format seconds as M:SS. */
export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Sleep for ms. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** True if the value is a non-empty string after trim. */
export function isNonEmpty(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

/** Generate a random alphanumeric id (no UUID dependency). */
export function randomId(len = 12): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** Sanitize a string into a safe filename (no path separators, no special chars). */
export function safeFilename(name: string, maxLen = 50, fallback = 'file'): string {
  const clean = name.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, maxLen);
  return clean || fallback;
}

/** Decode a JWT payload without verifying signature. Returns null on invalid JWT. */
export function decodeJwt<T = Record<string, unknown>>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const json = typeof atob === 'function'
      ? atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
      : Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Check whether a JWT is a demo token (signed by this lib's demo signer). */
export function isDemoJwt(token: string, issuer = 'clipop-demo'): boolean {
  const payload = decodeJwt<{ iss?: string }>(token);
  return payload?.iss === issuer;
}

/** Check whether a Date is on a different UTC day than the reference. */
export function isDifferentUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() !== b.getUTCFullYear()
    || a.getUTCMonth() !== b.getUTCMonth()
    || a.getUTCDate() !== b.getUTCDate();
}

/** Truncate a string to maxLen, appending '…' if truncated. */
export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

/** Try-catch wrapper that returns null on error (useful for JSON.parse, etc.). */
export function tryCatch<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/** Async try-catch that returns [result, error] tuple. */
export async function tryCatchAsync<T>(
  fn: () => Promise<T>,
): Promise<[T | null, Error | null]> {
  try {
    return [await fn(), null];
  } catch (err) {
    return [null, err instanceof Error ? err : new Error(String(err))];
  }
}

/** Build a query string from a record. Skip null/undefined values. */
export function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') usp.set(k, String(v));
  }
  return usp.toString();
}

/** True if running on http(s)://127.0.0.1 or localhost. */
export function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname, protocol } = window.location;
  return protocol === 'http:' && (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1');
}

/** Validate that a URL is a safe local callback (http://localhost:port or 127.0.0.1:port). */
export function isSafeLocalCallbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:') return false;
    return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(u.hostname);
  } catch {
    return false;
  }
}
