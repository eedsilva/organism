-- =========================
-- ORGANISM CORE TABLES
-- =========================

-- 1️⃣ Identity & Genesis
CREATE TABLE IF NOT EXISTS organism_meta (
  id SERIAL PRIMARY KEY,
  genesis_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO organism_meta (genesis_date)
SELECT '2026-02-25'
WHERE NOT EXISTS (SELECT 1 FROM organism_meta);


-- 2️⃣ Heartbeat cycles
CREATE TABLE IF NOT EXISTS cycles (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  status TEXT,
  notes TEXT,
  inference_cost_usd NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);


-- 3️⃣ Events (logging memory)
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);


-- 4️⃣ Opportunities
-- viability_score is computed: pain + wtp - competition (capped at 100)
CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY,
  source TEXT,
  title TEXT,
  evidence_url TEXT UNIQUE,
  raw_text TEXT,
  pain_score INT DEFAULT 0,
  wtp_score INT DEFAULT 0,
  competition_score INT DEFAULT 0,
  feasibility_score INT DEFAULT 0,
  viability_score INT GENERATED ALWAYS AS (
    LEAST(100, GREATEST(0, pain_score + wtp_score - competition_score))
  ) STORED,
  plan TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_viability ON opportunities(viability_score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_pain ON opportunities(pain_score DESC);


-- 5️⃣ Actions taken
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


-- 6️⃣ Metrics (fitness tracking)
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


-- 7️⃣ Policy store (self-modifying parameters)
CREATE TABLE IF NOT EXISTS policies (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed all required policy keys
INSERT INTO policies (key, value) VALUES
  -- Core budget & heartbeat
  ('daily_budget_usd',            '5'),
  ('daily_cloud_budget_usd',      '2'),
  ('heartbeat_interval_ms',       '60000'),

  -- Opportunity scoring thresholds
  ('min_pain_score',              '20'),
  ('min_plan_score',              '40'),
  ('min_viability_score',         '30'),
  ('max_opportunities_per_cycle', '3'),
  ('max_concurrent_validations',  '3'),

  -- Source trust weights (used by decide.ts + reflect.ts)
  ('hackernews_weight',           '1.0'),
  ('reddit_weight',               '1.3'),

  -- Outreach & lifecycle controls
  ('max_outreach_drafts_per_day', '3'),
  ('preorder_window_hours',       '48'),
  ('zombie_kill_days',            '5')
ON CONFLICT (key) DO NOTHING;


-- 8️⃣ Reach log (outbound marketing actions)
CREATE TABLE IF NOT EXISTS reach_log (
  id SERIAL PRIMARY KEY,
  opportunity_id INT REFERENCES opportunities(id),
  channel TEXT,        -- 'hn_comment', 'reddit_post', 'preorder', etc.
  content TEXT,
  url TEXT,
  status TEXT DEFAULT 'drafted',   -- drafted → posted → responded | expired | converted
  created_at TIMESTAMP DEFAULT NOW()
);


-- 9️⃣ Reflection log (weekly self-assessment history)
CREATE TABLE IF NOT EXISTS reflection_log (
  id SERIAL PRIMARY KEY,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  context JSONB,
  result JSONB,
  revenue_assessment TEXT,  -- thriving | surviving | struggling | dying
  created_at TIMESTAMP DEFAULT NOW()
);


-- 🔟 Self-improvement proposals (evolve.ts outputs, human-validated)
CREATE TABLE IF NOT EXISTS proposals (
  id SERIAL PRIMARY KEY,
  file_path TEXT NOT NULL,
  current_code TEXT,
  proposed_code TEXT,
  rationale TEXT,
  expected_impact TEXT,
  status TEXT DEFAULT 'pending',  -- pending | approved | rejected | applied
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP
);


-- 1️⃣1️⃣ Replication log (colony spawning)
CREATE TABLE IF NOT EXISTS replication_log (
  id SERIAL PRIMARY KEY,
  child_niche TEXT,
  child_path TEXT,
  status TEXT DEFAULT 'pending',  -- pending | approved | spawned | failed
  spec JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);