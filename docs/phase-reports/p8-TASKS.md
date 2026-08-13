# P8 — Deterministic UI Element Detection: Task Checklist

Phase: P8 (Vision detection) | Spec: P8_VISION_DETECTION_SPEC.md | Branch: `phase/p8-vision-detection`
Verify gates (ORCHESTRATOR §4 not listed — derive from spec §Acceptance): math tests pass deterministically; Python CLI schema test skips gracefully when weights/python absent; degraded LLM-only path still works; deterministic findings bucket correctly.

## Tasks

1. **Python detector CLI** — create `scripts/detect-elements.py`. Input: screenshot
   path (absolute temp path, validated — no traversal via `os.path.realpath` +
   temp-dir prefix check). Output: `elements.json` array
   `[{label, confidence, bbox:{x,y,w,h}, class}]`. Classes: button, icon, input,
   text, checkbox, radio, link, image. Use `supervision` + `ultralytics` YOLOv8n
   (or ONNX). Download weights at build time; if missing/unavailable, exit 0
   with `{"error":"weights-unavailable"}` — never crash. Confidence floor 0.5
   for counting; 0.4–0.5 borderline flagged separately. Maps to spec §1.

2. **Touch-target check (2.5.8)** — create `src/lib/audit/touch-targets.ts`.
   Pure function `checkTouchTargets(elements, devicePixelRatio)`:
   - convert bbox px → CSS px via devicePixelRatio
   - width<24 OR height<24 → `bucket:"violation"`, severity critical, ruleId
     `touch-target-2.5.8`, criterion "2.5.8"
   - 24≤w<44 OR 24≤h<44 → `bucket:"needs_review"` (recommended size)
   - adjacent interactive targets with gap<8px → `needs_review`
   - return `TouchTargetFinding[]` matching `ContrastFinding` shape in
     `src/lib/audit/image-contrast.ts` (ruleId, wcagCriterion, bbox, evidence).
   No model calls — deterministic math. Maps to spec §2.

3. **Icon contrast check (1.4.11)** — create `src/lib/audit/icon-contrast.ts`.
   Pure function `checkIconContrast(elements, screenshotBuffer)`:
   - for each `class:"icon"` bbox, sample edge pixels vs adjacent background
     using `sharp` (already OSS in repo? verify) or `pngjs`; compute ratio via
     `colorjs.io` (already used in `image-contrast.ts`)
   - ratio<3:1 → `bucket:"violation"`, criterion "1.4.11", severity serious
   - 3:1≤ratio<4.5 → `needs_review`
   - reuse `relativeLuminance`/`contrastRatio` logic from image-contrast.ts
     (extract shared helper if needed — note in RISKS)
   Maps to spec §3.

4. **Wire into image mode** — edit `src/app/api/uploads/image/route.ts`:
   after vision advisory findings, spawn `python scripts/detect-elements.py`
   via `child_process.spawn` with screenshot temp path (write buffer to
   `os.tmpdir()` file, delete after). If exit≠0 or `weights-unavailable` →
   skip detector, set `summary.detectionDegraded=true`. Else parse
   `elements.json`, feed to `checkTouchTargets` + `checkIconContrast`,
   merge deterministic findings (bucket:"violation"|"needs_review") with
   vision suggestions (existing bucket:"needs_review"). Keep vision findings
   advisory — never let detector downgrade LLM suggestion to violation or
   vice versa. Add `summary.elementsDetected`, `summary.detectionModel`.
   Maps to spec §4.

5. **Workbench overlay (GI scope, optional trim)** — minimal: in the screenshot
   upload result view, render bounding-box overlay SVG from `elements.json`
   if present. Keep under 30 lines change; skip if GI surface is non-trivial
   (note in RISKS).

6. **Math tests** — `__tests__/audit/touch-targets.spec.ts`: synthetic bbox
   fixtures (24×24, 23×24, 44×44, two boxes 7px apart) → assert exact bucket,
   severity, criterion. `__tests__/audit/icon-contrast.spec.ts`: synthetic
   icon/bg color pairs (contrast 2.9, 3.0, 4.4) → assert bucket. Pure, no
   model, deterministic. Maps to spec §5, Acceptance bullet 1.

7. **Python CLI test** — `__tests__/audit/detect-elements.spec.ts`: generate a
   minimal PNG via `pngjs` (solid color), spawn `python scripts/detect-elements.py`,
   assert JSON schema (`label` string, `confidence` number, `bbox` has
   x/y/w/h, `class` in allowed set) when python+weights available; SKIP
   (not fail) when `python` not on PATH or weights absent. Use
   `it.skipIf(!hasPython)` pattern. Maps to spec §5, Acceptance bullet 3.

8. **Verify gate wiring** — add `npm run verify:p8` =
   `jest __tests__/audit/touch-targets.spec.ts __tests__/audit/icon-contrast.spec.ts __tests__/audit/detect-elements.spec.ts`
   and include in `package.json` `verify` chain. `npm run verify` must stay
   green with weights absent (skip path). Maps to Acceptance bullet 1+3.

## Notes for builder
- Guardrails intact: LLM never creates findings — detector IS the deterministic
  path now; vision stays `needs_review` advisory only (ENTERPRISE_SPEC §2).
- OSS only — `supervision`/`ultralytics` are OSS (AGPL/Apache — verify license
  OK in RISKS). No paid APIs.
- Detection runs locally; on Vercel serverless, python/weights may be absent →
  degrade to LLM-only advisory (spec §Risks bullet 1). Feature-detect, never
  crash.
- Read `node_modules/next/dist/docs/` per AGENTS.md before editing route.ts
  (Next.js 16 breaking changes).