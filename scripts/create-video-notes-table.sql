-- Video Notes table - AI 生成的视频高光笔记
-- 与 videos / short_videos 同样的用户绑定策略
CREATE TABLE IF NOT EXISTS video_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_url VARCHAR(1000) NOT NULL,
  source_type VARCHAR(20) NOT NULL, -- youtube | bilibili | local
  video_title VARCHAR(500),
  thumbnail_url VARCHAR(1000),
  -- 结构化笔记内容 JSON: { summary, highlights:[{timestamp,text,level}], takeaways:[] }
  content_json JSONB NOT NULL,
  raw_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS video_notes_user_id_idx ON video_notes(user_id);
CREATE INDEX IF NOT EXISTS video_notes_source_type_idx ON video_notes(source_type);
CREATE INDEX IF NOT EXISTS video_notes_created_at_idx ON video_notes(created_at);

-- 启用 RLS: 用户只能查看/管理自己的笔记
ALTER TABLE video_notes ENABLE ROW LEVEL SECURITY;

-- 用户可以查看自己的笔记
DROP POLICY IF EXISTS "video_notes_select_own" ON video_notes;
CREATE POLICY "video_notes_select_own" ON video_notes
  FOR SELECT USING (auth.uid() = user_id);

-- 用户可以插入自己的笔记
DROP POLICY IF EXISTS "video_notes_insert_own" ON video_notes;
CREATE POLICY "video_notes_insert_own" ON video_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 用户可以更新自己的笔记
DROP POLICY IF EXISTS "video_notes_update_own" ON video_notes;
CREATE POLICY "video_notes_update_own" ON video_notes
  FOR UPDATE USING (auth.uid() = user_id);

-- 用户可以删除自己的笔记
DROP POLICY IF EXISTS "video_notes_delete_own" ON video_notes;
CREATE POLICY "video_notes_delete_own" ON video_notes
  FOR DELETE USING (auth.uid() = user_id);
