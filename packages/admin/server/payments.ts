/**
 * SERVER-ONLY — do not import from client components.
 *
 * Payment management: list subscriptions, transactions, revenue summaries.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanConfig } from '../core/types';
import type { AdminConfig } from './verify';
import { getTables } from './verify';

export interface PaymentRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  amount: number;
  planType: string;
  description: string;
  createdAt: string;
}

export interface TransactionRow {
  id: string;
  userId: string;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
}

export interface PaymentSummary {
  totalRevenue: number;
  monthRevenue: number;
  byPlan: Record<string, { count: number; revenue: number }>;
  byProvider: Record<string, { count: number; revenue: number }>;
}

export interface ListPaymentsOptions {
  page: number;
  pageSize: number;
  planType?: string;
  status?: string;
}

export interface ListPaymentsResult {
  payments: PaymentRow[];
  total: number;
  summary: PaymentSummary;
}

export interface ListTransactionsOptions {
  page: number;
  pageSize: number;
  userId?: string;
  type?: string;
}

export interface ListTransactionsResult {
  transactions: TransactionRow[];
  total: number;
}

function buildPriceMap(plans: PlanConfig[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of plans) map[p.id.toLowerCase()] = p.priceIntl;
  return map;
}

function parsePlanFromDescription(desc: string, priceMap: Record<string, number>): string | null {
  const lower = (desc || '').toLowerCase();
  for (const planId of Object.keys(priceMap)) {
    if (lower.includes(planId)) return planId;
  }
  return null;
}

function parseProviderFromDescription(desc: string): string {
  const match = (desc || '').match(/via\s+(\w+)/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

function startOfMonthUtcIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

/**
 * List subscription payment records (from credit_transactions type='purchase')
 * with a revenue summary broken down by plan and provider.
 */
export async function listPayments(
  config: AdminConfig,
  client: SupabaseClient,
  opts: ListPaymentsOptions,
): Promise<ListPaymentsResult> {
  const tables = getTables(config);
  const priceMap = buildPriceMap(config.plans || []);
  const { page, pageSize, planType, status } = opts;
  const offset = (page - 1) * pageSize;

  // Paged purchase transactions.
  let query = client
    .from(tables.creditTransactions)
    .select('id, user_id, amount, description, type, created_at', { count: 'exact' })
    .eq('type', 'purchase');

  // status filter applies to the subscriptions table join — we filter after fetch.
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw new Error(`listPayments failed: ${error.message}`);

  // Resolve user emails for the page.
  const txRows = (data || []) as Array<Record<string, unknown>>;
  const userIds = [...new Set(txRows.map((tx) => String(tx.user_id)).filter(Boolean))];
  const userMap: Record<string, { email: string; name: string }> = {};
  if (userIds.length > 0) {
    const { data: usersData } = await client
      .from(tables.users)
      .select('id, email, name')
      .in('id', userIds);
    for (const u of (usersData || []) as Array<Record<string, unknown>>) {
      userMap[String(u.id)] = { email: String(u.email || ''), name: String(u.name || '') };
    }
  }

  let payments: PaymentRow[] = txRows.map((tx) => {
    const desc = String(tx.description || '');
    const planId = parsePlanFromDescription(desc, priceMap);
    const user = userMap[String(tx.user_id)] || { email: '', name: '' };
    return {
      id: String(tx.id),
      userId: String(tx.user_id || ''),
      userEmail: user.email,
      userName: user.name,
      amount: planId ? priceMap[planId] : Number(tx.amount) || 0,
      planType: planId || 'unknown',
      description: desc,
      createdAt: String(tx.created_at || ''),
    };
  });

  // Apply plan filter (post-fetch, since plan is parsed from description).
  if (planType) {
    payments = payments.filter((p) => p.planType === planType);
  }

  // Apply subscription status filter (requires a join — fetch subscriptions).
  if (status) {
    const subUserIds = payments.map((p) => p.userId);
    const { data: subsData } = await client
      .from(tables.subscriptions)
      .select('user_id, status')
      .in('user_id', subUserIds)
      .eq('status', status);
    const activeIds = new Set((subsData || []).map((s: Record<string, unknown>) => String(s.user_id)));
    payments = payments.filter((p) => activeIds.has(p.userId));
  }

  // Summary: scan all purchase transactions.
  const { data: allTx } = await client
    .from(tables.creditTransactions)
    .select('description, created_at')
    .eq('type', 'purchase');

  const monthStart = startOfMonthUtcIso();
  const summary: PaymentSummary = {
    totalRevenue: 0,
    monthRevenue: 0,
    byPlan: {},
    byProvider: {},
  };

  for (const tx of (allTx || []) as Array<Record<string, unknown>>) {
    const desc = String(tx.description || '');
    const planId = parsePlanFromDescription(desc, priceMap);
    const provider = parseProviderFromDescription(desc);
    const amount = planId ? priceMap[planId] : 0;
    const createdAt = String(tx.created_at || '');

    summary.totalRevenue += amount;
    if (createdAt >= monthStart) summary.monthRevenue += amount;

    if (planId) {
      if (!summary.byPlan[planId]) summary.byPlan[planId] = { count: 0, revenue: 0 };
      summary.byPlan[planId].count++;
      summary.byPlan[planId].revenue += amount;
    }
    if (!summary.byProvider[provider]) summary.byProvider[provider] = { count: 0, revenue: 0 };
    summary.byProvider[provider].count++;
    summary.byProvider[provider].revenue += amount;
  }

  summary.totalRevenue = Math.round(summary.totalRevenue * 100) / 100;
  summary.monthRevenue = Math.round(summary.monthRevenue * 100) / 100;

  return { payments, total: count || 0, summary };
}

/** List credit transactions (all types) with optional user/type filters. */
export async function listTransactions(
  config: AdminConfig,
  client: SupabaseClient,
  opts: ListTransactionsOptions,
): Promise<ListTransactionsResult> {
  const tables = getTables(config);
  const { page, pageSize, userId, type } = opts;
  const offset = (page - 1) * pageSize;

  let query = client
    .from(tables.creditTransactions)
    .select('id, user_id, amount, type, description, created_at', { count: 'exact' });

  if (userId) query = query.eq('user_id', userId);
  if (type) query = query.eq('type', type);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw new Error(`listTransactions failed: ${error.message}`);

  const transactions: TransactionRow[] = (data || []).map((tx: Record<string, unknown>) => ({
    id: String(tx.id),
    userId: String(tx.user_id || ''),
    amount: Number(tx.amount) || 0,
    type: String(tx.type || ''),
    description: String(tx.description || ''),
    createdAt: String(tx.created_at || ''),
  }));

  return { transactions, total: count || 0 };
}
