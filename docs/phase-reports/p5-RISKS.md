# P5 RISKS — what could break

## R1 — Aria snapshot library availability for pinned local use
- Risk: `@puppeteer/aria-aria-snapshot` may require a specific puppeteer
  version conflicting with the pinned puppeteer used in the audit pipeline.
- Mitigation: use the built-in `accessibility.snapshot()` from puppeteer
  (core API, stable across versions). Verify with `npm ls puppeteer` in
  verifier. If snapshot shape differs, normalize in `sr/snapshot.ts` adapter.

## R2 — WCAG 2.2 AA criteria list correctness
- Risk: hardcoding the 38 SC list in `vpat/template.ts` risks missing or
  duplicating criteria, failing the gate test. axe-core `tags` map to WCAG
  SC ids in form `wcag2a`/`wcag1413` — mismatch with template ids breaks
  the builder linking.
- Mitigation: source the SC list from the JSON in `node_modules/axe-core`
  (`./locales/en.json` or the data files) at build time via a small loader,
  or pin a fixture file `tests/vpat/fixtures/wcag22aa.json` generated once
  and asserted in the template test. Keep axe-core pinned (never upgrade).

## R3 — Findings without a WCAG SC tag
- Risk: some axe rules (best-practice, experimental) carry no WCAG tag —
  builder must not crash on these and must mark the SC row N/A or leave
  remarks blank.
- Mitigation: `buildVPAT` filters findings to `tags` intersecting the WCAG
  SC id set; untagged findings are omitted from the ACR (not a conformance
  statement). Assert this in the builder test.

## R4 — Maturity questions must match ENTERPRISE_SPEC §8 verbatim
- Risk: paraphrasing the 25 questions breaks trust + the gate test. If the
  spec text and suggested weights disagree, that's a spec contradiction
  (hard blocker 3).
- Mitigation: copy verbatim; if weights disagree, follow the safer (lower
  granularity) reading and note it in the PR body. Raise as blocker only if
  the disagreement prevents a consistent level computation.

## R5 — ACR export format ambiguity
- Risk: §8 may say "ACR/VPAT" without specifying JSON vs CSV vs DOCX. Without
  DOCX generation infra (OSS-only — no `docx` paid lib), a DOCX requirement
  would be a blocker.
- Mitigation: ship JSON + CSV (both trivial, OSS). If spec insists on DOCX,
  use `docx` npm (MIT-licensed, OSS-compliant) or report as blocker 2 (missing
  tooling). Prefer CSV first — widest downstream compatibility.

## R6 — Auth/RLS for maturity + vpat endpoints
- Risk: the API routes integrate Supabase RLS session. SETUP node (real keys)
  is deferred; P5 must work against the P0 integration-test Supabase stub.
- Mitigation: gate routes on the same `getSession()` helper as P0 audit
  endpoints. Unit tests mock the session; do not require live Supabase. Flag
  "end-to-end with real Supabase" as deferred to SETUP, not P5.

## R7 — Live-region capture timing during audit run
- Risk: aria-live announcements are async; capturing them requires hooking
  puppeteer's page events during the audit traversal — a missed event yields
  empty evidence silently.
- Mitigation: register `page.on('console')` + a MutationObserver injected
  before navigation. Assert in `announcer.test.ts` that a known live region
  yields ≥1 announcement; log a warning when zero announcements and the page
  has any role=status/alert/live nodes.

## R8 — Orchestrator gate is "ACR/VPAT export fixture"
- Risk: gate expects a fixture file input + deterministic output, not a live
  audit. A fuzzy comparison fails the gate.
- Mitigation: freeze `tests/vpat/fixtures/sample-findings.json` +
  `expected-acr.json` (hand-authored). Test does a deep-equal against the
  frozen fixture, never against live audit data.

## Credit check (BLOCKER-IF-ABSENT)
- No new credentials required for P5. All deps are OSS npm packages or
  existing Supabase/Inngest stubs from P0. If `docx` lib is required by
  spec and is non-OSS, stop and report (hard blocker 4 / paid-API rule).