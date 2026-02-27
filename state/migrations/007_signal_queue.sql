-- Migration 007: Phase 1 - Signal Queue and Leads Webhook
-- Description: Creates the foundation for reactive, event-driven architecture

-- 1. Create the signal_queue table
CREATE TABLE IF NOT EXISTS signal_queue (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Optimize fetching unprocessed signals
CREATE INDEX IF NOT EXISTS idx_signal_queue_unprocessed 
  ON signal_queue(processed, created_at) 
  WHERE processed = FALSE;

-- 2. Create the leads table (closing the feedback loop)
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  opportunity_id INT REFERENCES opportunities(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for quick lookups by opportunity
CREATE INDEX IF NOT EXISTS idx_leads_opportunity_id
  ON leads(opportunity_id);

-- Optional: If the organism_events type doesn't exist, PG handles LISTEN/NOTIFY dynamically, 
-- so we don't need a strict type definition for the notification channel here.
