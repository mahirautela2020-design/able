# ScanA11y Figma plugin — design

## Context

ScanA11y already ships a website (server-side audits, axe-core + Playwright) and a Chrome
extension (client-side, reuses website components/logic via a `@` alias into `src/`). The
user wants a third surface: a Figma plugin that audits frames/layers in the currently open
Figma file, screenshots flagged nodes, writes a full 16:9 report back into the file itself,
and lets the user click a finding to jump to it on the canvas.

Per the user's explicit standing scope for all three non-website tools (SDK/widget, Chrome
extension, Figma plugin): **no login, no history stored, no server calls**. The Figma
plugin audits Figma files only — not URLs, screenshots, APKs, or IPAs (those stay web-app-only).

## Why this can't reuse axe-core

axe-core operates on a live DOM. A Figma file has no DOM — it's a scene graph of frames,
components, text nodes, vectors, and their geometry/paint properties, accessed through the
Figma Plugin API (`figma.currentPage`, `node.fills`, `node.exportAsync()`, etc.). Every
finding in this plugin is produced by a purpose-built inspector reading those node
properties directly — there is no server round-trip, no reuse of axe-core, and no
alternative architecture that avoids this (a "send node data to our backend for
processing" option was considered and rejected: it would violate the no-login/no-server
scoping for zero real benefit, since these checks are geometry/color math the Plugin API
already exposes locally).

## Architecture

Figma plugins run in two separate JS contexts with no shared memory, communicating only via
`postMessage`:

- **`code.ts` (main/plugin thread)** — has `figma.*` API access (scene graph, selection,
  viewport, `exportAsync`). No DOM. This is where every inspector runs and where the report
  frames get created.
- **UI iframe** (`ui/` — a Vite-built React app) — has a real DOM, but zero `figma.*`
  access. Renders the audit report, contrast/inspect panels, and options. Sends action
  requests (`run-audit`, `highlight-node`, `generate-report`, ...) to `code.ts` via
  `figma.ui.postMessage` / `window.onmessage`, same as the browser extension's
  side-panel ↔ content-script split.

This mirrors the existing extension's `tab-bridge.ts` ↔ `content-script.ts` split closely
enough that the UI-side React app can reuse the same presentational components
(`Accordion`, `Badge`, `Card`, `computeComplianceMatrix`, `wcag-registry`) from `src/` via a
`@` alias, exactly like `chrome-extension/vite.config.ts` already does. Only the "talk to
the real page/file" plumbing differs (a `figma-bridge.ts` replacing `tab-bridge.ts`).

```
figma-plugin/
  manifest.json          # Figma plugin manifest: main=dist/code.js, ui=dist/ui.html
  code.ts                 # main thread: scene-graph walk, inspectors, report writer
  ui/
    index.html
    App.tsx                # tabs: Audit / Inspect / Report (reuses website components)
    lib/figma-bridge.ts     # postMessage request/response wrapper (async, like tab-bridge.ts)
  vite.config.ts            # builds ui/ -> dist/ui.html (base:"./", publicDir:false, @ alias -> ../src)
  vite.code.config.ts       # builds code.ts -> dist/code.js (IIFE, Figma plugin sandbox target)
  tsconfig.json              # types: ["@figma/plugin-typings"]
```

## Audit scope (user-selected, at run time)

Two modes, chosen via a toggle in the UI before running:

- **Current selection** — audits exactly the nodes the user has selected on canvas
  (`figma.currentPage.selection`). If nothing is selected, the UI disables this option.
- **Current page** — audits every top-level frame on `figma.currentPage`.

