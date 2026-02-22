-- Add missing columns to scheduled_events for RTMP pull, status tracking, and combined datetime
ALTER TABLE public.scheduled_events
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'error', 'cancelled')),
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'video' CHECK (source_type IN ('video', 'rtmp_pull', 'playlist')),
  ADD COLUMN IF NOT EXISTS rtmp_pull_url text;

-- Make video_id nullable (not needed for RTMP pull)
ALTER TABLE public.scheduled_events ALTER COLUMN video_id DROP NOT NULL;

-- Backfill scheduled_at from scheduled_date + scheduled_time for existing rows
UPDATE public.scheduled_events
SET scheduled_at = (scheduled_date::text || ' ' || scheduled_time::text)::timestamptz
WHERE scheduled_at IS NULL AND scheduled_date IS NOT NULL AND scheduled_time IS NOT NULL;

-- Allow service role to read/update scheduled_events for cron execution
CREATE POLICY IF NOT EXISTS "events_service_select" ON public.scheduled_events
  FOR SELECT TO service_role USING (true);
CREATE POLICY IF NOT EXISTS "events_service_update" ON public.scheduled_events
  FOR UPDATE TO service_role USING (true);
CREATE POLICY IF NOT EXISTS "events_service_insert" ON public.scheduled_events
  FOR INSERT TO service_role WITH CHECK (true);
