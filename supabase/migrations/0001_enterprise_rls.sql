-- P6 Enterprise RLS migration
-- Org-scoped row-level security policies for multi-tenant data isolation
-- Requires: org_memberships + api_keys + audit_log tables created first
--
-- ORDER MATTERS: org_id must exist on the audits table BEFORE any policy
-- references it (policies fail on missing columns). The ADD COLUMN block
-- therefore runs first.

-- Add org_id column to existing tables (if not already present)
-- Safe to run: uses IF NOT EXISTS pattern
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audits' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE audits ADD COLUMN org_id uuid;
  END IF;
END $$;

-- Org memberships table (tracks user membership in organizations)
CREATE TABLE IF NOT EXISTS org_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'auditor', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

-- API keys table (hashed keys for MCP/programmatic access)
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  created_by uuid NOT NULL,
  name text NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'auditor', 'viewer')),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit log table (append-only, records every enterprise API call)
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  action text NOT NULL,
  target text NOT NULL,
  org_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON org_memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audits_org ON audits(org_id);

-- Enable RLS on new tables
ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for org_memberships (deny-all by default)
-- Service role bypasses all RLS; these policies apply to authenticated users

-- RLS policies for audits table: org-scoped
-- Default-deny: if org_id claim is missing, user sees nothing
CREATE POLICY "audits_org_select" ON audits
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "audits_org_insert" ON audits
  FOR INSERT
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "audits_org_update" ON audits
  FOR UPDATE
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "audits_org_delete" ON audits
  FOR DELETE
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- RLS policies for findings table: org-scoped via audit_id join
CREATE POLICY "findings_org_select" ON findings
  FOR SELECT
  USING (
    audit_id IN (
      SELECT id FROM audits WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

-- RLS policies for audit_pages table: org-scoped via audit_id join
CREATE POLICY "audit_pages_org_select" ON audit_pages
  FOR SELECT
  USING (
    audit_id IN (
      SELECT id FROM audits WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

-- RLS policies for org_memberships: users can see their own memberships
CREATE POLICY "org_memberships_select_own" ON org_memberships
  FOR SELECT
  USING (user_id = auth.uid());

-- RLS policies for api_keys: org-scoped
CREATE POLICY "api_keys_org_select" ON api_keys
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- RLS policies for audit_log: org-scoped
CREATE POLICY "audit_log_org_select" ON audit_log
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "audit_log_org_insert" ON audit_log
  FOR INSERT
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);
