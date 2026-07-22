/**
 * SERVER-ONLY — do not import from client components.
 *
 * Aggregate platform analytics: user growth, revenue, retention, ARPU.
 * Table names come from config so hosts can customize their schema.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanConfig } from '../core/types';
import type { AdminConfig } from './verify';
import { getTables } from './verify';

export interface RetentionRates {
  day1: number;
  day3: number;
  day7: number;
  day30: number;
}

export interface AnalyticsStats {
  totalUsers: number;
  newToday: number;
  newThisMonth: number;
  activeSubs: number;
  totalVideos: number;
  totalRevenue: number;
  activeUsers7d: number;
  retentionRates: RetentionRates;
  arpu: number;
  conversionRate: number;
}

function startOfTodayUtcIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

function startOfMonthUtcIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function startOfDaysAgoUtcIso(days: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days, 0, 0, 0, 0)).toISOString();
}

/** Build a plan-id → price map from config.plans. */
function buildPriceMap(plans: PlanConfig[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of plans) {
    map[p.id.toLowerCase()] = p.priceIntl;
  }
  return map;
}

/** Parse a plan id from a credit_transactions.description string. */
function parsePlanFromDescription(desc: string, priceMap: Record<string, number>): string | null {
  const lower = (desc || '').toLowerCase();
  for (const planId of Object.keys(priceMap)) {
    if (lower.includes(planId)) return planId;
  }
  return null;
}

/**
 * Fetch the full analytics payload. All queries run concurrently.
 * Pass the service-role client to bypass RLS.
 */
export async function fetchAnalytics(
  config: AdminConfig,
  client: SupabaseClient,
): Promise<AnalyticsStats> {
  const tables = getTables(config);
  const priceMap = buildPriceMap(config.plans || []);
  const todayStart = startOfTodayUtcIso();
  const monthStart = startOfMonthUtcIso();
  const sevenDaysAgo = startOfDaysAgoUtcIso(7);

  const empty: AnalyticsStats = {
    totalUsers: 0,
    newToday: 0,
    newThisMonth: 0,
    activeSubs: 0,
    totalVideos: 0,
    totalRevenue: 0,
    activeUsers7d: 0,
    retentionRates: { day1: 0, day3: 0, day7: 0, day30: 0 },
    arpu: 0,
    conversionRate: 0,
  };

  try {
    const [
      totalUsersRes,
      newTodayRes,
      newMonthRes,
      activeSubsRes,
      videosRes,
      paymentsRes,
      activeUsersRes,
    ] = await Promise.all([
      client.from(tables.users).select('id', { count: 'exact', head: true }),
      client.from(tables.users).select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      client.from(tables.users).select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
      client
        .from(tables.subscriptions)
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .neq('plan_type', 'free'),
      client.from(tables.videos).select('id', { count: 'exact', head: true }),
      client.from(tables.creditTransactions).select('description').eq('type', 'purchase'),
      client
        .from(tables.videos)
        .select('user_id', { count: 'distinct', head: true })
        .gte('created_at', sevenDaysAgo),
    ]);

    const totalUsers = totalUsersRes.count || 0;
    const newToday = newTodayRes.count || 0;
    const newThisMonth = newMonthRes.count || 0;
    const activeSubs = activeSubsRes.count || 0;
    const totalVideos = videosRes.count || 0;
    const activeUsers7d = activeUsersRes.count || 0;

    // Revenue from purchase transactions (matched against plan price map).
    let totalRevenue = 0;
    for (const tx of paymentsRes.data || []) {
      const desc = (tx?.description || '').toLowerCase();
      const planId = parsePlanFromDescription(desc, priceMap);
      if (planId && priceMap[planId] != null) {
        totalRevenue += priceMap[planId];
      }
    }

    // Derived metrics.
    const arpu = totalUsers > 0 ? totalRevenue / totalUsers : 0;
    const conversionRate = totalUsers > 0 ? (activeSubs / totalUsers) * 100 : 0;

    // Retention (cohort: users registered > 31 days ago, activity from videos table).
    const retentionRates = await computeRetention(client, tables, [1, 3, 7, 30]);

    return {
      totalUsers,
      newToday,
      newThisMonth,
      activeSubs,
      totalVideos,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      activeUsers7d,
      retentionRates,
      arpu: Math.round(arpu * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
    };
  } catch {
    return empty;
  }
}

/** Compute day-N retention for a cohort of users registered before the retention window. */
async function computeRetention(
  client: SupabaseClient,
  tables: { users: string; videos: string },
  days: number[],
): Promise<RetentionRates> {
  const result: RetentionRates = { day1: 0, day3: 0, day7: 0, day30: 0 };
  try {
    const maxDays = Math.max(...days);
    const cutoff = startOfDaysAgoUtcIso(maxDays + 1);
    const { data: cohort } = await client
      .from(tables.users)
      .select('id, created_at')
      .lt('created_at', cutoff)
      .limit(500);

    const users = cohort || [];
    if (users.length === 0) return result;

    const userIds = users.map((u) => u.id);
    const { data: activityRows } = await client
      .from(tables.videos)
      .select('user_id, created_at')
      .in('user_id', userIds);

    const activityByUser: Record<string, string[]> = {};
    for (const row of activityRows || []) {
      if (!row?.user_id) continue;
      if (!activityByUser[row.user_id]) activityByUser[row.user_id] = [];
      activityByUser[row.user_id].push(row.created_at);
    }

    for (const day of days) {
      let retained = 0;
      for (const user of users) {
        const activity = activityByUser[user.id] || [];
        const userCreatedMs = new Date(user.created_at).getTime();
        for (const ts of activity) {
          const diffDays = (new Date(ts).getTime() - userCreatedMs) / (1000 * 60 * 60 * 24);
          if (diffDays >= day && diffDays <= day + 1) {
            retained++;
            break;
          }
        }
      }
      const rate = (retained / users.length) * 100;
      const key = `day${day}` as keyof RetentionRates;
      result[key] = Math.round(rate * 100) / 100;
    }
  } catch {
    // swallow — retention is best-effort
  }
  return result;
}
