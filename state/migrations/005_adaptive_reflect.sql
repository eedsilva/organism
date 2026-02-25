-- 005_adaptive_reflect.sql
-- Supports adaptive reflection intervals.

-- Update policies with adaptive defaults
INSERT INTO policies (key, value) VALUES
  ('reflection_interval_days', '1'),
  ('last_revenue_assessment', '"unknown"')
ON CONFLICT (key) DO NOTHING;