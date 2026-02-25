-- 001_baseline.sql
-- Baseline schema — mirrors state/schema.sql exactly.
-- This is migration 001 so all future changes are tracked as diffs.

CREATE TABLE IF NOT EXISTS organism_meta (
  id SERIAL PRIMARY KEY,
  genesis_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO organism_meta (genesis_date)
SELECT '2026-02-25'
WHERE NOT EXISTS (SELECT 1 FROM organism_meta);

CREATE TABLE IF NOT EXISTS cycles (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  status TEXT,
  notes TEXT,
  inference_cost_usd NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY,
  source TEXT,
  title TEXT,
  evidence_url TEXT UNIQUE,
  raw_text TEXT,
  pain_score INT DEFAULT 0,
  wtp_score INT DEFAULT 0,
  feasibility_score INT DEFAULT 0,
  plan TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_pain ON opportunities(pain_score DESC);

CREATE TABLE IF NOT EXISTS actions (
  id SERIAL PRIMARY KEY,
  cycle_id INT REFERENCES cycles(id) ON DELETE CASCADE,
  opportunity_id INT REFERENCES opportunities(id),
  type TEXT,
  status TEXT,
  result JSONB,
  inference_cost_usd NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metrics_daily (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  visits INT DEFAULT 0,
  signups INT DEFAULT 0,
  payments INT DEFAULT 0,
  revenue_usd NUMERIC DEFAULT 0,
  inference_cost_usd NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policies (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO policies (key, value) VALUES
  ('daily_budget_usd', '5'),
  ('min_pain_score', '20'),
  ('min_plan_score', '40'),
  ('heartbeat_interval_ms', '60000'),
  ('max_opportunities_per_cycle', '3')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS reach_log (
  id SERIAL PRIMARY KEY,
  opportunity_id INT REFERENCES opportunities(id),
  channel TEXT,
  content TEXT,
  url TEXT,
  status TEXT DEFAULT 'drafted',
  created_at TIMESTAMP DEFAULT NOW()
);