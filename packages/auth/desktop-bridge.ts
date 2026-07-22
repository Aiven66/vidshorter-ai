/**
 * @clipop/auth - Desktop bridge utilities
 *
 * Pure functions for negotiating auth tokens between a web app and an
 * embedded desktop shell (Electron / Tauri / custom WebView). All
 * functions are side-effect-free except where they explicitly call
 * `window.location` / `window.open` / `fetch`.
 *
 * Bridge discovery priority:
 *   window.clipopDesktop > window.vidshorterDesktop >
 *   window.electronAPI  > window.api > window.agent
 *
 * All config is passed in as arguments — no process.env reads, no React
 * context access inside this module.
 */

import type { DesktopBridge } from '../core/types';
import { isSafeLocalCallbackUrl } from '../core/utils';

/** Payload exchanged between web app and desktop shell. */
export interface DesktopAuthPayload {
  token?: string | null;
  refreshToken?: string | null;
  email?: string | null;
  userId?: string | null;
  name?: string | null;
}

/** Result of a local callback POST attempt. */
export interface DesktopCallbackSyncResult {
  ok: boolean;
  url: string;
  error?: string;
}

/** Default OAuth callback path on the web app. */
const DEFAULT_AUTH_CALLBACK_PATH = '/auth/callback';

/**
 * Discover the desktop bridge injected by the host shell.
 * Priority: clipopDesktop > vidshorterDesktop > electronAPI > api > agent.
 * Returns the first non-null object, or null when not in a desktop runtime.
 */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, DesktopBridge | undefined>;
  return (
    w.clipopDesktop ||
    w.vidshorterDesktop ||
    w.electronAPI ||
    w.api ||
    w.agent ||
    null
  );
}

/**
 * True when running inside a desktop shell (bridge present) OR when the
 * web app is itself served from a local origin (loopback host).
 */
export function isDesktopRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  if (getDesktopBridge()) return true;
  const { protocol, hostname } = window.location;
  if (protocol !== 'http:') return false;
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

/**
 * Ask the bridge for the local callback URL the desktop shell is listening
 * on. Returns null when no bridge / bridge method is unavailable.
 */
export async function getDesktopCallbackFromBridge(): Promise<string | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.getMediaBaseUrl) return null;
  try {
    const result = await bridge.getMediaBaseUrl();
    const url = typeof result === 'string' ? result : '';
    return normalizeDesktopCallbackUrl(url);
  } catch {
    return null;
  }
}

/**
 * Validate a candidate callback URL using the core safe-local check.
 * Returns the URL origin when valid, or null otherwise.
 */
export function normalizeDesktopCallbackUrl(url: string | null | undefined): string | null {
  const raw = (url || '').trim();
  if (!raw) return null;
  if (!isSafeLocalCallbackUrl(raw)) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Build the OAuth redirect URL the IdP should return the user to.
 *
 * Output shape:
 *   `${origin}${authCallbackPath}?from=desktop&next=${encodeURIComponent(callbackUrl)}`
 *
 * When `callbackUrl` is missing or unsafe, `next` is omitted.
 */
export function buildDesktopOAuthRedirectUrl(
  origin: string,
  callbackUrl: string | null | undefined,
  authCallbackPath: string = DEFAULT_AUTH_CALLBACK_PATH,
): string {
  const safeCallback = normalizeDesktopCallbackUrl(callbackUrl);
  const path = authCallbackPath || DEFAULT_AUTH_CALLBACK_PATH;
  const params = new URLSearchParams({ from: 'desktop' });
  if (safeCallback) {
    params.set('next', safeCallback);
  }
  const separator = path.includes('?') ? '&' : '?';
  return `${origin}${path}${separator}${params.toString()}`;
}

/**
 * Build a deep link that the desktop shell can intercept to complete login.
 *
 * Output: `${scheme}://login-success?token=...&refreshToken=...&email=...&userId=...&name=...`
 * All values are URL-encoded.
 */
export function buildDesktopDeepLink(
  scheme: string,
  payload: DesktopAuthPayload,
): string {
  const params = new URLSearchParams();
  if (payload.token) params.set('token', payload.token);
  if (payload.refreshToken) params.set('refreshToken', payload.refreshToken);
  if (payload.email) params.set('email', payload.email);
  if (payload.userId) params.set('userId', payload.userId);
  if (payload.name) params.set('name', payload.name);
  return `${scheme}://login-success?${params.toString()}`;
}

/**
 * POST the auth payload to the desktop shell's local callback server.
 *
 * `callbackUrl` MUST pass `isSafeLocalCallbackUrl` (http://127.0.0.1:port or
 * localhost:port). The request is aborted after 3 seconds.
 */
export async function postDesktopAuthToLocalCallback(
  callbackUrl: string,
  payload: DesktopAuthPayload,
): Promise<DesktopCallbackSyncResult> {
  const safe = normalizeDesktopCallbackUrl(callbackUrl);
  if (!safe || !payload.token) return { ok: false, url: '' };

  try {
    const response = await fetch(safe, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
      mode: 'cors',
      signal: AbortSignal.timeout(3000),
    });
    return {
      ok: response.ok,
      url: safe,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      url: safe,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * GET fallback: open the callback URL with query params in a new window.
 * Used when the POST request fails (e.g. CORS / server not running).
 */
export function openDesktopLocalCallback(
  callbackUrl: string,
  params: Record<string, string | undefined>,
): string {
  const safe = normalizeDesktopCallbackUrl(callbackUrl);
  if (!safe) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, v);
  }
  const url = `${safe}?${usp.toString()}`;
  if (typeof window !== 'undefined') {
    try {
      window.open(url, '_blank');
    } catch {
      // ignore — caller can use the returned URL for a manual link
    }
  }
  return url;
}

/**
 * Convenience: POST the payload to the local callback (silently ignore
 * failure), then open a deep link / fallback URL so the desktop shell can
 * complete the auth handshake.
 *
 * Returns both the deep link and the local sync result.
 */
export async function syncDesktopAuthAndOpen(
  payload: DesktopAuthPayload,
  scheme: string,
  callbackUrl: string,
): Promise<{
  deepLink: string;
  localSync: DesktopCallbackSyncResult;
  fallbackUrl: string;
}> {
  const localSync = await postDesktopAuthToLocalCallback(callbackUrl, payload);
  const deepLink = buildDesktopDeepLink(scheme, payload);

  if (typeof window !== 'undefined' && deepLink) {
    try {
      window.location.href = deepLink;
    } catch {
      // ignore — caller can use fallbackUrl
    }
  }

  const fallbackUrl = localSync.ok
    ? ''
    : openDesktopLocalCallback(callbackUrl, {
        token: payload.token || undefined,
        refreshToken: payload.refreshToken || undefined,
        email: payload.email || undefined,
        userId: payload.userId || undefined,
        name: payload.name || undefined,
      });

  return { deepLink, localSync, fallbackUrl };
}
