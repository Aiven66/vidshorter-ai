-- Behavior Events table for user behavior tracking (funnel analytics)
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

ALTER TABLE public.behavior_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can insert behavior events" ON public.behavior_events;
CREATE POLICY "Anon can insert behavior events" ON public.behavior_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can read all behavior events" ON public.behavior_events;
CREATE POLICY "Service role can read all behavior events" ON public.behavior_events
  FOR SELECT TO anon, authenticated
  USING (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
