/**
 * SQL DDL for the behavior_events table.
 *
 * Run this in your Supabase SQL editor to create the table.
 * Includes indexes for common query patterns and RLS policies
 * that allow anonymous inserts (for tracking) but restrict
 * reads to the service role.
 */

export const BEHAVIOR_EVENTS_SQL = `-- Behavior Events table for user behavior tracking (funnel analytics)
CREATE TABLE IF NOT EXISTS public.behavior_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  user_email TEXT,
  session_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  funnel_id TEXT,
  step_index INTEGER,
  event_data JSONB DEFAULT '{}'::jsonb,
  page_url TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_behavior_events_event_name ON public.behavior_events(event_name);
CREATE INDEX IF NOT EXISTS idx_behavior_events_funnel_id ON public.behavior_events(funnel_id);
CREATE INDEX IF NOT EXISTS idx_behavior_events_created_at ON public.behavior_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavior_events_user_id ON public.behavior_events(user_id);
CREATE INDEX IF NOT EXISTS idx_behavior_events_session_id ON public.behavior_events(session_id);

-- RLS policies
ALTER TABLE public.behavior_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "behavior_events_insert_any" ON public.behavior_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "behavior_events_select_admin" ON public.behavior_events
  FOR SELECT TO service_role USING (true);

NOTIFY pgrst, 'reload schema';`;
