/**
 * SERVER-ONLY — do not import from client components.
 *
 * Server-side behavior tracking. Uses the service-role Supabase client
 * to write events directly to the behavior_events table.
 *
 * Use cases:
 *   - Payment webhooks (track subscribe_success)
 *   - Backend task completion
 *   - Any server-side event that needs reliable delivery
 *
 * Idempotency: trackServerEvent and trackServerConversion use session_id
 * as a dedup key — inserting the same session_id twice is a no-op.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../core/config';

export interface TrackServerEventInput {
  eventName: string;
  funnelId?: string;
  stepIndex?: number;
  userId?: string;
  userEmail?: string;
  sessionId: string;
  eventData?: Record<string, unknown>;
  pageUrl?: string;
  referrer?: string;
  userAgent?: string;
  ip?: string;
}

/**
 * Track a behavior event from the server. Uses session_id for idempotency:
 * if an event with the same session_id + event_name already exists,
 * the insert is skipped.
 */
export async function trackServerEvent(
  config: AppConfig,
  client: SupabaseClient,
  input: TrackServerEventInput,
): Promise<void> {
  const tableName = resolveBehaviorEventsTable(config);

  try {
    // Idempotency check: skip if this session_id + event_name already exists.
    const { data: existing } = await client
      .from(tableName)
      .select('id')
      .eq('session_id', input.sessionId)
      .eq('event_name', input.eventName)
      .limit(1);

    if (existing && existing.length > 0) {
      return; // already tracked
    }

    const insertData = {
      event_name: String(input.eventName).slice(0, 100),
      funnel_id: input.funnelId ? String(input.funnelId).slice(0, 50) : null,
      step_index: typeof input.stepIndex === 'number' ? input.stepIndex : null,
      event_data: input.eventData || {},
      session_id: String(input.sessionId).slice(0, 200),
      user_id: input.userId ? String(input.userId).slice(0, 100) : null,
      user_email: input.userEmail ? String(input.userEmail).slice(0, 200) : null,
      page_url: (input.pageUrl || '').slice(0, 500),
      referrer: (input.referrer || '').slice(0, 500),
      user_agent: (input.userAgent || 'server').slice(0, 500),
      ip: (input.ip || '').slice(0, 50),
    };

    const { error } = await client.from(tableName).insert(insertData);
    if (error) {
      console.warn('[analytics/server] trackServerEvent insert error:', error.message);
    }
  } catch (err) {
    console.warn('[analytics/server] trackServerEvent failed:', err);
  }
}

export interface TrackServerConversionInput {
  userId: string;
  userEmail?: string;
  planId: string;
  provider: string;
  orderId: string;
  amount?: number;
}

/**
 * Track a payment conversion (subscribe_success) from a webhook.
 * sessionId is deterministic: `server_${provider}_${orderId}` — this
 * ensures webhook retries don't create duplicate events.
 */
export async function trackServerConversion(
  config: AppConfig,
  client: SupabaseClient,
  input: TrackServerConversionInput,
): Promise<void> {
  const sessionId = `server_${input.provider}_${input.orderId}`;

  await trackServerEvent(config, client, {
    eventName: 'subscribe_success',
    funnelId: 'subscription',
    stepIndex: 3,
    userId: input.userId,
    userEmail: input.userEmail,
    sessionId,
    eventData: {
      payment_method: input.provider,
      plan_id: input.planId,
      amount_usd: input.amount,
      order_id: input.orderId,
      source: 'server_webhook',
    },
    userAgent: 'server/webhook',
  });
}

/** Resolve the behavior_events table name from config (default: 'behavior_events'). */
function resolveBehaviorEventsTable(config: AppConfig): string {
  // The AppConfig type doesn't have a `tables` field, but the admin
  // package's AdminConfig extends it. We check for the extended field
  // at runtime to allow table name customization.
  const extended = config as AppConfig & { tables?: { behaviorEvents?: string } };
  return extended.tables?.behaviorEvents || 'behavior_events';
}
