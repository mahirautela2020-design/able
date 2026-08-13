# P3-TASKS — Figma + Image Accessibility

> Builder: phase `phase/p3-figma-image` already merged to main and lib scaffolds exist
> (`src/lib/figma/{client,parse}.ts`, `src/lib/audit/{image-alt,image-contrast}.ts`,
> `src/lib/ssrf.ts`, `src/lib/env.server.ts`). Spec: ENTERPRISE_SPEC §10, PRODUCT_BLUEPRINT
> §2. Verify gates (ORCHESTRATOR §4): **contrast-pairs tests** + **Figma client parse fixture**.

## A. Figma audit module (verify + complete)

1. **Figma client** — confirm `src/lib/figma/client.ts` exposes `getFile(fileKey)`,
   `getNode(fileKey, nodeId)`, `getImages(fileKey, ids)`, `getFileNodes(fileKey)`.
   Host must be hard-pinned `api.figma.com` HTTPS; reject any other host. `FIGMA_PAT`
   sourced from `env.server.ts`; missing → returns null gracefully (feature off), not a
   crash. Maps to ENTERPRISE_SPEC §2 (SSRF guard) + §10 (Figma ingest).
   - Test: `tests/figma-client.test.ts` — mocks `fetch`; assert URL/headers; SSRF reject
     non-figma host; reject http; missing PAT returns null.

2. **Figma parser** — confirm `src/lib/figma/parse.ts` is a pure recursive fn:
   Figma JSON → `{ id, name, type, fills, strokes, characters, style, children }`.
   Stack-safe to depth 4; handles missing fields without throwing.
   - Test: `tests/figma-parse.test.ts` — fixture `src/lib/figma/__fixtures__/sample-file.json`
     → ≥5 assertions (text nodes carry style, frame hierarchy, missing-field tolerance).
   - THE Figma-client-parse verify gate.

3. **`FIGMA_PAT` env** — confirm `env.server.ts` reads `process.env.FIGMA_PAT` (optional).
   Never logged, never client-side. UI surfaces "Figma disabled: add PAT" when absent.

4. **Figma route** — `src/app/api/audit/figma/route.ts` POST `{ fileKey, nodeId? }` → parsed
   node tree. Default 401 unless `process.env.FIGMA_AUDIT_PUBLIC === 'true'` (P6 swaps to
   RBAC). Rate-limit via Inngest queue if response > 50 nodes. (Test 401 when flag unset.)

5. **Figma workbench tab** — `src/components/workbench/figma-image-tab.tsx` shadcn Tabs:
   URL input + node-tree table + "Run Figma audit" button → calls API route (WORKBENCH_VISION §3).
   - Browser spec: `tests/browser/figma-image-tab.spec.ts` — tab renders, form submits,
     results populate from mocked API.

## B. Image audit module (verify + complete)

6. **Image contrast** — `src/lib/audit/image-contrast.ts` — `extractColorPairs(nodeTree)`
   + `checkContrastPairs(pairs)` → finding[] with WCAG level, ratio, evidence `{rect, nodeId, source: 'rule-contrast'}`.
   Pinned local; LLM never creates findings. Skip + INFO on gradient/png-image fills.
   - Test: `tests/image-contrast.test.ts` — fixture `src/lib/audit/__fixtures__/contrast-cases.json`
     covers: AA pass/fail, AAA pass, large-text pass, white-on-white, gradient-skip, png-skip.
     Ratios ±0.01.
   - **THE contrast-pairs verify gate.** Also: `tests/contrast-pairs.test.ts` must stay green.

7. **Image alt** — `src/lib/audit/image-alt.ts` — flags missing-alt for image-only frames;
   uses adjacent Figma text nodes as candidate alt settlers. Deterministic rules only.
   - Test: `tests/image-alt.test.ts` — 4+ cases (good, missing, filename-stub, decorative).

8. **Unified findings endpoint** — extend route from task 4 to optionally run image-contrast
   + image-alt on the parsed tree → unified findings list with `source` tags.

## C. Integration & verify gates

9. `npm run verify` includes p3 unit tests (`vitest run`). Gates: contrast-pairs green +
   figma parse fixture green + browser spec green.
10. Evidence-first: every finding carries `{ rect, nodeId, source }` (ENTERPRISE_SPEC §2).
11. No new non-MIT deps. sharp (if added) pinned prebuilt binary; lazy-load only inside route.

## D. Blockers (escalate, do not code past)

12. If `FIGMA_PAT` absent at runtime — surface UI affordance only; tests must stay green
    WITHOUT the token (mock HTTP).
13. If Figma API JSON schema mismatches fixture — FIX FIXTURE FIRST, never bend the parser.