-- Migration 020: Tool deployments for free tools built from displacement events

CREATE TABLE IF NOT EXISTS tool_deployments (
  id SERIAL PRIMARY KEY,
  displacement_event_id TEXT REFERENCES displacement_events(id),
  archetype TEXT NOT NULL CHECK (archetype IN ('VALIDATOR', 'COST_ESTIMATOR', 'MIGRATION_COMPARATOR', 'RISK_SCANNER', 'DIFF_ANALYZER')),
  tool_name TEXT NOT NULL,
  tool_spec JSONB NOT NULL,
  data_dependency_level TEXT DEFAULT 'none',
  vercel_project_id TEXT,
  live_url TEXT,
  deployed_at TIMESTAMP,
  activated_users INT DEFAULT 0,
  emails_captured INT DEFAULT 0,
  business_domain_emails INT DEFAULT 0,
  status TEXT DEFAULT 'building',
  created_at TIMESTAMP DEFAULT NOW()
);
