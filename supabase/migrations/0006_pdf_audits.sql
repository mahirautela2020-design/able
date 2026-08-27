-- PDF audits: adds no new tables — a PDF audit reuses `audits` (platform
-- discriminator + config jsonb for document facts) and the shared `findings`
-- table, exactly like a URL audit. The only real gap: `platform` has been
-- declared in setup/schema.sql's CREATE TABLE for a while, but that only
-- applies to a *fresh* table — it was never backfilled onto the live table
-- via ALTER, so `audits.platform` doesn't actually exist in production yet.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audits' AND column_name = 'platform'
  ) THEN
    ALTER TABLE audits ADD COLUMN platform text NOT NULL DEFAULT 'web';
  END IF;
END $$;
