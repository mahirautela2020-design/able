# P6 — Enterprise Shell: Risks & Mitigations

## Risks

1. **Supabase JWT claim shape unknown** — RLS policy assumes
   `auth.jwt() ->> 'org_id'`. If the actual claim path differs (e.g.
   `user_metadata.org_id` or custom `app.org_id`), RLS silently denies
   everything. *Mitigation:* verify claim path against the real Supabase
   project auth config before writing the migration; add a seeded test user
   with the claim and run the RLS fixture against it.

2. **BLOCKER-IF-ABSENT: real Supabase keys + project** — RLS, org-scoped JWT
   claims, and API key storage all require a live Supabase project + service
   role key to test migrations end-to-end. *Mitigation:* if `.env` still has
   placeholder values (AUTOPILOT blocker #1), stop and report — do not stub
   RLS with `policy using (true)`.

3. **Org membership edge cases** — a user in two orgs, an invited-but-unaccepted
   membership, or a suspended org. *Mitigation:* `requireEnterpriseAuth` must
   reject suspended orgs and unaccepted invitations; test all three in
   `auth.spec.ts`.

4. **MCP wrapper leaking LLM paths** — risk of accidentally wiring the wrapper
   to a finding-generation function, violating §2 guardrail. *Mitigation:* the
   smoke test must assert `createFinding` / LLM invoke paths are NEVER called;
   add an explicit `expect(llmInvoke).not.toHaveBeenCalled()` assertion.

5. **Rate-limit state storage** — in-memory token bucket breaks across Vercel
   serverless instances. *Mitigation:* use Upstash Redis (free tier) OR
   Supabase row with `last_refill_at` for the P6 scope; document trade-off in
   `docs/enterprise-api.md`. If Redis unavailable, fall back to per-instance
   limiter and flag as known limitation.

6. **API key storage security** — storing raw keys is a secret leak. *Mitigation:*
   store `sha256(key)` + `prefix` only; return the plaintext once at issue time.
   Test that listing keys never returns plaintext.

7. **Next.js 16 breaking changes** — App Router handler signatures, middleware
   exports, or `cookies()`/`headers()` APIs may differ from training data.
   *Mitigation:* read `node_modules/next/dist/docs/` (per AGENTS.md) before
   writing the auth middleware; heed deprecation notices.

8. **Test isolation contention** — RLS + audit logs mutate shared Supabase state.
   *Mitigation:* use a dedicated test schema/branch per test run; truncate
   `audit_log` and `api_keys` in `beforeEach`. Never run against prod data.

9. **Spec contradiction (§11 vs §2)** — if §11 implies an LLM-summary endpoint
   that conflicts with §2's "LLM never creates findings" guardrail. *Mitigation:*
   pick the safer reading (no LLM in any enterprise endpoint; summaries must
   be derived from already-settled findings only) and note it in the PR.