-- Migration 012: Phase 6 - Colonies Registry
-- Description: Creates the colonies table to track subagent instances

CREATE TABLE IF NOT EXISTS colonies (
  id TEXT PRIMARY KEY,
  niche TEXT NOT NULL,
  schema_name TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  policy_overrides JSONB
);
