-- Migration 019: Buyer Atlas — structured map of where B2B buyers congregate
-- Pre-populated before displacement events fire for 96-hour distribution

CREATE TABLE IF NOT EXISTS buyer_communities (
  id SERIAL PRIMARY KEY,
  niche TEXT NOT NULL,
  buyer_title TEXT,
  platform TEXT NOT NULL,
  community_url TEXT NOT NULL UNIQUE,
  community_name TEXT NOT NULL,
  member_count INT,
  self_promo_tolerance NUMERIC DEFAULT 0.5,
  link_policy TEXT DEFAULT 'limited',
  required_reputation TEXT DEFAULT 'none',
  mod_risk TEXT DEFAULT 'medium',
  posting_requires_approval BOOLEAN DEFAULT FALSE,
  estimated_time_to_post_min INT DEFAULT 30,
  estimated_removal_rate NUMERIC DEFAULT 0.3,
  estimated_response_velocity_hr INT,
  last_displacement_thread_at TIMESTAMP,
  active_thread_url TEXT,
  activation_score NUMERIC DEFAULT 0,
  posts_sent INT DEFAULT 0,
  leads_generated INT DEFAULT 0,
  activated_users INT DEFAULT 0,
  conversion_rate NUMERIC DEFAULT 0,
  last_posted_at TIMESTAMP,
  effectiveness_score NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS community_targeting (
  id SERIAL PRIMARY KEY,
  displacement_event_id TEXT NOT NULL REFERENCES displacement_events(id),
  community_id INT REFERENCES buyer_communities(id),
  priority_rank INT,
  activation_status TEXT DEFAULT 'identified',
  post_url TEXT,
  leads_from_post INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_activation_checks (
  id SERIAL PRIMARY KEY,
  community_id INT REFERENCES buyer_communities(id),
  displacement_event_id TEXT NOT NULL,
  has_active_thread BOOLEAN DEFAULT FALSE,
  thread_url TEXT,
  thread_comment_count INT DEFAULT 0,
  thread_sentiment TEXT,
  activation_score NUMERIC DEFAULT 0,
  checked_at TIMESTAMP DEFAULT NOW()
);

-- Seed MSP communities (sample — expand to 30)
INSERT INTO buyer_communities (niche, buyer_title, platform, community_url, community_name, member_count, self_promo_tolerance, link_policy, mod_risk) VALUES
  ('managed service providers', 'MSP Owner', 'reddit', 'https://reddit.com/r/msp', 'r/msp', 180000, 0.5, 'limited', 'medium'),
  ('managed service providers', 'IT Director', 'reddit', 'https://reddit.com/r/sysadmin', 'r/sysadmin', 700000, 0.3, 'limited', 'high'),
  ('managed service providers', 'Tech Support', 'reddit', 'https://reddit.com/r/techsupport', 'r/techsupport', 500000, 0.2, 'banned', 'high'),
  ('managed service providers', 'MSP Owner', 'linkedin', 'https://linkedin.com/groups/msp', 'MSP Professionals', 10000, 0.6, 'limited', 'low'),
  ('managed service providers', 'MSP Owner', 'facebook', 'https://facebook.com/groups/msp', 'MSP Business Owners', 5000, 0.6, 'limited', 'medium')
ON CONFLICT (community_url) DO NOTHING;

-- Seed accounting/bookkeeping communities (sample — expand to 30)
INSERT INTO buyer_communities (niche, buyer_title, platform, community_url, community_name, member_count, self_promo_tolerance, link_policy, mod_risk) VALUES
  ('accounting', 'Bookkeeper', 'reddit', 'https://reddit.com/r/Bookkeeping', 'r/Bookkeeping', 50000, 0.7, 'limited', 'low'),
  ('accounting', 'Accountant', 'reddit', 'https://reddit.com/r/accounting', 'r/accounting', 200000, 0.4, 'limited', 'medium'),
  ('accounting', 'Tax Pro', 'reddit', 'https://reddit.com/r/taxpro', 'r/taxpro', 30000, 0.5, 'limited', 'low'),
  ('accounting', 'Bookkeeper', 'facebook', 'https://facebook.com/groups/bookkeepers', 'Bookkeepers of America', 45000, 0.7, 'limited', 'low'),
  ('accounting', 'Accountant', 'facebook', 'https://facebook.com/groups/accountingnetwork', 'Accounting & Bookkeeping Network', 20000, 0.6, 'limited', 'medium')
ON CONFLICT (community_url) DO NOTHING;

-- Seed legal admin communities (sample — expand to 20)
INSERT INTO buyer_communities (niche, buyer_title, platform, community_url, community_name, member_count, self_promo_tolerance, link_policy, mod_risk) VALUES
  ('legal', 'Legal Admin', 'reddit', 'https://reddit.com/r/law', 'r/law', 150000, 0.3, 'limited', 'high'),
  ('legal', 'Legal Professional', 'facebook', 'https://facebook.com/groups/legalpros', 'Legal Professionals Network', 15000, 0.5, 'limited', 'medium'),
  ('legal', 'Legal Admin', 'linkedin', 'https://linkedin.com/groups/legaladmins', 'Legal Administrators Association', 8000, 0.6, 'limited', 'low')
ON CONFLICT (community_url) DO NOTHING;
