-- Data isolation + TTL hardening.
-- 1) Owner-scoping: audits carry created_by (the user who ran them) so
--    queries can filter to the requester. created_ip is recorded as an
--    additional layer for anonymous/legacy rows.
-- 2) Indexes for the retention cron (created_at) so cleanup is fast.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audits' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE audits ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audits' AND column_name = 'created_ip'
  ) THEN
    ALTER TABLE audits ADD COLUMN created_ip text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audits_created_by ON audits(created_by);
CREATE INDEX IF NOT EXISTS idx_audits_created_at ON audits(created_at);
CREATE INDEX IF NOT EXISTS idx_figma_connections_updated ON figma_connections(updated_at);
