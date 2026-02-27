-- Migration 008: Phase 3 - LLM Job Queue
-- Description: Unblocks the main thread by introducing an async job queue for LLM calls

CREATE TABLE IF NOT EXISTS llm_jobs (
  id SERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,       -- 'score', 'plan', 'build', 'reflect'
  input JSONB NOT NULL,
  output JSONB,
  model TEXT,
  status TEXT DEFAULT 'pending', -- pending | running | done | failed
  cost_usd NUMERIC,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_jobs_status 
  ON llm_jobs(status, created_at) 
  WHERE status = 'pending';
