# P3-RISKS — Figma + Image phase

> Builder: handle each. Orchestrator: stop+report on BLOCKER items.

## BLOCKER-IF-ABSENT

1. **Figma PAT (`FIGMA_PAT`)** — required for live `getFile` calls. Agent CANNOT create a
   Figma account. **Mitigation**: treat Figma as optional — route returns "Figma disabled:
   add FIGMA_PAT" when env missing; parse + client unit tests use recorded fixtures
   (`src/lib/figma/__fixtures__/sample-file.json`) so verify gate passes WITHOUT a live
   PAT. Frontend shows "Add Figma PAT in settings" affordance. Orchestrator flags this as
   blocker #2 (credential the agent can't create) — do NOT attempt to obtain one.

2. **Supabase Storage bucket `evidence-images`** (if image screenshots are persisted) —
   must exist with private visibility. **Mitigation**: migration creates the bucket;
   tests mock the storage client so CI is green without the real bucket.

## Technical risks

3. **Figma API JSON size/nesting depth** — files can be MB-scale, ~10 levels deep; recursive
   parse can blow stack/timeout. **Mitigation**: parse.ts recursive + stack-safe; cap depth
   at 4; fixture is a trimmed redacted slice. Inngest chunk parse into ≤50-node `step.run`s.

4. **Figma rate limits** (7500/day/token, 100/min) — huge fileKey could DoS.
   **Mitigation**: rate-limit the route via existing Inngest queue (settle-before-scan funnel);
   cache `getFile(nodeId)` keyed by `fileKey+nodeId` hash in `figma_cache` table (stub until SETUP).

5. **Figma color format** — RGB floats 0–1 with separate opacity. Naive `Math.round(r*255)`
   gives off-by-one at edges. **Mitigation**: `Math.round(Math.min(1,Math.max(0,r))*255)`;
   fixture includes 0.9999 and 0.0001 cases.

6. **Transparent / gradient / png-image fills** — WCAG contrast undefined on these.
   **Mitigation**: skip + emit INFO `{ kind: 'contrast', note: 'gradient|image fill skipped' }`.
   Do NOT fabricate ratios (evidence-first, ENTERPRISE_SPEC §2). Test asserts SKIP not fail.

7. **Missing text style** — Figma "characters" node may lack `style` block → divide-by-zero
   in ratio calc. **Mitigation**: guard — missing style → treat as 16px regular; emit INFO
   "inferred size". Never throw on partial data.

8. **axe-core scope creep** — axe-core is a DOM auditor; cannot directly inspect Figma JSON.
   **Mitigation**: image-contrast is a NEW deterministic rule module
   (`src/lib/audit/image-contrast.ts`, `source: 'rule-contrast'`), NOT axe-core. axe-core
   stays pinned + only runs on rendered HTML (P1 paths unchanged).

9. **SSRF via node URL / image src** — user-controlled URLs could pivot the route to internal hosts. **Mitigation**: hard-pin `api.figma.com`/HTTPS in client.ts; image fetches go through
   allowlist (`figma-alpha-api.s3`, `figma.com`). Reject everything else with 400.
   Covered in `tests/figma-client.test.ts` (expect `http://127.0.0.1` rejected).

10. **Personal keys in fixtures** — `sample-file.json` might leak `lastModifiedBy`, email,
    ownerId. **Mitigation**: redact those fields; keep fixture in `__fixtures__/`; never
    commit `.env*`.

11. **sharp binary on Vercel Hobby** — ~25MB native lib can blow function size limit.
    **Mitigation**: pin `sharp@^0.33` (prebuilt); lazy-load inside route, not at module top.
    If install fails on Windows, skip raster path and support vector fills only.

12. **Large-text threshold (3:1)** — Figma frames don't carry a clear "text size" concept
    (style may be inherited). **Mitigation**: walk style chain explicitly; no font size in
    node or ancestors → default to "normal" (4.5:1 threshold). Emit INFO with rationale.

13. **P6 auth not yet present** — leaving the Figma route wide-open leaks PAT-protected data.
    **Mitigation**: gate route behind `FIGMA_AUDIT_PUBLIC !== 'true'` → default 401; P6
    swaps to RBAC. Test asserts 401 when flag unset.

## Spec ambiguity

14. **BLUEPRINT §2 "image contrast" vs ENTERPRISE_SPEC §10 "Figma integration"** — could
    double-build. **Mitigation**: treat as ONE module (Figma + image rules together), route
    path `/api/audit/figma`. Note interpretation in PR description. (Safer: unified module.)

## Hard stop

15. Figma API schema mismatches fixture → FIX FIXTURE FIRST, not the parser. Spec/source
    of truth is Figma's live response, recorded once and redacted.