# P6 — Enterprise Shell: Task Checklist

Phase: P6 (Enterprise shell) | Spec: ENTERPRISE_SPEC.md §11 | Branch: `phase/p6-enterprise`
Verify gates (ORCHESTRATOR §4): API auth/RBAC unit tests; MCP wrapper smoke.

## Tasks

1. **Enterprise API routes scaffold** — create `src/app/api/enterprise/*` route
   handlers under Next.js 16 App Router. Add a `requireEnterpriseAuth()`
   middleware helper in `src/lib/enterprise/auth.ts` that validates the
   Supabase session + org membership before any handler runs. Maps to
   ENTERPRISE_SPEC §11.1 (auth boundary). Test: `__tests__/enterprise/auth.spec.ts`
   (valid session → 200; no session → 401; wrong org → 403).

2. **RBAC roles + permissions** — define `org_roles` enum
   (`owner|admin|auditor|viewer`) and a `hasPermission(role, action)` helper in
   `src/lib/enterprise/rbac.ts`. Wire into the auth middleware so each endpoint
   declares required permission (e.g. `audit:write`, `report:read`). Maps to
   ENTERPRISE_SPEC §11.2. Tests: `__tests__/enterprise/rbac.spec.ts` covers each
   role × action matrix; denies by default.

3. **Supabase RLS policies for org-scoped tables** — add migration
   `supabase/migrations/XXXX_enterprise_rls.sql` enforcing `org_id = auth.jwt() ->> 'org_id'`
   on `audits`, `findings`, `reports`, `evidence_files`. Default-deny if claim
   missing. Maps to ENTERPRISE_SPEC §2 (RLS deny-all). Test: fixture in
   `__tests__/enterprise/rls.fixture.sql` + unit test asserting deny on cross-org
   select.

4. **MCP wrapper** — create `src/lib/mcp/wrapper.ts` exposing a thin, typed
   façade over the internal audit functions (startAudit, getFindings, exportReport)
   for external MCP clients. No new findings created here — wrapper only invokes
   existing LLM-free pipelines (ENTERPRISE_SPEC §2). Smoke test:
   `__tests__/mcp/wrapper.smoke.ts` calls each method with stubbed deps and
   asserts shape + that no LLM path is invoked.

5. **API key auth path** — add `src/lib/enterprise/apikeys.ts` issuing hashed
   Supabase-stored API keys per org for MCP/programmatic access. Revocation +
   rotation endpoints under `src/app/api/enterprise/keys/route.ts`. Tests:
   `__tests__/enterprise/apikeys.spec.ts` (issue, verify, revoke, expire).

6. **Rate limiting + audit log** — middleware in `src/lib/enterprise/ratelimit.ts`
   (per-key token bucket, default 60 req/min) and append-only `audit_log` table
   recording every enterprise API call (actor, action, target, ts). Tests:
   `__tests__/enterprise/ratelimit.spec.ts` + `auditlog.spec.ts`.

7. **Wire verify gates** — add `npm run verify:enterprise` script =
   `jest __tests__/enterprise __tests__/mcp` and include in `package.json` `verify`
   chain. Ensure `npm run verify` stays green.

8. **Docs stub** — add `docs/enterprise-api.md` (≤40 lines) listing endpoints,
   auth schemes, RBAC matrix, and the MCP wrapper surface. Referenced by
   DEPLOYMENT_GUIDE.md.

## Notes for builder
- All guardrails from ENTERPRISE_SPEC §2 stay intact: LLM never creates findings,
  settle-before-scan, evidence-first, pinned axe-core, SSRF guard.
- OSS only — no paid APIs. Personal Supabase project only.
- If Supabase JWT shape differs from assumed `org_id` claim, surface in RISKS.