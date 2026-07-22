/**
 * Browser-side behavior tracking SDK.
 *
 * - Session management via localStorage (TTL-based, default 30min).
 * - Uses navigator.sendBeacon first, falls back to fetch with keepalive.
 * - Silent failures: tracking never throws or blocks the main thread.
 * - Endpoint and funnel definitions come from useAppConfig().
 */

import type { AppConfig } from '../core/config';
import type { FunnelStep } from './funnel-config';

// ── Session management ────────────────────────────────────────────────────

const SESSION_KEY = 'app_session_id';
const SESSION_TS_KEY = 'app_session_ts';
const DEFAULT_SESSION_TTL = 30 * 60 * 1000; // 30 minutes

/** Generate a random session id (no UUID dependency). */
function generateSessionId(): string {
  const now = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${now.toString(36)}-${rand}`;
}

/**
 * Get the current session id. Creates a new session if none exists
 * or if the previous session has expired (TTL-based).
 */
export function getSessionId(ttl: number = DEFAULT_SESSION_TTL): string {
  if (typeof window === 'undefined') return 'ssr';

  try {
    const now = Date.now();
    const lastTs = parseInt(localStorage.getItem(SESSION_TS_KEY) || '0', 10);
    let sid = localStorage.getItem(SESSION_KEY);

    if (!sid || now - lastTs > ttl) {
      sid = generateSessionId();
      localStorage.setItem(SESSION_KEY, sid);
    }
    localStorage.setItem(SESSION_TS_KEY, String(now));
    return sid;
  } catch {
    return 'fallback';
  }
}

/** Force-generate a new session id (e.g. after login). */
export function regenerateSession(): void {
  if (typeof window === 'undefined') return;
  try {
    const sid = generateSessionId();
    localStorage.setItem(SESSION_KEY, sid);
    localStorage.setItem(SESSION_TS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

// ── User context ──────────────────────────────────────────────────────────

let currentUser: { id?: string; email?: string; name?: string } = {};

/** Set the current user for all subsequent tracking calls. */
export function setAnalyticsUser(user: { id?: string; email?: string; name?: string } | null): void {
  currentUser = user || {};
}

/** Clear the current user (e.g. on logout). */
export function clearAnalyticsUser(): void {
  currentUser = {};
}

// ── Tracking ──────────────────────────────────────────────────────────────

export interface TrackOptions {
  /** Custom event data payload. */
  eventData?: Record<string, unknown>;
  /** Override user id (takes priority over setAnalyticsUser). */
  userId?: string;
  /** Override user email. */
  userEmail?: string;
  /** Override page URL (defaults to window.location.href). */
  pageUrl?: string;
  /** Override referrer (defaults to document.referrer). */
  referrer?: string;
  /** Override endpoint (defaults to config.analyticsEndpoint). */
  endpoint?: string;
}

/**
 * Track a funnel step event. Sends via sendBeacon (preferred) or
 * fetch with keepalive. Always resolves — never throws.
 */
export async function trackEvent(
  step: FunnelStep,
  options: TrackOptions = {},
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const endpoint = options.endpoint || resolveEndpoint();
    const ttl = resolveSessionTtl();

    const payload = {
      event_name: step.event,
      funnel_id: step.funnelId,
      step_index: step.step,
      event_data: options.eventData || {},
      session_id: getSessionId(ttl),
      user_id: options.userId || currentUser.id || '',
      user_email: options.userEmail || currentUser.email || '',
      page_url: options.pageUrl || window.location.href,
      referrer: options.referrer || document.referrer,
    };

    const body = JSON.stringify(payload);

    // Prefer sendBeacon (reliable even on page unload).
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(endpoint, blob)) return;
    }

    // Fallback: fetch with keepalive.
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {
      // silent
    });
  } catch {
    // silent: tracking must never break the main app
  }
}

/**
 * Track a custom (non-funnel) event.
 */
export async function trackCustomEvent(
  eventName: string,
  options: TrackOptions = {},
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const endpoint = options.endpoint || resolveEndpoint();
    const ttl = resolveSessionTtl();

    const payload = {
      event_name: eventName,
      funnel_id: null,
      step_index: null,
      event_data: options.eventData || {},
      session_id: getSessionId(ttl),
      user_id: options.userId || currentUser.id || '',
      user_email: options.userEmail || currentUser.email || '',
      page_url: options.pageUrl || window.location.href,
      referrer: options.referrer || document.referrer,
    };

    const body = JSON.stringify(payload);

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(endpoint, blob)) return;
    }

    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {
      // silent
    });
  } catch {
    // silent
  }
}

// ── Config resolution (reads from useAppConfig at runtime) ────────────────

/**
 * Resolve the tracking endpoint from the AppConfig context.
 * Falls back to '/api/events/track' if no config is available.
 */
function resolveEndpoint(): string {
  // Read from the global config if available (set by AppConfigProvider).
  // We avoid importing React hooks here to keep the SDK callable from
  // non-component code. The provider sets a global variable.
  try {
    const globalConfig = (globalThis as unknown as { __clipop_app_config?: AppConfig }).__clipop_app_config;
    if (globalConfig?.analyticsEndpoint) return globalConfig.analyticsEndpoint;
  } catch {
    // ignore
  }
  return '/api/events/track';
}

/** Resolve session TTL from config (default 30 min). */
function resolveSessionTtl(): number {
  try {
    const globalConfig = (globalThis as unknown as { __clipop_app_config?: AppConfig }).__clipop_app_config;
    if (globalConfig?.analyticsSessionTtl) return globalConfig.analyticsSessionTtl;
  } catch {
    // ignore
  }
  return DEFAULT_SESSION_TTL;
}

/**
 * Initialize the SDK with an AppConfig. Called by AppConfigProvider
 * or manually in _app.tsx. Sets the global config reference used by
 * resolveEndpoint() and resolveSessionTtl().
 */
export function initAnalytics(config: AppConfig): void {
  try {
    (globalThis as unknown as { __clipop_app_config?: AppConfig }).__clipop_app_config = config;
  } catch {
    // ignore
  }
}
