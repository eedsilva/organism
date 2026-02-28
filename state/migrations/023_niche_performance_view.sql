-- Migration 023: Niche performance materialized view for V4 reflection

CREATE MATERIALIZED VIEW IF NOT EXISTS niche_performance AS
SELECT
  bc.niche,
  COUNT(DISTINCT bc.id) as communities_mapped,
  COALESCE(SUM(bc.leads_generated), 0)::bigint as total_leads,
  COALESCE(SUM(bc.activated_users), 0)::bigint as activated_users,
  AVG(bc.effectiveness_score) as avg_effectiveness
FROM buyer_communities bc
GROUP BY bc.niche;

-- Refresh via: REFRESH MATERIALIZED VIEW CONCURRENTLY niche_performance;
-- (Requires UNIQUE index for CONCURRENTLY — add if needed)
