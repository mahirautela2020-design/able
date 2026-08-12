-- Mobile artifacts (APK/iOS uploads) + code repos — from setup/schema.sql,
-- promoted to a versioned migration so the remote DB matches local.

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
  branch text,
  commit_sha text,
  findings_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: service role bypasses; authenticated users see their org's rows via
-- the audit_id join (consistent with findings/audit_pages policies).
ALTER TABLE mobile_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_repos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mobile_artifacts_org_select" ON mobile_artifacts
  FOR SELECT
  USING (
    audit_id IN (SELECT id FROM audits WHERE org_id = (auth.jwt() ->> 'org_id')::uuid)
  );

CREATE POLICY "code_repos_org_select" ON code_repos
  FOR SELECT
  USING (
    audit_id IN (SELECT id FROM audits WHERE org_id = (auth.jwt() ->> 'org_id')::uuid)
  );
