-- 004_reflect.sql
-- Adds reflection log table and reflection-related policies.

CREATE TABLE IF NOT EXISTS reflection_log (
  id SERIAL PRIMARY KEY,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  context JSONB,
  result JSONB,
  revenue_assessment TEXT,  -- thriving|surviving|struggling|dying
  created_at TIMESTAMP DEFAULT NOW()
);

-- Source weights live in policies — seeded here with defaults
-- reflect.ts will update these based on actual performance
INSERT INTO policies (key, value) VALUES
  ('hackernews_weight',          '1.0'),
  ('reddit_weight',              '1.3'),
  ('github_weight',              '0.7'),
  ('reflection_interval_days',   '7'),
  ('sensing_mode',               '"normal"')   -- normal|wide|narrow
ON CONFLICT (key) DO NOTHING;