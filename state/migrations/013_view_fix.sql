-- Migration 013: Fix opportunity_current_state view to include all opportunity columns
-- The view was missing seen_count and operator_rating added in 009, causing getIdeas() to fail
-- Must DROP and CREATE because adding columns in the middle changes column positions

DROP VIEW IF EXISTS opportunity_current_state;

CREATE VIEW opportunity_current_state AS
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
  o.seen_count,
  o.operator_rating,
  o.created_at,
  COALESCE(
    (SELECT oe.new_status 
     FROM opportunity_events oe 
     WHERE oe.opportunity_id = o.id 
       AND oe.event_type = 'status_change' 
     ORDER BY oe.created_at DESC LIMIT 1),
    o.status
  ) as status
FROM opportunities o;
