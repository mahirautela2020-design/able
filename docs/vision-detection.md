# Vision detection (P8) — deterministic UI element detection

> How the accuracy upgrade works, where it runs, and the boundaries you must
> not cross.

## What it does

Image mode (`POST /api/uploads/image`) now runs a **deterministic** detection
step alongside the vision-LLM advisory suggestions:

1. `scripts/detect-elements.py` (Python, supervision + ultralytics YOLOv8n) is
   spawned as a **separate process** and emits bounding boxes:
   `[{ label, confidence, bbox:{x,y,w,h}, class }]`.
2. `src/lib/audit/touch-targets.ts` turns those boxes into WCAG 2.5.8 findings
   (target size) by pure math.
3. `src/lib/audit/icon-contrast.ts` samples icon pixels vs. adjacent background
   (via `sharp`) and computes WCAG 1.4.11 non-text contrast by pure math.

Only measured failures become `bucket: "violation"`. The vision LLM's output
stays `needs_review` advisory forever — the accuracy doctrine is unchanged.

## Where it runs

| Environment | Behaviour |
|---|---|
| Local dev / self-hosted worker (Python + weights present) | Deterministic 2.5.8 / 1.4.11 findings appear alongside advisory suggestions |
| Vercel serverless (no Python / no weights) | Detector is feature-detected and **degrades** to LLM-advisory-only (`summary.detectionDegraded: true`) — never crashes |

The detector is never a hard dependency. `runDetector` (in
`src/lib/audit/detection.ts`) writes the upload to a random temp file, spawns
the CLI with a 15s timeout, and treats every failure as a graceful degrade.

## Licensing boundary (do not cross)

`ultralytics` is **AGPL-3.0**; `supervision` is MIT. The detector therefore runs
**only as a separate process** — it is never imported, linked, or bundled into
the Next.js/TypeScript source. This keeps Able's MIT source clean. If this
boundary is ever unacceptable, the follow-up is to ship an ONNX export of a
permissively-licensed (MIT/BSD) detector instead.

## Security

The screenshot path is written to `os.tmpdir()` under a random
`crypto.randomUUID()` filename and passed as an absolute temp path only.
`scripts/detect-elements.py` rejects any path whose `os.path.realpath` does not
start with the configured temp dir (`--temp-dir`), returning exit 1 — the same
SSRF-guard mindset as ENTERPRISE_SPEC §2.

## Known limitations

- YOLOv8n is a COCO model by default; a purpose-trained UI-detector improves
  precision. Missed icons produce false negatives (no finding), never false
  violations.
- Confidence floor is 0.5 for counting; 0.4–0.5 "borderline" boxes are emitted
  but bucketed `needs_review`, never `violation`.
- Icon contrast uses a median of border vs. background pixels to survive
  JPEG/WebP compression noise; ratios are rounded to 1 decimal before
  thresholding.
