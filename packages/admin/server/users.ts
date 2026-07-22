/**
 * SERVER-ONLY — do not import from client components.
 *
 * User management: list, detail, update role/status, delete.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminConfig } from './verify';
import { getTables } from './verify';

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatarUrl: string | null;
  googleId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserRow {
  creditsBalance: number;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  videosProcessed: number;
  recentTransactions: Array<{
    id: string;
    amount: number;
    type: string;
    description: string;
    createdAt: string;
  }>;
}

export interface ListUsersOptions {
  page: number;
  pageSize: number;
  search?: string;
}

export interface ListUsersResult {
  users: AdminUserRow[];
  total: number;
}

/** List users with pagination and optional email/name search. */
export async function listUsers(
  config: AdminConfig,
  client: SupabaseClient,
  opts: ListUsersOptions,
): Promise<ListUsersResult> {
  const tables = getTables(config);
  const { page, pageSize, search } = opts;
  const offset = (page - 1) * pageSize;

  let baseQuery = client
    .from(tables.users)
    .select('id, email, name, role, avatar_url, google_id, created_at, is_active', { count: 'exact' });

  if (search && search.trim()) {
    const term = search.trim();
    baseQuery = baseQuery.or(`email.ilike.%${term}%,name.ilike.%${term}%`);
  }

  const { data, error, count } = await baseQuery
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    throw new Error(`listUsers failed: ${error.message}`);
  }

  const users: AdminUserRow[] = (data || []).map((u: Record<string, unknown>) => ({
    id: String(u.id),
    email: String(u.email || ''),
    name: (u.name as string) || null,
    role: String(u.role || 'user'),
    avatarUrl: (u.avatar_url as string) || null,
    googleId: (u.google_id as string) || null,
    isActive: u.is_active == null ? true : Boolean(u.is_active),
    createdAt: String(u.created_at || ''),
  }));

  return { users, total: count || 0 };
}

/** Fetch a single user's full detail (credits, subscription, transactions). */
export async function getUserDetail(
  config: AdminConfig,
  client: SupabaseClient,
  userId: string,
): Promise<AdminUserDetail> {
  const tables = getTables(config);
  if (!userId || userId === 'undefined') {
    throw new Error('Invalid user ID');
  }

  const [userRes, creditsRes, subsRes, videosRes, txRes] = await Promise.all([
    client.from(tables.users).select('*').eq('id', userId).maybeSingle(),
    client.from(tables.credits).select('balance').eq('user_id', userId).maybeSingle(),
    client.from(tables.subscriptions).select('plan_type, status').eq('user_id', userId).maybeSingle(),
    client.from(tables.videos).select('id', { count: 'exact', head: true }).eq('user_id', userId),
    client
      .from(tables.creditTransactions)
      .select('id, amount, type, description, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (userRes.error) throw new Error(`getUserDetail failed: ${userRes.error.message}`);
  if (!userRes.data) throw new Error('User not found');

  const u = userRes.data as Record<string, unknown>;
  const detail: AdminUserDetail = {
    id: String(u.id),
    email: String(u.email || ''),
    name: (u.name as string) || null,
    role: String(u.role || 'user'),
    avatarUrl: (u.avatar_url as string) || null,
    googleId: (u.google_id as string) || null,
    isActive: u.is_active == null ? true : Boolean(u.is_active),
    createdAt: String(u.created_at || ''),
    creditsBalance: (creditsRes.data?.balance as number) || 0,
    subscriptionPlan: subsRes.data?.plan_type as string | undefined,
    subscriptionStatus: subsRes.data?.status as string | undefined,
    videosProcessed: videosRes.count || 0,
    recentTransactions: (txRes.data || []).map((tx: Record<string, unknown>) => ({
      id: String(tx.id),
      amount: Number(tx.amount) || 0,
      type: String(tx.type || ''),
      description: String(tx.description || ''),
      createdAt: String(tx.created_at || ''),
    })),
  };

  return detail;
}

export interface UpdateUserInput {
  role?: 'admin' | 'user';
  status?: 'active' | 'disabled';
}

/** Update a user's role and/or status. */
export async function updateUser(
  config: AdminConfig,
  client: SupabaseClient,
  userId: string,
  input: UpdateUserInput,
): Promise<void> {
  const tables = getTables(config);
  const patch: Record<string, unknown> = {};
  if (input.role) patch.role = input.role;
  if (input.status) patch.is_active = input.status === 'active';

  if (Object.keys(patch).length === 0) return;

  const { error } = await client.from(tables.users).update(patch).eq('id', userId);
  if (error) throw new Error(`updateUser failed: ${error.message}`);
}

/** Delete a user (cascading cleanup of credits / subscriptions / transactions). */
export async function deleteUser(
  config: AdminConfig,
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  const tables = getTables(config);

  // Clean up related rows first (best-effort, ignore errors for missing tables).
  await Promise.all([
    client.from(tables.credits).delete().eq('user_id', userId),
    client.from(tables.subscriptions).delete().eq('user_id', userId),
    client.from(tables.creditTransactions).delete().eq('user_id', userId),
    client.from(tables.videos).delete().eq('user_id', userId),
  ]);

  const { error } = await client.from(tables.users).delete().eq('id', userId);
  if (error) throw new Error(`deleteUser failed: ${error.message}`);
}
