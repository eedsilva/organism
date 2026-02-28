-- Migration 024: V4 policy seeds

INSERT INTO policies (key, value) VALUES
  ('operator_hours_30d', '0'),
  ('min_displacement_viability', '0.15'),
  ('max_concurrent_displacements', '3'),
  ('window_urgency_price_shock_days', '30'),
  ('window_urgency_acquisition_days', '180'),
  ('churn_intent_validation_hours', '72'),
  ('thesis_kill_check_interval_days', '7'),
  ('trusted_identity_min_age_days', '45')
ON CONFLICT (key) DO NOTHING;
