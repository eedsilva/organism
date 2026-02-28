-- Migration 021: Trust identity system for distribution
-- Builds distribution infrastructure before it is needed

CREATE TABLE IF NOT EXISTS trust_identities (
  id SERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  auth_file TEXT NOT NULL,
  community_ids INT[] DEFAULT '{}',
  account_age_days INT DEFAULT 0,
  karma_score INT DEFAULT 0,
  trust_level TEXT DEFAULT 'new' CHECK (trust_level IN ('new', 'building', 'trusted', 'authoritative')),
  warmup_complete BOOLEAN DEFAULT FALSE,
  warmup_complete_at TIMESTAMP,
  last_active_at TIMESTAMP,
  posts_sent INT DEFAULT 0,
  posts_removed INT DEFAULT 0,
  removal_rate NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity_activity_log (
  id SERIAL PRIMARY KEY,
  identity_id INT REFERENCES trust_identities(id),
  community_id INT REFERENCES buyer_communities(id),
  activity_type TEXT,
  content_preview TEXT,
  url TEXT,
  received_upvotes INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
