-- 003_preorder_flow.sql
-- Supports preorder-first build flow.
-- Adds 'killed' and 'shipped' opportunity statuses (no schema change needed,
-- status is TEXT). Adds preorder tracking index and new policies.

-- Index for preorder window checks (runs every cycle)
CREATE INDEX IF NOT EXISTS idx_reach_log_channel_status
  ON reach_log(channel, status, created_at);

-- Index for shipped/killed status queries
CREATE INDEX IF NOT EXISTS idx_opportunities_status_created
  ON opportunities(status, created_at);

-- New policies for preorder flow
INSERT INTO policies (key, value) VALUES
  ('preorder_window_hours', '48'),
  ('preorder_price_usd', '19'),
  ('max_active_builds', '1')
ON CONFLICT (key) DO NOTHING;