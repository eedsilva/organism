-- Migration 025: Add source to displacement_events for God Pipe vs Sensor Pipe distinction

ALTER TABLE displacement_events
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'sensor' CHECK (source IN ('sensor', 'god'));

CREATE INDEX IF NOT EXISTS idx_displacement_events_source ON displacement_events(source);
