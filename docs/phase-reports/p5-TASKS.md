# P5 TASKS — Screen readers + Maturity + ACR/VPAT

> Spec: ENTERPRISE_SPEC.md §7-8 · Branch: `phase/p5-sr-maturity`
> Verify gates: maturity questionnaire unit tests; ACR/VPAT export fixture

## A. Screen reader evidence pack (§7)

1. **Add `src/lib/sr/snapshot.ts`** — wraps `@puppeteer/aria-aria-snapshot` (or
   `aria-tree` parser) to serialize the live DOM accessibility tree at audit
   time. Output `{ role, name, level, children }` JSON. No LLM interpretation —
   raw tree only. Test: `tests/sr/snapshot.test.ts` asserts a known fixture DOM
   yields the expected aria tree shape.
2. **Add `src/lib/sr/announcer.ts`** — extracts live-region announcements captured
   during the browser audit run (aria-live, role=status, role=alert). Stores raw
   text + timestamp in the evidence record. Test:
   `tests/sr/announcer.test.ts` asserts a live region yields one announcement.
3. **Add `src/lib/sr/sr-finding-linker.ts`** — deterministic linker that maps
   axe-core findings to relevant aria-tree nodes by `target` selector. LLM never
   creates findings; this only attaches existing axe findings to sr-evidence.
   Test: `tests/sr/linker.test.ts` asserts a finding with target `#main > button`
   links to the matching aria node.
4. **Wire sr-evidence into the audit pipeline** — `src/inngest/jobs/audit.ts`
   appends `srSnapshot` + `srAnnouncements` to the evidence bucket under
   `evidence/sr/` paths. Update the evidence manifest type in
   `src/types/audit.ts`. Test: `tests/pipeline/sr-pipeline.test.ts` asserts the
   audit job writes sr-evidence files when a real page is scanned.

## B. Maturity questionnaire (§8)

5. **Add `src/lib/maturity/questions.ts`** — exports the maturity questionnaire
   as a typed array. ~25 questions across 5 domains (Governance, Design, Dev,
   QA, Ops). Each question: `{ id, domain, text, weight, scoreRange:[0-4] }`.
   Sourced verbatim from ENTERPRISE_SPEC §8 (do NOT paraphrase). Test:
   `tests/maturity/questions.test.ts` asserts count === spec, weights sum to 100,
   no duplicate ids, every scoreRange bounded [0,4].
6. **Add `src/lib/maturity/score.ts`** — `computeMaturityScore(answers)` returns
   `{ overall, byDomain, level }`. level: 0-2 Reactive, 1.x Proactive, 2.x
   Managed, 3.x Optimizing, 4.x Leading. Pure function, no LLM. Test:
   `tests/maturity/score.test.ts` covers all-0 (level 0), mid (level 2), all-4
   (level 4), and a mixed domain weighting case.
7. **Add `src/app/api/maturity/route.ts`** — POST endpoint accepting `{ answers }`,
   returns computed score. Reads authenticated user via Supabase RLS session.
   Test: `tests/maturity/api.test.ts` asserts 401 without session, 200 with mock
   session returning the computed shape.
8. **Add `src/components/maturity/Questionnaire.tsx`** — client component
   rendering the 25 questions with 0-4 radio scale, submit to the API. shadcn/ui
   RadioGroup + Form. Test:
   `tests/maturity/questionnaire.test.tsx` (react-testing-library) asserts all
   questions render, submission calls fetch with the answers payload.

## C. ACR/VPAT export (§8)

9. **Add `src/lib/vpat/template.ts`** — the VPAT 2.5 508/WCAG template as typed
   sections: Success Criteria table per WCAG 2.2 AA. Columns: Criteria, Level,
   Conformance (Supports/Partial/Does Not Support/Not Applicable), Remarks.
   Test: `tests/vpat/template.test.ts` asserts all WCAG 2.2 AA criteria present
   (38 SC across A + AA), unique ids, required columns present.
10. **Add `src/lib/vpat/builder.ts`** — `buildVPAT(auditFindings, maturity)`:
    maps axe findings by `tags` (WCAG SC) into the template's Conformance column;
    findings with impact `critical`/`serious` for a SC → "Does Not Support";
    `moderate` → "Partial"; none → "Supports". Remarks auto-fill with the count
    + sample finding title (deterministic, no LLM prose). Test:
    `tests/vpat/builder.test.ts` asserts: (a) no findings → "Supports" all; (b)
    critical finding for 1.4.3 → "Does Not Support" for that row; (c) remarks
    string contains the finding rule id.
11. **Add `src/app/api/vpat/export/route.ts`** — GET route returning a structured
    ACR JSON / CSV (two format params) derived from `buildVPAT`. Auth-gated via
    RLS session. Test: `tests/vpat/export.test.ts` asserts fixture-driven output
    matches `tests/vpat/fixtures/expected-acr.json`, asserts 401 unauthed.
12. **Add `src/components/vpat/ExportButton.tsx`** — shadcn Button calling the
    export endpoint, triggering a download. Test:
    `tests/vpat/export-button.test.tsx` asserts click calls fetch and triggers
    download via anchor click simulation.

## D. Verify gates coverage (ORCHESTRATOR §4)

13. **Add `tests/maturity/gate.test.ts`** — runs the maturity questionnaire unit
    tests as a suite to satisfy "maturity questionnaire unit tests" gate.
14. **Add `tests/vpat/gate.test.ts`** — runs the ACR/VPAT export fixture test as
    a suite to satisfy "ACR/VPAT export fixture" gate.