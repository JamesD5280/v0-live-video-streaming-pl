-- Add event_overlays junction table for scheduled events
CREATE TABLE IF NOT EXISTS event_overlays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES scheduled_events(id) ON DELETE CASCADE,
  overlay_id UUID NOT NULL REFERENCES overlays(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE event_overlays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_overlay_select" ON event_overlays FOR SELECT
  USING (event_id IN (SELECT id FROM scheduled_events WHERE user_id = auth.uid()));

CREATE POLICY "event_overlay_insert" ON event_overlays FOR INSERT
  WITH CHECK (event_id IN (SELECT id FROM scheduled_events WHERE user_id = auth.uid()));

CREATE POLICY "event_overlay_delete" ON event_overlays FOR DELETE
  USING (event_id IN (SELECT id FROM scheduled_events WHERE user_id = auth.uid()));
