-- Migration 009: Phase 6 Sensing Improvements

-- pg_trgm for deduplication by title similarity
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- New opportunity fields
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS seen_count INT DEFAULT 1;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS operator_rating TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS competition_score INT DEFAULT 0;

-- Index for fast title similarity spacing
CREATE INDEX IF NOT EXISTS idx_opportunities_title_trgm ON opportunities USING gin (title gin_trgm_ops);

-- New policies
INSERT INTO policies (key, value) VALUES
  ('sensing_interval_hours', '6'),
  ('cross_signal_boost',     '1.5'),
  ('min_pain_score_ingest',  '40')
ON CONFLICT (key) DO NOTHING;
