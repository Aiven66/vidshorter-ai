-- Async video pipeline schema additions
-- Adds durable progress / error state columns to the videos table.
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS progress_message TEXT;
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS desired_clip_count INTEGER;

CREATE INDEX IF NOT EXISTS idx_videos_updated_at ON public.videos(updated_at DESC);