-- Migration 017: Displacement events table for V4 Revenue Interception Engine
-- Tracks events where B2B software spend is about to move (price shock, acquisition, etc.)

CREATE TABLE IF NOT EXISTS displacement_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('PRICE_SHOCK', 'ACQUISITION_KILL', 'FEATURE_REMOVAL', 'MARKET_GAP')),
  product_or_role TEXT NOT NULL,
  affected_persona_niche TEXT,
  affected_persona_title TEXT,
  estimated_affected INT,
  evidence JSONB DEFAULT '[]',
  spend_proof_score NUMERIC DEFAULT 0 CHECK (spend_proof_score >= 0 AND spend_proof_score <= 1),
  displacement_strength NUMERIC DEFAULT 0 CHECK (displacement_strength >= 0 AND displacement_strength <= 1),
  window_urgency NUMERIC DEFAULT 1.0 CHECK (window_urgency >= 0 AND window_urgency <= 1),
  churn_intent_confirmed BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'detected' CHECK (status IN ('detected', 'validating', 'active', 'expired', 'suppressed')),
  opportunity_ids INT[] DEFAULT '{}',
  detected_at TIMESTAMP DEFAULT NOW(),
  window_opens_at TIMESTAMP DEFAULT NOW(),
  window_closes_at TIMESTAMP,
  viability_score NUMERIC,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_displacement_events_status ON displacement_events(status);
CREATE INDEX IF NOT EXISTS idx_displacement_events_type ON displacement_events(type);
CREATE INDEX IF NOT EXISTS idx_displacement_events_detected_at ON displacement_events(detected_at DESC);