Whole-file (all pages) is explicitly out of scope for v1 — large files make this slow and
the report unwieldy; the two supported modes cover the realistic use cases (reviewing one
screen you're working on vs. sweeping everything on the page you have open).

## Checks — the WCAG matrix, Figma-appropriate subset live, rest marked manual

Per the user's decision: show the same 4-principle WCAG compliance matrix
(`computeComplianceMatrix` + `wcag-registry`, reused verbatim) as the website/extension. For
each SC:

**Live (automated) checks:**

| SC | Check | How |
|---|---|---|
| 1.4.3 / 1.4.6 / 1.4.11 | Text/non-text contrast | Walk text nodes; resolve the nearest solid or gradient-averaged fill behind each (own fill if opaque, else parent chain). Reuse `contrastRatio`/`contrastVerdict` from `src/lib/contrast.ts` verbatim. |
| 2.5.5 / 2.5.8 | Touch target size | Bounding box (`node.width`/`node.height`) of nodes that look interactive (component instances/frames named or typed like button/icon-button/link/tab) against the 24px minimum, same threshold as the extension's Inspect tab. |
| 1.1.1 | Non-text content (alt/description) | Image-fill or vector nodes still carrying Figma's auto-generated default name (`Rectangle 123`, `Vector`, `Image 4`, etc.) — flagged as likely missing a real accessible description. |
| 1.4.4 | Resize text | Text nodes set to fixed-size (not auto-width/auto-height) that are already near-full of their box — flagged as at risk of clipping if text is translated or scaled. |
| 1.3.1 / 2.4.6 | Info & relationships / headings | Text styled like a heading (large + bold, or literally named "Heading"/"H1"–"H6") with no distinguishable style hierarchy nearby; generic unnamed layers under a frame (bad handoff/semantic signal). |

**Marked `manual` in the matrix** (with a one-line reason, same `manual` bucket the website
already uses for e.g. VoiceOver checklist items): every criterion that requires real
interactivity — keyboard operation, focus order/visibility, live regions, actual
screen-reader announcement, reading order as experienced (not just layer order), timing,
gestures. A static file cannot verify these; the plugin says so rather than silently
passing or hiding them.

## Highlight

Clicking a finding sets `figma.currentPage.selection = [node]` and calls
`figma.viewport.scrollAndZoomIntoView([node])`. No synthesized overlay is needed — Figma's
own selection outline is the highlight, unlike the browser extension (which had to draw its
own overlay div since the page has no concept of "this is selected by our tool").

## Screenshots

`await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } })` per
flagged node, called from `code.ts` (the only context with `exportAsync`). Returns raw PNG
bytes directly — no capture quota, no permission errors, no viewport/scroll dependency (unlike
`chrome.tabs.captureVisibleTab`, which the extension had two real production bugs on this
session). This is the one place the Figma plugin is strictly easier than the browser
extension.

## Report generation

On "Generate report":

1. `code.ts` creates a new Figma page named `ScanA11y Report` (or reuses one if already
   present and empty — see Open Question below) via `figma.createPage()`.
2. One 1280×720 auto-layout frame per finding, appended top-to-bottom on that page:
   - Title (rule/criterion name) + severity badge + WCAG SC/level badge.
   - The exported PNG placed as an image fill inside a bordered rectangle (screenshot
     evidence, same visual language as the PDF report's evidence pages).
   - A recommendation text block (plain-language fix guidance per check, hand-written per
     inspector — there's no axe `failureSummary` to borrow from since these aren't axe
     rules).
3. A cover frame (also 1280×720) at the top: file name, page/selection audited, WCAG score,
   pass/fail counts, generation timestamp.
4. `figma.currentPage = reportPage` and zoom-to-fit at the end, so the user lands on the
   finished report immediately.

This is a native, editable, permanent part of the Figma file — not an exported PDF. A PDF/
image export of the report page is a reasonable future add-on (Figma supports exporting a
page as one flattened export) but is out of scope for v1: the user asked for the report
placed in the file, not exported out of it.

## UI reuse

Same posture as the extension: real `Card`/`Badge`/`Accordion`/`Tabs` components and
`computeComplianceMatrix`/`wcag-registry` imported from `src/` via a `@` alias in
`figma-plugin/vite.config.ts`, not re-implemented. `contrastRatio`/`contrastVerdict` reused
verbatim from `src/lib/contrast.ts`.

## Distribution

Figma Community publishing is free (no fee, unlike the Chrome Web Store) but still goes
through review. Ship v1 for **local/dev-mode use first**: Figma desktop app →
`Plugins → Development → Import plugin from manifest…` → point at
`figma-plugin/manifest.json`. This is the direct equivalent of the extension's
"load unpacked" flow and requires no account, no fee, no review — usable immediately after
building. Community publishing is a separate, later step if wanted (same phased approach
already used for the extension: ship free-and-immediate first).

The website should get a `/figma-plugin` page mirroring `/extension` — install steps +
(once packaged) a downloadable zip of the plugin folder — once this is built and verified.

## Non-goals (explicit, to prevent scope creep)

- No login, no account, no history/persistence across sessions (matches the standing
  cross-tool scoping decision).
- No network calls of any kind — everything computed from the scene graph already loaded in
  the user's open file.
- No whole-file (all-pages) audit mode in v1.
- No PDF/image export of the generated report page in v1.
- No attempt to simulate keyboard/focus/screen-reader behavior — those stay `manual`.

## Open questions to resolve during planning (not blocking design approval)

1. **Re-running a report**: if `ScanA11y Report` page already exists, does re-running
   append a new report (timestamped frames) below the old one, or clear and replace it?
   Recommendation: replace (delete previous ScanA11y-generated frames, identified by a
   plugin-set `pluginData` marker, before writing new ones) — avoids the report page growing
   unbounded across repeated runs, and matches "current state of the file" semantics rather
   than a history log (consistent with "no history stored").
2. **Component instances**: should auditing a component instance also flag issues inherited
   from its main component (likely to produce duplicate findings across every instance), or
   audit main components once and skip instances? Recommendation: audit main components once
   when present in scope, and instances only when their main component isn't itself in the
   audited scope — avoids duplicate noise. To be finalized in the implementation plan once
   the node-walking code makes the trade-off concrete.
