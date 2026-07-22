/**
 * SERVER-ONLY — do not import from client components.
 *
 * Unified admin authentication: JWT inspection + service-role DB lookup.
 * All admin API routes should call `requireAdmin()` to gate access.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../core/config';
import type { AdminVerifyResult, AppUser } from '../core/types';
import { decodeJwt } from '../core/utils';

/** Table name mapping — allows hosts to customize schema names. */
export interface AdminTableNames {
  users: string;
  credits: string;
  subscriptions: string;
  videos: string;
  creditTransactions: string;
  behaviorEvents: string;
}

/** Extended config with optional table name overrides. */
export type AdminConfig = AppConfig & {
  /** Override default table names (all default to conventional names). */
  tables?: Partial<AdminTableNames>;
};

export const DEFAULT_TABLES: AdminTableNames = {
  users: 'users',
  credits: 'credits',
  subscriptions: 'subscriptions',
  videos: 'videos',
  creditTransactions: 'credit_transactions',
  behaviorEvents: 'behavior_events',
};

/** Resolve the effective table name map. */
export function getTables(config: AdminConfig): AdminTableNames {
  return { ...DEFAULT_TABLES, ...(config.tables || {}) };
}

/** Parsed JWT payload used for admin checks. */
interface JwtPayload {
  sub?: string;
  email?: string;
  role?: string;
  user_metadata?: { email?: string; role?: string };
  iss?: string;
}

/**
 * Determine whether a bearer token belongs to an admin.
 * 1. Match against static admin API key (if configured).
 * 2. Decode JWT and check role claim / admin email whitelist.
 * 3. If service-role key is available, confirm via users table.
 */
export async function isAdminFromToken(
  config: AdminConfig,
  token: string,
): Promise<AdminVerifyResult> {
  if (!token) return { isAdmin: false, reason: 'missing-token' };

  // Static API key shortcut
  if (config.admin.adminApiKey && token === config.admin.adminApiKey) {
    return { isAdmin: true, reason: 'api-key' };
  }

  const payload = decodeJwt<JwtPayload>(token);
  if (!payload) return { isAdmin: false, reason: 'invalid-jwt' };

  const tokenEmail = (payload.email || '').trim().toLowerCase();
  const tokenRole = (payload.role || '').trim();
  const metaEmail = (payload.user_metadata?.email || '').trim().toLowerCase();
  const metaRole = (payload.user_metadata?.role || '').trim();

  const adminEmails = (config.admin.adminEmails || []).map((e) => e.trim().toLowerCase());
  const emailMatched = adminEmails.includes(tokenEmail) || adminEmails.includes(metaEmail);
  const roleMatched = tokenRole === 'admin' || metaRole === 'admin';

  // Without DB access, rely on JWT claims alone.
  const serviceKey = config.supabaseServiceRoleKey;
  if (!serviceKey || !config.supabaseUrl) {
    if (roleMatched || emailMatched) return { isAdmin: true, reason: 'jwt-claim' };
    return { isAdmin: false, reason: 'no-db-or-claim' };
  }

  // Confirm via DB lookup.
  try {
    const tables = getTables(config);
    const url = config.supabaseUrl;
    const { createClient } = await import('@supabase/supabase-js');
    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    const lookupId = sub;
    if (lookupId) {
      const { data, error } = await adminClient
        .from(tables.users)
        .select('email, role')
        .eq('id', lookupId)
        .maybeSingle();
      if (!error && data) {
        const dbEmail = (data.email || '').trim().toLowerCase();
        const dbRole = (data.role || '').trim();
        if (dbRole === 'admin' || adminEmails.includes(dbEmail)) {
          return { isAdmin: true, reason: 'db-lookup' };
        }
        return { isAdmin: false, reason: 'db-role-not-admin' };
      }
    }
    // Fallback to JWT claims if DB lookup didn't return a row.
    if (roleMatched || emailMatched) return { isAdmin: true, reason: 'jwt-claim-fallback' };
    return { isAdmin: false, reason: 'no-db-match' };
  } catch {
    if (roleMatched || emailMatched) return { isAdmin: true, reason: 'jwt-claim-fallback' };
    return { isAdmin: false, reason: 'db-lookup-error' };
  }
}

/** Extract a bearer token from a Request-like object. */
export function extractBearerToken(request: { headers: Headers }): string | null {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

/** User shape returned by requireAdmin. */
export interface AdminContext {
  user: AppUser;
  client: SupabaseClient;
  token: string;
}

/**
 * Require an admin request. Throws an HTTP-style error on failure.
 * Returns the resolved user + a service-role Supabase client.
 */
export async function requireAdmin(
  config: AdminConfig,
  request: { headers: Headers },
): Promise<AdminContext> {
  const token = extractBearerToken(request);
  if (!token) {
    const err = new Error('Unauthorized: missing bearer token') as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  const result = await isAdminFromToken(config, token);
  if (!result.isAdmin) {
    const err = new Error(`Forbidden: ${result.reason || 'not admin'}`) as Error & { status?: number };
    err.status = 403;
    throw err;
  }

  // Build a service-role client (or fallback to anon).
  const { createClient } = await import('@supabase/supabase-js');
  const url = config.supabaseUrl || 'https://placeholder.supabase.co';
  const key = config.supabaseServiceRoleKey || config.supabaseAnonKey || 'placeholder-key';
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const payload = decodeJwt<JwtPayload>(token) || {};
  const user: AppUser = {
    id: payload.sub || '',
    email: payload.email || '',
    name: payload.user_metadata?.email || payload.email || '',
    role: 'admin',
  };

  return { user, client, token };
}
