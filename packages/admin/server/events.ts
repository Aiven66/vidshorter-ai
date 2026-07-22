/**
 * SERVER-ONLY — do not import from client components.
 *
 * Behavior event analytics: funnel aggregation, daily trends, summaries.
 * Funnel definitions are read from config.funnels (no hardcoded ids).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FunnelStats } from '../core/types';
import type { AdminConfig } from './verify';
import { getTables } from './verify';

export interface FetchEventsOptions {
  /** Number of days to look back (default 30). */
  days?: number;
  /** Optional: filter to a single funnel id. */
  funnelId?: string;
}

export interface DailyTrendPoint {
  date: string;
  /** event_name → count */
  counts: Record<string, number>;
  total: number;
}

export interface EventsSummary {
  totalEvents: number;
  uniqueUsers: number;
  uniqueSessions: number;
}

export interface FetchEventsResult {
  funnels: FunnelStats[];
  dailyTrend: DailyTrendPoint[];
  summary: EventsSummary;
  range: { startDate: string; endDate: string };
}

interface RawEventRow {
  event_name: string;
  funnel_id: string | null;
  step_index: number | null;
  user_id: string | null;
  session_id: string;
  created_at: string;
}

/** Aggregate behavior events into funnel stats + daily trends. */
export async function fetchBehaviorEvents(
  config: AdminConfig,
  client: SupabaseClient,
  opts: FetchEventsOptions = {},
): Promise<FetchEventsResult> {
  const tables = getTables(config);
  const days = opts.days || 30;
  const funnelDefs = config.funnels || [];

  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const startTs = `${startDate}T00:00:00.000Z`;
  const endTs = `${endDate}T23:59:59.999Z`;

  const empty: FetchEventsResult = {
    funnels: [],
    dailyTrend: [],
    summary: { totalEvents: 0, uniqueUsers: 0, uniqueSessions: 0 },
    range: { startDate, endDate },
  };

  try {
    const { data, error } = await client
      .from(tables.behaviorEvents)
      .select('event_name,funnel_id,step_index,user_id,session_id,created_at')
      .gte('created_at', startTs)
      .lte('created_at', endTs)
      .order('created_at', { ascending: true })
      .limit(50000);

    if (error) throw new Error(`fetchBehaviorEvents: ${error.message}`);

    const allEvents = (data || []) as unknown as RawEventRow[];

    // ── Summary ──────────────────────────────────────────────
    const userIds = new Set<string>();
    const sessionIds = new Set<string>();
    for (const ev of allEvents) {
      if (ev.user_id) userIds.add(ev.user_id);
      if (ev.session_id) sessionIds.add(ev.session_id);
    }

    // ── Funnel aggregation ───────────────────────────────────
    const funnels: FunnelStats[] = [];
    const targetFunnels = opts.funnelId
      ? funnelDefs.filter((f) => f.id === opts.funnelId)
      : funnelDefs;

    for (const def of targetFunnels) {
      const funnelEvents = allEvents.filter((e) => e.funnel_id === def.id);
      const steps = def.steps.map((stepDef, i) => {
        const stepEvents = funnelEvents.filter((e) => e.event_name === stepDef.event);
        const uniqueUsers = new Set(stepEvents.map((e) => e.user_id).filter(Boolean)).size;
        const uniqueSessions = new Set(stepEvents.map((e) => e.session_id).filter(Boolean)).size;
        return {
          step: stepDef.step,
          eventName: stepDef.event,
          count: stepEvents.length,
          uniqueUsers,
          uniqueSessions,
          conversionFromPrevious: 0,
          conversionFromFirst: 0,
        };
      });

      // Compute conversion rates.
      const firstCount = steps[0]?.count || 0;
      for (let i = 0; i < steps.length; i++) {
        const prevCount = i > 0 ? steps[i - 1].count : steps[i].count;
        steps[i].conversionFromPrevious = prevCount > 0 ? (steps[i].count / prevCount) * 100 : 0;
        steps[i].conversionFromFirst = firstCount > 0 ? (steps[i].count / firstCount) * 100 : i === 0 ? 100 : 0;
      }

      funnels.push({ funnelId: def.id, steps });
    }

    // ── Daily trend ──────────────────────────────────────────
    const dailyMap = new Map<string, Record<string, number>>();
    for (const ev of allEvents) {
      const date = (ev.created_at || '').slice(0, 10);
      if (!date) continue;
      if (!dailyMap.has(date)) dailyMap.set(date, {});
      const dayCounts = dailyMap.get(date)!;
      dayCounts[ev.event_name] = (dayCounts[ev.event_name] || 0) + 1;
    }

    const dailyTrend: DailyTrendPoint[] = Array.from(dailyMap.entries())
      .map(([date, counts]) => ({
        date,
        counts,
        total: Object.values(counts).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      funnels,
      dailyTrend,
      summary: {
        totalEvents: allEvents.length,
        uniqueUsers: userIds.size,
        uniqueSessions: sessionIds.size,
      },
      range: { startDate, endDate },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetchBehaviorEvents failed';
    const e = new Error(message) as Error & { result?: FetchEventsResult };
    e.result = empty;
    throw e;
  }
}
