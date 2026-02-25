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
-- FIX: Added UNIQUE constraint on evidence_url so ON CONFLICT works
CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY,
  source TEXT,
  title TEXT,
  evidence_url TEXT UNIQUE,          -- ← FIXED: was missing, broke ON CONFLICT
  raw_text TEXT,                     -- ← NEW: store full post/comment for LLM
  pain_score INT DEFAULT 0,
  wtp_score INT DEFAULT 0,
  feasibility_score INT DEFAULT 0,
  plan TEXT,                         -- ← NEW: store the generated plan
  status TEXT DEFAULT 'new',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
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

-- Seed default policies
INSERT INTO policies (key, value) VALUES
  ('daily_budget_usd', '5'),
  ('min_pain_score', '20'),
  ('min_plan_score', '40'),
  ('heartbeat_interval_ms', '60000'),
  ('max_opportunities_per_cycle', '3')
ON CONFLICT (key) DO NOTHING;


-- 8️⃣ Reach log (outbound marketing actions)
-- NEW: tracks every attempt to reach a human
CREATE TABLE IF NOT EXISTS reach_log (
  id SERIAL PRIMARY KEY,
  opportunity_id INT REFERENCES opportunities(id),
  channel TEXT,        -- 'hn_comment', 'reddit_post', 'email', etc.
  content TEXT,
  url TEXT,
  status TEXT DEFAULT 'drafted',   -- drafted → posted → responded
  created_at TIMESTAMP DEFAULT NOW()
);