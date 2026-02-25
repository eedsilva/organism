-- 007_telegram.sql
-- Seeds Telegram-related policy for the bot interface.
-- No new tables needed — notifications use the existing events table
-- with type = 'telegram_notify'.

INSERT INTO policies (key, value) VALUES
  ('telegram_enabled', 'false')   -- set to 'true' after bot is configured
ON CONFLICT (key) DO NOTHING;
