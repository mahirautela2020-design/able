# P8 — Deterministic UI Element Detection (supervision / OmniParser-style)

> Scope: detect UI elements (buttons, icons, inputs, text) in screenshots with
> **deterministic computer vision**, so touch-target size (WCAG 2.5.8) and
> non-text contrast (1.4.11) are computed by MATH — not guessed by an LLM.
> This is the accuracy upgrade to the advisory-only image mode.

## Why it matters
Today image mode uses vision LLMs (Gemini/MiMo) which *suggest* issues in
needs_review. LLMs cannot measure pixels. Roboflow **supervision** + a small
detection model can produce bounding boxes → we compute 2.5.8 (target ≥ 24×24
CSS px, 44×44 recommended) and 1.4.11 (contrast vs adjacent) deterministically.

## What to build
1. **`scripts/detect-elements.py`** — Python CLI (supervision + ultralytics YOLO
   or a small ONNX detector):
   - input: screenshot path → output: `elements.json`
     `[{label, confidence, bbox: {x,y,w,h}, class}]`
   - classes: button, icon, input, text, checkbox, radio, link, image
   - model: lightweight (yolov8n or MobileNet-EdgeTPU UI detector); download at
     build time; graceful message if weights missing
2. **`src/lib/audit/touch-targets.ts`** — deterministic 2.5.8 check on elements.json:
   - compute each interactive bbox vs 44×44 recommendation → finding when
     width < 24 or height < 24 (hard violation) / < 44 (needs_review)
   - overlap check: adjacent targets with < 8px gap → needs_review (1.4.11-ish)
   - input: elements.json + devicePixelRatio → CSS px conversion
3. **`src/lib/audit/icon-contrast.ts`** — 1.4.11 non-text contrast:
   - sample icon bbox edge pixels vs adjacent background (colorjs.io) →
     ratio < 3:1 → violation (deterministic!)
4. **Wire into image mode** — `/api/uploads/image` runs the Python detector when
   available (spawn `python scripts/detect-elements.py`), merges deterministic
   findings with vision-LLM suggestions (which stay advisory). Screenshot-upload
   UI shows element boxes overlay in the workbench.
5. **Tests** — `tests/touch-targets.test.ts` + `tests/icon-contrast.test.ts`
   with synthetic bbox/color fixtures (pure math, no model needed in CI).
   Python CLI test: `tests/detect-elements.test.ts` spawns it on a generated PNG
   and asserts JSON schema (skip if python/weights unavailable).

## Acceptance
- `npm run verify` green; math tests pass deterministically
- With weights installed: upload a UI screenshot → deterministic 2.5.8/1.4.11
  findings appear alongside advisory suggestions, clearly bucketed
- Without weights: image mode still works (LLM advisory only) — degrade, never crash
- Findings: `bucket: "violation"` only for measured 2.5.8 (<24px) and 1.4.11 (<3:1)

## Risks
- Python/weights may be absent on serverless → feature-detect; Vercel path keeps
  LLM-only advisory; local path runs the detector
- Detector precision varies → confidence floor 0.5 for elements to count;
  borderline boxes (confidence 0.4–0.5) → needs_review not violation
- Path traversal: screenshot file passed via absolute temp path, validated
