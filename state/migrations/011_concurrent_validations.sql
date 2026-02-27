-- Migration 011: Phase 5 - Concurrent Validations
-- Description: Adds policy for max_concurrent_validations

INSERT INTO policies (key, value)
VALUES ('max_concurrent_validations', '3')
ON CONFLICT (key) DO NOTHING;
