# P11 — Deterministic Browser SR Engine: Risks & Mitigations

## R1. CDP `Accessibility.getFullAXTree` unavailable in Vercel serverless
- **Risk:** Vercel's Chromium (via `@sparticuz/chromium`) may not support CDP AX tree commands. The existing `captureAxTree` uses `page.context().newCDPSession()` which requires Chromium, not Firefox/WebKit.
- **Mitigation:** The project already uses Playwright+Chromium for axe-scan. Test in CI early. Fallback: use `page.accessibility.snapshot()` (deprecated but still functional in Chromium).

## R2. `detectEmptyNames` duplication between `sr-speech.ts` and new `ax-checks.ts`
- **Risk:** Spec deliverable 3 puts checks in `ax-checks.ts`, but `detectEmptyNames` already lives in `sr-speech.ts:107`. Duplication will cause inconsistent findings.
- **Mitigation:** Move `detectEmptyNames` to `ax-checks.ts` and re-export from `sr-speech.ts` for backward compat, or import into ax-checks. Builder must not duplicate.

## R3. Reading-order check requires bounding rects, but `ax-tree.ts` sets `rect: null`
- **Risk:** `flattenNodes` in `ax-tree.ts:138` always sets `rect: null` because CDP AX tree doesn't include layout. The reading-order check (AX order vs visual bbox sort) cannot run without rects.
- **Mitigation:** Enrich rects via `DOM.getBoxModel` CDP call for each `backendDOMNodeId`, or use `page.evaluate` to get bounding rects for focusable elements. Must be lazy/batched to stay within 15s timeout. If too expensive, mark reading-order check as `needs_review` with a note that rects were unavailable.

## R4. Finding type compatibility
- **Risk:** `Finding` interface in `axe-scan.ts:43` was designed for axe results. AX-engine findings need `source_engines: ["ax"]` and new `rule_id` values (e.g., `ax-empty-accessible-name`). Downstream consumers (report builder, workbench) may not handle unknown rule IDs gracefully.
- **Mitigation:** The `Finding` interface is generic enough. Verify `computeComplianceMatrix` in `src/engine/normalize.ts` handles `"ax"` engine. Add `"ax"` to any engine whitelist if one exists.

## R5. SR Preview route auth — RLS / API auth
- **Risk:** New `/api/audits/[id]/sr-preview` route must enforce the same auth as other audit API routes. Missing auth = data leak (ENTERPRISE_SPEC §2 RLS deny-all).
- **Mitigation:** Copy auth pattern from existing audit API routes (e.g., `/api/audits/[id]/report`). Use same Supabase RLS check.

## R6. Test count regression
- **Risk:** Acceptance requires >= 436 passing tests. New tests must not break existing ones; wiring AX into audit-url must not slow tests that mock the pipeline.
- **Mitigation:** New unit tests use fixture JSON, no browser needed. Integration with audit-url is try/catch guarded. Run full suite before committing.

## R7. No credentials needed
- **Status:** CLEAR — this phase uses only Playwright CDP (already available), no new API keys or accounts required.
- **BLOCKER-IF-ABSENT:** None for P11.
