# P3 TASKS — Figma + Image Auditing

Phase P3 adds two new audit modules to the Able workbench: (A) Figma file inspection
via the Figma REST API and (B) image contrast/alt analysis. Spec: ENTERPRISE_SPEC §10,
PRODUCT_BLUEPRINT §2. Branch: `phase/p3-figma-image`. Verify gates: contrast-pairs tests;
Figma client parse fixture.

## A. Figma audit module

1. Create `lib/figma/client.ts` — Figma REST client wrapping `https://api.figma.com/v1`
   with `FIGMA_PAT` from `env.server.ts`. Functions: `getFile(fileKey)`,
   `getNode(fileKey, nodeId)`, `getImages(fileKey, ids)`, `getFileNodes(fileKey)`. Add
   SSRF guard (no arbitrary URL — host must be `api.figma.com`, HTTPS only) per
   ENTERPRISE_SPEC §2. Validate `fileKey` (regex `^[A-Za-z0-9]+$`).
2. Add `FIGMA_PAT` to `env.server.ts` read from `process.env.FIGMA_PAT` (optional —
   absent = feature disabled, surface in UI as "Figma disabled: add PAT"). Never log it.
3. Create `lib/figma/parse.ts` — transforms Figma file JSON → normalized node tree:
   `{ id, name, type, fills, strokes, characters, style, children }`. Pure function,
   no I/O — so it is unit-testable from a recorded fixture.
4. Create `lib/figma/__fixtures__/sample-file.json` — real recorded Figma file response
   (redact any personal keys). Used by parse tests + client mock.
5. Create `lib/figma/parse.test.ts` — assert parse extracts text nodes with style,
   fills array, nested frame children, handles missing fields. ≥5 assertions.
6. Create `lib/figma/client.test.ts` — mock `fetch`, assert URL/headers/SSRF guard
   rejects non-figma host, rejects http, missing PAT returns null gracefully.
7. Create `app/api/audit/figma/route.ts` — POST `{ fileKey, nodeId? }` → returns
   parsed node tree. Auth required (reuse P6 auth when absent, gate behind env flag for
   now). Rate-limited via existing Inngest queue if response > 50 nodes.
8. Wire "Figma" tab into workbench (WORKBENCH_VISION §3): URL input + node tree table
   + "Run Figma audit" button calling the API route. Layout in `components/workbench/`.

## B. Image audit module

9. Create `lib/audit/image-contrast.ts` — WCAG contrast calc (reuse `lib/audit/contrast`
   from P3-blueprint). Functions: `extractColorPairs(nodeTree)` walking fills/strokes,
   `checkContrastPairs(pairs)` → finding[] with WCAG level, ratio, evidence rect.
   Must use pinned axe-core; LLM never creates findings.
10. Create `lib/audit/__fixtures__/contrast-cases.json` — pairs covering: normal AA pass,
    AA fail, AAA pass, large-text pass, white-on-white fail, gradient (skip + warn),
    png image fill (skip — cannot measure).
11. Create `lib/audit/image-contrast.test.ts` — assert each fixture case resolves
    correctly, ratios match expected (±0.01), large-text threshold respected.
12. Create `lib/audit/image-alt.ts` — checks Figma text nodes adjacent to image fills
    as candidate alt text; flags missing-alt findings for image-only frames.
    Settle-before-scan: produces findings from deterministic rules only.
13. Extend `app/api/audit/figma/route.ts` to optionally run image-contrast + image-alt
    on the parsed tree, return unified findings list.

## C. Integration & verify gates

14. Add `npm run verify` coverage: p3 tests included in the run (`vitest run`).
15. Contrast-pairs gate: `lib/audit/image-contrast.test.ts` passes all 6 fixtures.
16. Figma parse gate: `lib/figma/parse.test.ts` + `client.test.ts` green.
17. Evidence-first: every finding carries `{ rect, nodeId, source: 'axe-core'|'rule-contrast' }`.
18. No new deps unless MIT; any image lib (sharp) pinned and added to package.json.
19. Update `build-logs/run.log` is NOT a task — orchestrator handles it.