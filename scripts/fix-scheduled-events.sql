-- Add missing columns to scheduled_events for RTMP pull, status tracking, and combined datetime
ALTER TABLE public.scheduled_events
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS rtmp_pull_url text;

-- Make video_id nullable (not needed for RTMP pull)
DO $$ BEGIN
  ALTER TABLE public.scheduled_events ALTER COLUMN video_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- No backfill needed -- scheduled_at already exists in the table

-- Allow service role to read/update scheduled_events for cron execution
DO $$ BEGIN
  CREATE POLICY "events_service_select" ON public.scheduled_events FOR SELECT TO service_role USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "events_service_update" ON public.scheduled_events FOR UPDATE TO service_role USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "events_service_insert" ON public.scheduled_events FOR INSERT TO service_role WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
