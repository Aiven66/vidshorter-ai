-- ============================================
-- VidShorter AI - Full Database Migration Script
-- 完整数据库迁移脚本
-- ============================================

-- Enable extensions
create extension if not exists pgcrypto;

-- ============================================
-- Users table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(128),
  password_hash VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  google_id VARCHAR(255),
  avatar_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Additional columns
  country TEXT,
  region TEXT,
  city TEXT,
  last_seen_at TIMESTAMPTZ
);

-- ============================================
-- Credits table - Point system
-- ============================================
CREATE TABLE IF NOT EXISTS credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 100,
  last_reset_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Subscriptions table
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_type VARCHAR(20) NOT NULL DEFAULT 'free',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Videos table - Original long videos
-- ============================================
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_url VARCHAR(1000) NOT NULL,
  source_type VARCHAR(20) NOT NULL DEFAULT 'youtube',
  title VARCHAR(500),
  duration INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  highlights TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Short videos table - Generated short clips
-- ============================================
CREATE TABLE IF NOT EXISTS short_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url VARCHAR(1000) NOT NULL,
  start_time NUMERIC(10, 2) NOT NULL,
  end_time NUMERIC(10, 2) NOT NULL,
  duration INTEGER NOT NULL,
  highlight_title VARCHAR(255),
  highlight_summary TEXT,
  thumbnail_url VARCHAR(1000),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Blogs table (with multi-language support)
-- ============================================
CREATE TABLE IF NOT EXISTS blogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  cover_image VARCHAR(1000),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_published BOOLEAN DEFAULT false NOT NULL,
  view_count INTEGER DEFAULT 0 NOT NULL,
  locale VARCHAR(10) DEFAULT 'en',
  parent_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Credit transactions table
-- ============================================
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  description VARCHAR(500),
  related_id VARCHAR(36),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- Feedbacks table
-- ============================================
CREATE TABLE IF NOT EXISTS feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  rating INTEGER,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================
-- Users
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_google_id_idx ON users(google_id);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- Credits
CREATE INDEX IF NOT EXISTS credits_user_id_idx ON credits(user_id);
CREATE INDEX IF NOT EXISTS credits_last_reset_at_idx ON credits(last_reset_at);

-- Subscriptions
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_plan_type_idx ON subscriptions(plan_type);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx ON subscriptions(stripe_subscription_id);

-- Videos
CREATE INDEX IF NOT EXISTS videos_user_id_idx ON videos(user_id);
CREATE INDEX IF NOT EXISTS videos_status_idx ON videos(status);
CREATE INDEX IF NOT EXISTS videos_created_at_idx ON videos(created_at);

-- Short videos
CREATE INDEX IF NOT EXISTS short_videos_video_id_idx ON short_videos(video_id);
CREATE INDEX IF NOT EXISTS short_videos_user_id_idx ON short_videos(user_id);
CREATE INDEX IF NOT EXISTS short_videos_created_at_idx ON short_videos(created_at);

-- Blogs
CREATE INDEX IF NOT EXISTS blogs_author_id_idx ON blogs(author_id);
CREATE INDEX IF NOT EXISTS blogs_category_idx ON blogs(category);
CREATE INDEX IF NOT EXISTS blogs_is_published_idx ON blogs(is_published);
CREATE INDEX IF NOT EXISTS blogs_created_at_idx ON blogs(created_at);
CREATE INDEX IF NOT EXISTS blogs_parent_id_idx ON blogs(parent_id);
CREATE INDEX IF NOT EXISTS blogs_locale_idx ON blogs(locale);

-- Credit transactions
CREATE INDEX IF NOT EXISTS credit_transactions_user_id_idx ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS credit_transactions_type_idx ON credit_transactions(type);
CREATE INDEX IF NOT EXISTS credit_transactions_created_at_idx ON credit_transactions(created_at);

-- Feedbacks
CREATE INDEX IF NOT EXISTS feedbacks_user_id_idx ON feedbacks(user_id);
CREATE INDEX IF NOT EXISTS feedbacks_created_at_idx ON feedbacks(created_at);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE short_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for Users
-- ============================================
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS users_admin_select ON public.users;
CREATE POLICY users_admin_select ON public.users FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

-- ============================================
-- RLS Policies for Credits
-- ============================================
DROP POLICY IF EXISTS credits_select_own ON public.credits;
CREATE POLICY credits_select_own ON public.credits FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS credits_update_own ON public.credits;
CREATE POLICY credits_update_own ON public.credits FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS credits_admin_select ON public.credits;
CREATE POLICY credits_admin_select ON public.credits FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

-- ============================================
-- RLS Policies for Subscriptions
-- ============================================
DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS subscriptions_admin_select ON public.subscriptions;
CREATE POLICY subscriptions_admin_select ON public.subscriptions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

-- ============================================
-- RLS Policies for Videos
-- ============================================
DROP POLICY IF EXISTS videos_insert_own ON public.videos;
CREATE POLICY videos_insert_own ON public.videos FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS videos_select_own ON public.videos;
CREATE POLICY videos_select_own ON public.videos FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS videos_update_own ON public.videos;
CREATE POLICY videos_update_own ON public.videos FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS videos_admin_select ON public.videos;
CREATE POLICY videos_admin_select ON public.videos FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

