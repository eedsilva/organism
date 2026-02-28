-- Migration 014: Seeds replication-related policies for Phase 5 (self-replication engine).
-- Renamed from 008_replication to resolve migration numbering.
-- replication_log table was already created in migration 006.

INSERT INTO policies (key, value) VALUES
  ('replication_enabled',             'true'),
  ('replication_min_shipped',         '2'),
  ('replication_min_viability_avg',   '50')
ON CONFLICT (key) DO NOTHING;
