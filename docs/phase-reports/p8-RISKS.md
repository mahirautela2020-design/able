# P8 — Deterministic UI Element Detection: Risks & Mitigations

## Risks

1. **BLOCKER-IF-ABSENT: Python + weights on Vercel serverless** — Vercel
   Hobby functions can't install `ultralytics` + YOLOv8n weights at runtime
   (size, cold start, no GPU). *Mitigation:* feature-detect `python` on PATH
   AND weights file present; if absent, set `summary.detectionDegraded=true`
   and return LLM-only advisory (existing behavior). Document in
   `docs/vision-detection.md` that deterministic path runs locally / on a
   self-hosted worker; Vercel path stays advisory. Never crash the route.

2. **License exposure — `ultralytics` is AGPL-3.0** — AGPL is viral for
   distributed/SaaS use; `supervision` is MIT. *Mitigation:* P8 must spawn
   the Python CLI as a SEPARATE PROCESS (no import into TS / no linking) so
   AGPL code is not combined with the Able source. Note this boundary in the
   PR + `docs/vision-detection.md`. If that boundary is unacceptable, fall
   back to an ONNX export of a permissively-licensed detector (MIT/BSD) and
   flag as a P8 follow-up. Do NOT ship a path that imports ultralytics into
   the Next.js bundle.

3. **Path traversal / arbitrary file read** — passing a screenshot path to a
   subprocess is an SSRF-adjacent surface. *Mitigation:* write uploaded buffer
   to `os.tmpdir()` under a random `crypto.randomUUID()` filename; pass the
   absolute temp path only; in Python, `os.path.realpath` must start with the
   configured temp dir or exit 1. Reuse the SSRF guard mindset from
   ENTERPRISE_SPEC §2. Add a test asserting `/etc/passwd`-style input is
   rejected.

4. **Detector precision / false positives** — YOLOv8n on UI screenshots may
   box text-as-button or miss small icons. *Mitigation:* confidence floor
   0.5 for counting; borderline (0.4–0.5) → `needs_review` never violation
   (spec §Risks bullet 2). Touch-target violation (<24px) requires a
   detected bbox; missed icons produce false negatives, not false violations
   — acceptable for P8 (document as limitation).

5. **Color sampling fidelity (1.4.11)** — JPEG/WebP compression + PNG
   quantization can shift edge pixel colors enough to flip a 3.0:1 ratio.
   *Mitigation:* sample a 3×3 median of edge pixels and adjacent bg (not a
   single pixel); round ratio to 1 decimal before thresholding; ratios in
   [2.95, 3.05) → `needs_review` (borderline) not violation. Add a fixture
   covering a 2.99 ratio → needs_review.

6. **Shared contrast helper refactor risk** — extracting
   `relativeLuminance`/`contrastRatio` from `image-contrast.ts` into a shared
   module could break P3's existing tests. *Mitigation:* PREFER importing the
   existing functions where exported; only extract to `src/lib/audit/color-math.ts`
   if not exported, and re-export from the original location so P3 imports
   keep working. Run P3 tests as part of `npm run verify` to catch regressions.

7. **`sharp` / `pngjs` availability** — pixel sampling needs a PNG decoder.
   *Mitigation:* check `package.json` for an existing decoder before adding
   deps; `sharp` is heavy (native binary on Vercel), `pngjs` is pure JS and
   lighter — prefer `pngjs` for the icon-contrast decoder. Note dep choice
   in the PR.

8. **Next.js 16 App Router body handling** — writing upload buffer to temp
   file + spawning a subprocess inside a route handler may hit the
   serverless 10s/60s timeout on Hobby. *Mitigation:* detector path is local
   only (see risk 1); on Vercel the degrade path skips it. Add a process
   timeout (15s) on the spawn and treat timeout as `detectionDegraded`.
   Read `node_modules/next/dist/docs/` per AGENTS.md.

9. **Spec contradiction — `bucket:"violation"` from detector vs §2
   "LLM never creates findings"** — the guardrail is about LLMs; the detector
   is deterministic CV, not an LLM, so it CAN produce violations. *Mitigation:*
   the safer reading is confirmed: detector findings with measured <24px or
   <3:1 → `bucket:"violation"`; everything sensitive/borderline →
   `needs_review`. State this interpretation explicitly in the PR description
   so a reviewer can object before merge. Never let an LLM suggestion become
   a violation via the detector merge.

10. **No ORCHESTRATOR §4 gate row for P8** — the phase table in
    ORCHESTRATOR.md stops at P6; P8 has no explicit verify-gate column.
    *Mitigation:* tasks 6–8 above define the gate (math tests green +
    Python test skips gracefully + `npm run verify` green without weights).
    If orchestrator expects a gate row, surface in the PR — do NOT silently
    invent a stricter gate than the spec implies.