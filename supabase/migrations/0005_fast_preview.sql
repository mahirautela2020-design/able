-- Fast PSI (PageSpeed Insights / Lighthouse) accessibility preview.
-- Runs in parallel with the main axe+Playwright pipeline via a separate
-- Inngest function with no shared concurrency lock, so it can never be
-- blocked behind (or itself block) a slow/stuck full audit. Stored in its
-- own column rather than folded into `progress` because `progress` writes
-- are a full-column replace (see updateAuditProgress) -- sharing it would
-- race between the two independently-running functions.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audits' AND column_name = 'fast_preview'
  ) THEN
    ALTER TABLE audits ADD COLUMN fast_preview jsonb;
  END IF;
END $$;
