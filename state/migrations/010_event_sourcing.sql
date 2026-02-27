-- Migration 010: Phase 4 - Event-Sourced State Machine
-- Description: Creates the opportunity_events append-only log and a view for the current state

CREATE TABLE IF NOT EXISTS opportunity_events (
  id SERIAL PRIMARY KEY,
  opportunity_id INT REFERENCES opportunities(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- e.g. 'status_change', 'plan_generated'
  old_status TEXT,
  new_status TEXT,
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunity_events_op_time ON opportunity_events(opportunity_id, created_at DESC);

-- View that materializes the current state from the event log
CREATE OR REPLACE VIEW opportunity_current_state AS
SELECT 
  o.id,
  o.source,
  o.title,
  o.evidence_url,
  o.raw_text,
  o.pain_score,
  o.wtp_score,
  o.competition_score,
  o.feasibility_score,
  o.viability_score,
  o.plan,
  o.created_at,
  COALESCE(
    (SELECT new_status FROM opportunity_events e 
     WHERE e.opportunity_id = o.id AND e.event_type = 'status_change' 
     ORDER BY e.created_at DESC LIMIT 1),
    o.status -- fallback to the static column for legacy records
  ) as status
FROM opportunities o;
