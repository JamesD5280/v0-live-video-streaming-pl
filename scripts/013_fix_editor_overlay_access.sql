-- Fix editor access to overlays
-- Currently, overlays RLS policies only allow users to see their own overlays.
-- Editors should be able to see and manage overlays created by any user in the system.
-- Since this is a single-tenant app (all users work together), we'll allow all authenticated users
-- with 'editor' or 'admin' role to access overlays.

-- First, drop existing restrictive policies
DROP POLICY IF EXISTS "overlays_select_own" ON public.overlays;
DROP POLICY IF EXISTS "overlays_insert_own" ON public.overlays;
DROP POLICY IF EXISTS "overlays_update_own" ON public.overlays;
DROP POLICY IF EXISTS "overlays_delete_own" ON public.overlays;

-- Create new policies that allow editors and admins to access all overlays
-- Viewers can only see overlays (read-only)

-- SELECT: All authenticated users can view overlays
CREATE POLICY "overlays_select_team" ON public.overlays 
  FOR SELECT 
  TO authenticated 
  USING (true);

-- INSERT: Admins and editors can create overlays
CREATE POLICY "overlays_insert_team" ON public.overlays 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'editor')
    )
  );

-- UPDATE: Admins and editors can update any overlay
CREATE POLICY "overlays_update_team" ON public.overlays 
  FOR UPDATE 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'editor')
    )
  );

-- DELETE: Admins and editors can delete any overlay
CREATE POLICY "overlays_delete_team" ON public.overlays 
  FOR DELETE 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'editor')
    )
  );

-- Also fix videos, destinations, playlists, and streams to allow team access

-- VIDEOS: Allow editors to see and manage all videos
DROP POLICY IF EXISTS "videos_select_own" ON public.videos;
DROP POLICY IF EXISTS "videos_insert_own" ON public.videos;
DROP POLICY IF EXISTS "videos_update_own" ON public.videos;
DROP POLICY IF EXISTS "videos_delete_own" ON public.videos;

CREATE POLICY "videos_select_team" ON public.videos 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "videos_insert_team" ON public.videos 
  FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

CREATE POLICY "videos_update_team" ON public.videos 
  FOR UPDATE TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

CREATE POLICY "videos_delete_team" ON public.videos 
  FOR DELETE TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

-- DESTINATIONS: Allow editors to see and manage all destinations
DROP POLICY IF EXISTS "destinations_select_own" ON public.destinations;
DROP POLICY IF EXISTS "destinations_insert_own" ON public.destinations;
DROP POLICY IF EXISTS "destinations_update_own" ON public.destinations;
DROP POLICY IF EXISTS "destinations_delete_own" ON public.destinations;

CREATE POLICY "destinations_select_team" ON public.destinations 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "destinations_insert_team" ON public.destinations 
  FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

CREATE POLICY "destinations_update_team" ON public.destinations 
  FOR UPDATE TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

CREATE POLICY "destinations_delete_team" ON public.destinations 
  FOR DELETE TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

-- PLAYLISTS: Allow editors to see and manage all playlists
DROP POLICY IF EXISTS "playlists_select_own" ON public.playlists;
DROP POLICY IF EXISTS "playlists_insert_own" ON public.playlists;
DROP POLICY IF EXISTS "playlists_update_own" ON public.playlists;
DROP POLICY IF EXISTS "playlists_delete_own" ON public.playlists;

CREATE POLICY "playlists_select_team" ON public.playlists 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "playlists_insert_team" ON public.playlists 
  FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

CREATE POLICY "playlists_update_team" ON public.playlists 
  FOR UPDATE TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

CREATE POLICY "playlists_delete_team" ON public.playlists 
  FOR DELETE TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

-- STREAMS: Allow editors to see and manage all streams
DROP POLICY IF EXISTS "streams_select_own" ON public.streams;
DROP POLICY IF EXISTS "streams_insert_own" ON public.streams;
DROP POLICY IF EXISTS "streams_update_own" ON public.streams;
DROP POLICY IF EXISTS "streams_delete_own" ON public.streams;

CREATE POLICY "streams_select_team" ON public.streams 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "streams_insert_team" ON public.streams 
  FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

CREATE POLICY "streams_update_team" ON public.streams 
  FOR UPDATE TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

CREATE POLICY "streams_delete_team" ON public.streams 
  FOR DELETE TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

-- SCHEDULED_EVENTS: Allow editors to see and manage all scheduled events
DROP POLICY IF EXISTS "events_select_own" ON public.scheduled_events;
DROP POLICY IF EXISTS "events_insert_own" ON public.scheduled_events;
DROP POLICY IF EXISTS "events_update_own" ON public.scheduled_events;
DROP POLICY IF EXISTS "events_delete_own" ON public.scheduled_events;

CREATE POLICY "events_select_team" ON public.scheduled_events 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "events_insert_team" ON public.scheduled_events 
  FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

CREATE POLICY "events_update_team" ON public.scheduled_events 
  FOR UPDATE TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );

CREATE POLICY "events_delete_team" ON public.scheduled_events 
  FOR DELETE TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
  );
