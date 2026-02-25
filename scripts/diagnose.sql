-- Run these to understand where ideas die

-- 1. Viability distribution of the 142 stuck in 'new'
SELECT
  CASE
    WHEN viability_score = 0  THEN '0 (no signal)'
    WHEN viability_score < 10 THEN '1-9'
    WHEN viability_score < 20 THEN '10-19'
    WHEN viability_score < 30 THEN '20-29'
    WHEN viability_score < 40 THEN '30-39'
    WHEN viability_score < 50 THEN '40-49'
    ELSE '50+'
  END as viability_bucket,
  COUNT(*) as count
FROM opportunities
WHERE status = 'new'
GROUP BY viability_bucket
ORDER BY viability_bucket;

-- 2. What does a real plan response look like?
-- (Shows raw LLM output for the 2 ideas that scored well)
SELECT
  title,
  LEFT(plan, 500) as plan_preview
FROM opportunities
WHERE status IN ('pursue', 'building')
LIMIT 5;

-- 3. Parse failure events
SELECT
  payload->>'extracted_score' as extracted_score,
  payload->>'raw_preview' as raw_preview
FROM events
WHERE type = 'plan_parse_fail'
ORDER BY created_at DESC
LIMIT 5;

-- 4. Source breakdown of the 142 new
SELECT source, COUNT(*) as count, 
       ROUND(AVG(viability_score)) as avg_viability
FROM opportunities
WHERE status = 'new'
GROUP BY source
ORDER BY count DESC;