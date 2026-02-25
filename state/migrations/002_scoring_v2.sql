-- 002_scoring_v2.sql
-- Adds persona scoring, competition detection, computed viability score,
-- and the graveyard table for failed opportunity categories.

-- Persona score: signals whether the poster is a buyer (operator w/ budget)
-- vs a venter (individual frustrated but not buying)
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS persona_score INT DEFAULT 0;

-- Competition score: how many known SaaS tools are mentioned in the post.
-- High competition = crowded space = lower viability.
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS competition_score INT DEFAULT 0;

-- Viability: the single number decide.ts will rank by.
-- Formula: (pain * 0.4) + (persona * 0.4) - (competition * 0.2), floored at 0.
-- Stored as a generated column so it stays in sync automatically.
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS viability_score INT GENERATED ALWAYS AS (
    GREATEST(0, FLOOR(
      (pain_score * 0.4) + (wtp_score * 0.4) - (competition_score * 0.2)
    )::int)
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_opportunities_viability
  ON opportunities(viability_score DESC);

-- Graveyard: categories that have failed 3+ times get a cooldown period.
-- Prevents the organism from wasting cycles re-evaluating dead ends.
CREATE TABLE IF NOT EXISTS graveyard (
  id SERIAL PRIMARY KEY,
  category TEXT UNIQUE NOT NULL,
  failed_count INT DEFAULT 1,
  cooldown_until TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed new policies introduced in v2
INSERT INTO policies (key, value) VALUES
  ('min_viability_score', '30'),
  ('reddit_enabled', 'true'),
  ('reddit_weight', '1.3'),
  ('hackernews_weight', '1.0'),
  ('max_active_builds', '1'),
  ('max_outreach_drafts_per_day', '3'),
  ('preorder_price_usd', '19'),
  ('zombie_kill_days', '5')
ON CONFLICT (key) DO NOTHING;