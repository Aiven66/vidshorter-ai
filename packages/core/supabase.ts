/**
 * @clipop/core - Supabase client factory
 *
 * Singleton with token injection, plus graceful placeholder when Supabase
 * is not configured (apps still render UI in demo mode).
 *
 * Works on both client (browser) and server (Node.js on Vercel).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from './config';

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-anon-key';

let cachedDefaultClient: SupabaseClient | null = null;
let cachedServiceRoleClient: SupabaseClient | null = null;
let cachedConfigHash = '';

/** Detect whether we're running in the browser. */
const isBrowser = typeof window !== 'undefined';

/** Detect whether Supabase env was actually configured. */
export function isSupabaseConfigured(config: AppConfig): boolean {
  const url = config.supabaseUrl;
  return !!url && url !== PLACEHOLDER_URL && url.startsWith('http');
}

/**
 * Get a default (anon-key) Supabase client.
 * Uses implicit flow with session persistence on the browser.
 */
export function getSupabaseClient(config: AppConfig): SupabaseClient {
  const hash = `${config.supabaseUrl}|${config.supabaseAnonKey}`;
  if (cachedDefaultClient && cachedConfigHash === hash) return cachedDefaultClient;

  const url = config.supabaseUrl || PLACEHOLDER_URL;
  const anonKey = config.supabaseAnonKey || PLACEHOLDER_KEY;
  const isPlaceholder = !isSupabaseConfigured(config);

  cachedDefaultClient = createClient(url, anonKey, {
    auth: {
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: isBrowser,
      flowType: 'implicit',
    },
  });
  cachedConfigHash = hash;
  if (isPlaceholder) {
    // Mark on the instance for downstream introspection
    (cachedDefaultClient as any).__isPlaceholder = true;
  }
  return cachedDefaultClient;
}

/**
 * Get a service-role client (bypasses RLS). SERVER-ONLY.
 * Returns null if the service role key is not configured.
 */
export function getServiceRoleClient(config: AppConfig): SupabaseClient | null {
  if (!config.supabaseServiceRoleKey || !isSupabaseConfigured(config)) return null;
  if (cachedServiceRoleClient) return cachedServiceRoleClient;

  cachedServiceRoleClient = createClient(config.supabaseUrl!, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedServiceRoleClient;
}

/**
 * Create an ephemeral client bound to a specific user's JWT.
 * Used when a token is provided by the desktop bridge (no session persisted).
 */
export function getClientWithToken(config: AppConfig, token: string): SupabaseClient {
  const url = config.supabaseUrl || PLACEHOLDER_URL;
  const anonKey = config.supabaseAnonKey || PLACEHOLDER_KEY;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Create a client that prefers service role (for admin/server ops),
 * but falls back to the default anon client when service role is unavailable.
 */
export function getAdminClient(config: AppConfig): SupabaseClient {
  return getServiceRoleClient(config) ?? getSupabaseClient(config);
}

/** Reset the client cache (used by tests). */
export function resetSupabaseCache(): void {
  cachedDefaultClient = null;
  cachedServiceRoleClient = null;
  cachedConfigHash = '';
}
