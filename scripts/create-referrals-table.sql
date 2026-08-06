-- Referral program: tracks invite relationships and reward status
-- Each new user can be referred by exactly one inviter (unique referee_id)
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_amount INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(20) NOT NULL DEFAULT 'completed', -- completed | reversed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referrals_referee_id_unique UNIQUE (referee_id)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_id_idx ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS referrals_status_idx ON referrals(status);

-- Enable RLS: service_role can read/write; users can read their own referrals
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Service role full access (already global, but explicit for clarity)
-- anon can INSERT only (for the reward claim from a freshly-registered user token);
-- users can SELECT rows where they are the referrer.
DROP POLICY IF EXISTS "referrals_select_own" ON referrals;
CREATE POLICY "referrals_select_own" ON referrals
  FOR SELECT USING (
    auth.uid() = referrer_id OR auth.uid() = referee_id
  );

-- INSERT allowed for authenticated users (the newly registered invitee claims the reward)
DROP POLICY IF EXISTS "referrals_insert_authenticated" ON referrals;
CREATE POLICY "referrals_insert_authenticated" ON referrals
  FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE/DELETE only via service_role (RLS blocks anon/authenticated)
DROP POLICY IF EXISTS "referrals_update_own" ON referrals;
CREATE POLICY "referrals_update_own" ON referrals
  FOR UPDATE USING (false);

DROP POLICY IF EXISTS "referrals_delete_own" ON referrals;
CREATE POLICY "referrals_delete_own" ON referrals
  FOR DELETE USING (false);
