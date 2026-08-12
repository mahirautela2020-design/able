import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("enterprise RLS migration", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../supabase/migrations/0001_enterprise_rls.sql"),
    "utf-8"
  );

  it("creates org_memberships table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS org_memberships");
    expect(sql).toContain("role text NOT NULL CHECK");
    expect(sql).toContain("status text NOT NULL DEFAULT 'active'");
    expect(sql).toContain("UNIQUE (org_id, user_id)");
  });

  it("creates api_keys table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS api_keys");
    expect(sql).toContain("key_hash text NOT NULL UNIQUE");
    expect(sql).toContain("revoked_at timestamptz");
    expect(sql).toContain("expires_at timestamptz");
  });

  it("creates audit_log table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS audit_log");
    expect(sql).toContain("actor text NOT NULL");
    expect(sql).toContain("action text NOT NULL");
    expect(sql).toContain("target text NOT NULL");
    expect(sql).toContain("metadata jsonb NOT NULL DEFAULT '{}'");
  });

  it("enables RLS on all tables", () => {
    expect(sql).toContain("ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY");
  });

  it("adds org-scoped policies on audits table", () => {
    expect(sql).toContain("audits_org_select");
    expect(sql).toContain("org_id = (auth.jwt() ->> 'org_id')::uuid");
    expect(sql).toContain("audits_org_insert");
    expect(sql).toContain("audits_org_update");
    expect(sql).toContain("audits_org_delete");
  });

  it("adds org-scoped policies on findings via audit_id join", () => {
    expect(sql).toContain("findings_org_select");
    expect(sql).toMatch(/audit_id IN\s*\(\s*SELECT id FROM audits WHERE org_id/);
  });

  it("adds org-scoped policies on audit_pages via audit_id join", () => {
    expect(sql).toContain("audit_pages_org_select");
  });

  it("adds user-scoped policy on org_memberships", () => {
    expect(sql).toContain("org_memberships_select_own");
    expect(sql).toContain("user_id = auth.uid()");
  });

  it("adds org-scoped policies on api_keys", () => {
    expect(sql).toContain("api_keys_org_select");
  });

  it("adds org-scoped policies on audit_log", () => {
    expect(sql).toContain("audit_log_org_select");
    expect(sql).toContain("audit_log_org_insert");
  });

  it("adds org_id column to audits if missing", () => {
    expect(sql).toContain("ALTER TABLE audits ADD COLUMN org_id uuid");
  });

  it("all RLS policies default-deny (no `using (true)` patterns)", () => {
    const policyBlocks = sql.match(/CREATE POLICY[\s\S]*?;/g) || [];
    for (const block of policyBlocks) {
      expect(block).not.toMatch(/USING\s*\(\s*true\s*\)/i);
      expect(block).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
    }
  });
});