-- ============================================
-- RLS Policies for Short Videos
-- ============================================
DROP POLICY IF EXISTS short_videos_insert_own ON public.short_videos;
CREATE POLICY short_videos_insert_own ON public.short_videos FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS short_videos_select_own ON public.short_videos;
CREATE POLICY short_videos_select_own ON public.short_videos FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS short_videos_admin_select ON public.short_videos;
CREATE POLICY short_videos_admin_select ON public.short_videos FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

-- ============================================
-- RLS Policies for Credit Transactions
-- ============================================
DROP POLICY IF EXISTS credit_transactions_insert_own ON public.credit_transactions;
CREATE POLICY credit_transactions_insert_own ON public.credit_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS credit_transactions_select_own ON public.credit_transactions;
CREATE POLICY credit_transactions_select_own ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS credit_transactions_admin_select ON public.credit_transactions;
CREATE POLICY credit_transactions_admin_select ON public.credit_transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

-- ============================================
-- RLS Policies for Blogs
-- ============================================
DROP POLICY IF EXISTS blogs_select_all ON public.blogs;
CREATE POLICY blogs_select_all ON public.blogs FOR SELECT USING (is_published = true);

DROP POLICY IF EXISTS blogs_admin_select ON public.blogs;
CREATE POLICY blogs_admin_select ON public.blogs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

DROP POLICY IF EXISTS blogs_admin_insert ON public.blogs;
CREATE POLICY blogs_admin_insert ON public.blogs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

DROP POLICY IF EXISTS blogs_admin_update ON public.blogs;
CREATE POLICY blogs_admin_update ON public.blogs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

DROP POLICY IF EXISTS blogs_admin_delete ON public.blogs;
CREATE POLICY blogs_admin_delete ON public.blogs FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

-- ============================================
-- RLS Policies for Feedbacks
-- ============================================
DROP POLICY IF EXISTS feedback_insert_own ON public.feedbacks;
CREATE POLICY feedback_insert_own ON public.feedbacks FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS feedback_select_own ON public.feedbacks;
CREATE POLICY feedback_select_own ON public.feedbacks FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS feedback_admin_select ON public.feedbacks;
CREATE POLICY feedback_admin_select ON public.feedbacks FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

-- ============================================
-- Insert admin user if not exists
-- ============================================
INSERT INTO users (id, email, name, role, is_active, created_at, updated_at)
SELECT 'admin-default-id', 'admin@vidshorter.ai', 'Admin', 'admin', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@vidshorter.ai');

INSERT INTO users (id, email, name, role, is_active, created_at, updated_at)
SELECT 'admin-126-id', 'admin@126.com', 'Admin', 'admin', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@126.com');

-- ============================================
-- Grant permissions for anon key access
-- ============================================
GRANT SELECT ON blogs TO anon;
GRANT SELECT ON users TO anon;
GRANT SELECT ON credits TO anon;
GRANT SELECT ON subscriptions TO anon;
GRANT SELECT ON videos TO anon;
GRANT SELECT ON short_videos TO anon;
GRANT SELECT ON credit_transactions TO anon;
GRANT SELECT ON feedbacks TO anon;

GRANT INSERT ON blogs TO anon;
GRANT INSERT ON users TO anon;
GRANT INSERT ON credits TO anon;
GRANT INSERT ON subscriptions TO anon;
GRANT INSERT ON videos TO anon;
GRANT INSERT ON short_videos TO anon;
GRANT INSERT ON credit_transactions TO anon;
GRANT INSERT ON feedbacks TO anon;

GRANT UPDATE ON blogs TO anon;
GRANT UPDATE ON users TO anon;
GRANT UPDATE ON credits TO anon;
GRANT UPDATE ON subscriptions TO anon;
GRANT UPDATE ON videos TO anon;
GRANT UPDATE ON short_videos TO anon;
GRANT UPDATE ON credit_transactions TO anon;
GRANT UPDATE ON feedbacks TO anon;

GRANT DELETE ON blogs TO anon;
GRANT DELETE ON users TO anon;
GRANT DELETE ON credits TO anon;
GRANT DELETE ON subscriptions TO anon;
GRANT DELETE ON videos TO anon;
GRANT DELETE ON short_videos TO anon;
GRANT DELETE ON credit_transactions TO anon;
GRANT DELETE ON feedbacks TO anon;

-- ============================================
-- Referrals table (invite-a-friend growth loop)
-- ============================================
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_amount INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referrals_referee_id_unique UNIQUE (referee_id)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_id_idx ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS referrals_status_idx ON referrals(status);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referrals_select_own ON referrals;
CREATE POLICY referrals_select_own ON referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

DROP POLICY IF EXISTS referrals_insert_authenticated ON referrals;
CREATE POLICY referrals_insert_authenticated ON referrals
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS referrals_update_own ON referrals;
CREATE POLICY referrals_update_own ON referrals FOR UPDATE USING (false);

DROP POLICY IF EXISTS referrals_delete_own ON referrals;
CREATE POLICY referrals_delete_own ON referrals FOR DELETE USING (false);

GRANT SELECT ON referrals TO anon;
GRANT INSERT ON referrals TO anon;
GRANT SELECT ON referrals TO authenticated;
GRANT INSERT ON referrals TO authenticated;

-- ============================================
-- Migration completed
-- ============================================
SELECT 'Database migration completed successfully' AS status;