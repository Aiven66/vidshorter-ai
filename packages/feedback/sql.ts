/**
 * @clipop/feedback - Database DDL
 *
 * Run this in your Supabase SQL editor to provision the feedbacks table.
 * The table is brand-agnostic; the only assumption is a `users(id uuid, role text)`
 * table that holds an `admin` role value (matches @clipop/core AppUser shape).
 */
export const FEEDBACK_SQL = `CREATE TABLE IF NOT EXISTS feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  rating INTEGER,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_id ON feedbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks(status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON feedbacks(created_at DESC);
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
-- 用户只能 INSERT/SELECT 自己的反馈
CREATE POLICY "feedback_insert_own" ON feedbacks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "feedback_select_own" ON feedbacks FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- 管理员可 SELECT 所有反馈
CREATE POLICY "feedback_admin_select" ON feedbacks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);`;
