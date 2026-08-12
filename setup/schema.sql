-- Able schema — run in Supabase SQL Editor (your free project)
-- RLS: all tables enabled, ZERO policies = deny-all to anon. The API layer
-- uses the service role; future SSO/RBAC becomes a middleware concern.

-- queue schema note: not needed here — Inngest is the queue (cloud), not pg-boss.

CREATE TABLE IF NOT EXISTS audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  created_by uuid,
  target_url text NOT NULL,
  platform text NOT NULL DEFAULT 'web',
  code_repo text,
  status text NOT NULL DEFAULT 'queued',
  config jsonb NOT NULL DEFAULT '{}',
  progress jsonb NOT NULL DEFAULT '{}',
  report_path text,
  error_code text,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  page_url text NOT NULL,
  page_title text,
  platform text NOT NULL DEFAULT 'web',
  status text NOT NULL DEFAULT 'pending',
  wcag_score numeric,
  axe_version text,
  consent_dismissed boolean,
  settled_at_ms int,
  networkidle_timed_out boolean,
  error_code text,
  evidence jsonb NOT NULL DEFAULT '{}',
  scanned_at timestamptz
);

CREATE TABLE IF NOT EXISTS findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  page_id uuid REFERENCES audit_pages(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  rule_id text NOT NULL,
  rule_title text,
  wcag_criteria text[],
  wcag_criterion text,
  wcag_level text,
  principle text,
  severity text,
  confidence numeric NOT NULL,
  source_engines text[] NOT NULL,
  selector text,
  element_html text,
  failure_summary text,
  additional_instances int NOT NULL DEFAULT 0,
  screenshot_crop_url text,
  full_screenshot_url text,
  recommendation text,
  evidence jsonb NOT NULL DEFAULT '{}',
  engine_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_findings_audit ON findings(audit_id);
CREATE INDEX IF NOT EXISTS idx_findings_sc ON findings(wcag_criterion);
CREATE INDEX IF NOT EXISTS idx_pages_audit ON audit_pages(audit_id);

CREATE TABLE IF NOT EXISTS mobile_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  platform text NOT NULL,
  apk_path text,
  bundle_id text,
  min_sdk text,
  target_sdk text,
  permissions text[],
  activities text[],
  services text[],
  manifest_json jsonb NOT NULL DEFAULT '{}',
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS code_repos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  repo_url text NOT NULL,
  clone_path text,
  branch text,
  commit_sha text,
  status text NOT NULL DEFAULT 'pending',
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mobile_artifacts_audit ON mobile_artifacts(audit_id);
CREATE INDEX IF NOT EXISTS idx_code_repos_audit ON code_repos(audit_id);

-- RLS: enable on all, add NO policies (deny-all to anon/public)
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_repos ENABLE ROW LEVEL SECURITY;
