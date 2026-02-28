-- Migration 018: Pricing monitors for price shock detection
-- Stores monitored SaaS pricing page URLs and hash diff state

CREATE TABLE IF NOT EXISTS pricing_monitors (
  id SERIAL PRIMARY KEY,
  tool_name TEXT NOT NULL,
  pricing_url TEXT NOT NULL UNIQUE,
  niche TEXT NOT NULL,
  last_checked_at TIMESTAMP,
  last_hash TEXT,
  last_content TEXT,
  last_prices JSONB,
  change_detected_at TIMESTAMP,
  change_description TEXT,
  displacement_event_id TEXT REFERENCES displacement_events(id),
  monitoring_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_monitors_active ON pricing_monitors(monitoring_active) WHERE monitoring_active = TRUE;

-- Seed initial monitored tools (V4 doc Section 4)
INSERT INTO pricing_monitors (tool_name, pricing_url, niche) VALUES
  ('Zapier', 'https://zapier.com/pricing', 'automation'),
  ('Monday', 'https://monday.com/pricing', 'project-management'),
  ('Airtable', 'https://airtable.com/pricing', 'database'),
  ('Notion', 'https://www.notion.so/pricing', 'productivity'),
  ('Klaviyo', 'https://www.klaviyo.com/pricing', 'ecommerce-email'),
  ('Gorgias', 'https://www.gorgias.com/pricing', 'ecommerce-support'),
  ('ReCharge', 'https://rechargepayments.com/pricing/', 'ecommerce-subscriptions'),
  ('ConnectWise', 'https://www.connectwise.com/pricing', 'msp'),
  ('Autotask', 'https://www.datto.com/products/autotask', 'msp'),
  ('ServiceTitan', 'https://www.servicetitan.com/pricing', 'field-service'),
  ('Jobber', 'https://getjobber.com/pricing/', 'field-service'),
  ('FreshBooks', 'https://www.freshbooks.com/pricing', 'accounting'),
  ('QuickBooks', 'https://quickbooks.intuit.com/pricing/', 'accounting'),
  ('Xero', 'https://www.xero.com/us/pricing/', 'accounting'),
  ('Clio', 'https://www.clio.com/pricing/', 'legal'),
  ('PracticePanther', 'https://www.practicepanther.com/pricing/', 'legal'),
  ('HubSpot', 'https://www.hubspot.com/pricing', 'crm'),
  ('Pipedrive', 'https://www.pipedrive.com/en/pricing', 'crm'),
  ('Intercom', 'https://www.intercom.com/pricing', 'customer-success'),
  ('Zendesk', 'https://www.zendesk.com/pricing/', 'support')
ON CONFLICT (pricing_url) DO NOTHING;
