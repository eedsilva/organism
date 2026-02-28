-- Migration 022: Active thesis — falsifiable, versioned, executable

CREATE TABLE IF NOT EXISTS theses (
  id SERIAL PRIMARY KEY,
  thesis_version INT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'retired')),
  target_segment TEXT NOT NULL,
  displacement_focus TEXT[] DEFAULT '{}',
  buyer_titles TEXT[] DEFAULT '{}',
  hypothesis TEXT NOT NULL,
  success_criteria JSONB NOT NULL,
  kill_signals JSONB NOT NULL,
  starts_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  day_45_review_at TIMESTAMP,
  performance_snapshot JSONB,
  previous_thesis_id INT REFERENCES theses(id),
  reason_for_revision TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  activated_at TIMESTAMP,
  retired_at TIMESTAMP,
  retirement_reason TEXT
);
