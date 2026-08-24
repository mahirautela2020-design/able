# ScanA11y Figma Plugin

Audits the selected frames or the current page against a Figma-appropriate subset of
WCAG 2.2, lets you jump to any finding on canvas, and writes a full report — one 16:9 frame
per finding, with a screenshot and a recommendation — into a new "ScanA11y Report" page in
the same file. No login, no history stored, no network calls (enforced by the manifest's
`networkAccess.allowedDomains: []`).

## Build it

Run from the repo root (needs the main app's `node_modules`):

```bash
npm run build:figma-plugin
```

This produces `figma-plugin/dist/index.html` (a single self-contained HTML file — Figma loads
plugin UI as an opaque string, so all JS/CSS is inlined) and `figma-plugin/dist/code.js` (the
main-thread plugin code).

## Load it (Figma desktop app, local dev mode)

1. `npm run build:figma-plugin`
2. Open the Figma desktop app (this flow isn't available in the browser version)
3. `Plugins` → `Development` → `Import plugin from manifest…`
4. Select `figma-plugin/manifest.json`
5. Open any file, select something (or not, for a whole-page audit), then
   `Plugins` → `Development` → `ScanA11y — Accessibility Auditor`

## What it checks

Full WCAG 2.2 compliance matrix (same `computeComplianceMatrix` + `wcag-registry` the
website uses). Only what's actually verifiable from a static Figma file runs as a live
check — contrast (1.4.3), touch-target size (2.5.8), missing image descriptions (1.1.1),
fixed-size text at risk of clipping (1.4.4), and heading-hierarchy signals (2.4.6). Every
other criterion (keyboard, focus, live regions, real reading order, screen-reader
announcement) shows as `manual` — a Figma file cannot verify those, so the plugin says so
rather than a fabricated pass.

## Updating

Rebuild (`npm run build:figma-plugin`), then in Figma: `Plugins` → `Development` →
`ScanA11y — Accessibility Auditor` → right-click → re-import isn't needed, Figma re-reads
`dist/` on each run automatically.

## Publishing to Figma Community

Not done as part of this — publishing is free (no fee, unlike the Chrome Web Store) but
still goes through Figma's review process via the
[developer dashboard](https://www.figma.com/developers). Update `manifest.json`'s
placeholder `"id"` once Figma assigns a real one at that point.
