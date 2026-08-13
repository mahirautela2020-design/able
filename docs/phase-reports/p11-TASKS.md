# P11 — Deterministic Browser SR Engine: Task Checklist

## 1. Create `src/engine/ax-checks.ts` — AX-tree deterministic checks
- **What:** Module exporting `runAxChecks(nodes: AxFlatNode[]): Finding[]` with four checks:
  - Empty accessible name on focusable controls → WCAG 4.1.2 (serious)
  - Button/link role vs DOM tag mismatch → WCAG 4.1.2 (serious)
  - Reading-order divergence (AX doc order vs visual bbox y/x sort) → WCAG 1.3.2 (needs_review)
  - Duplicate accessible names for links/buttons in same landmark → WCAG 2.4.4/2.4.7 (needs_review)
- **Files:** Create `src/engine/ax-checks.ts`; import `AxFlatNode` from `./ax-tree`, `Finding` from `./axe-scan`
- **Note:** `detectEmptyNames` already exists in `sr-speech.ts:107`; move or re-use it here and re-export from ax-checks. Avoid duplication.
- **Verify:** `tests/ax-tree.test.ts` — fixture-based tests per check

## 2. Wire AX capture + checks into audit pipeline
- **What:** In `src/inngest/functions/audit-url.ts` scan-page step (~line 107), after `runAxe` + `runKeyboard`, call `captureAxTree(page)` then `runAxChecks(nodes)`. Merge returned findings into `allFindingsForPage`. Add `"ax"` to `source_engines`.
- **Files:** Edit `src/inngest/functions/audit-url.ts`; import from `src/engine/ax-tree` and `src/engine/ax-checks`
- **Guard:** Wrap in try/catch — AX capture is best-effort (matches existing sr snapshot pattern at line 114).
- **Verify:** Local E2E — audit a site; DB shows `ax`-engine findings for unlabeled controls

## 3. Upload AX transcript as evidence
- **What:** After AX capture, call `axTreeToTranscript(nodes)` from `sr-speech.ts`, serialize to JSON, upload via `uploadEvidence` alongside existing SR snapshot evidence.
- **Files:** Edit `src/inngest/functions/audit-url.ts`
- **Verify:** Evidence bucket contains `evidence/sr/{auditId}/{i}/ax-transcript.json`

## 4. Create SR Preview API route
- **What:** `src/app/api/audits/[id]/sr-preview/route.ts` — GET handler returning ordered speech lines for page 0. Fetch AX transcript evidence JSON from storage, return `{ lines: string[] }`.
- **Files:** Create `src/app/api/audits/[id]/sr-preview/route.ts`
- **Verify:** `curl /api/audits/<id>/sr-preview` returns JSON array of speech strings

## 5. Create SR Preview workbench panel
- **What:** `src/components/workbench/sr-preview.tsx` — tab in the right side of the workbench showing speech transcript. Include "Read from top" button. Fetch from `/api/audits/[id]/sr-preview`.
- **Files:** Create `src/components/workbench/sr-preview.tsx`; edit `src/components/workbench/workbench.tsx` to add the tab
- **Maps to:** Spec deliverable 5 (SR Preview panel)
- **Verify:** Browser test — workbench shows SR Preview tab with readable transcript

## 6. Create test suite `tests/ax-tree.test.ts`
- **What:** Vitest tests with fixture AX JSON covering:
  - Empty accessible name flagged as 4.1.2 finding
  - Reading-order divergence flagged as 1.3.2 finding
  - Role mismatch (button role on `<a>` tag) flagged
  - Duplicate link names flagged as 2.4.4
  - Valid tree → zero findings
  - `nodeToSpeech` produces correct strings for heading, checkbox, combobox
  - `axTreeToTranscript` filters invisible/generic nodes
- **Files:** Create `tests/ax-tree.test.ts`
- **Verify:** `npx vitest run tests/ax-tree.test.ts` — all pass

## 7. TypeScript + build verification
- **What:** Ensure `npx tsc --noEmit` clean, `npm run build` succeeds, full `npx vitest run` >= 436 passing
- **Files:** No new files — fix any type errors introduced by tasks 1-6
- **Verify gates:** `npx tsc --noEmit` clean; `npm run build` succeeds; `npx vitest run` all green
