-- Migration 015: Fix replication_log schema for replicate.ts
-- replicate.ts inserts spec_id and source_opportunity_id which were missing from the table.
-- Also adds colonies performance tracking referenced in strategic docs.

ALTER TABLE replication_log 
  ADD COLUMN IF NOT EXISTS spec_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS source_opportunity_id INT REFERENCES opportunities(id);

ALTER TABLE colonies
  ADD COLUMN IF NOT EXISTS total_leads INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_revenue_usd NUMERIC DEFAULT 0;
