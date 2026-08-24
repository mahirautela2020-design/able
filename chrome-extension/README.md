# ScanA11y Chrome Extension

A side panel that audits the currently open tab (WCAG 2.2 compliance
matrix), inspects individual elements, and applies the full accessibility
options panel — no login, no history stored, no server calls. Built with
the same React + shadcn components and WCAG-mapping logic as the website,
not a re-implementation.

## Build it

Run from the repo root (needs the main app's `node_modules`):

```bash
npm run build:extension
```

This runs three separate Vite builds into `chrome-extension/dist/`:

- the side panel (a normal React app, ES modules)
- `content-script.js` (IIFE — injected on demand via `chrome.scripting`)
- `background.js` (IIFE — the MV3 service worker)

`chrome-extension/dist/` is gitignored; rebuild after pulling changes.

## Load it (unpacked, for local testing)

Chrome doesn't let you install from source without going through the Chrome
Web Store review — while developing, load it as an "unpacked" extension:

1. `npm run build:extension`
2. Open `chrome://extensions`
3. Toggle **Developer mode** on (top right)
4. Click **Load unpacked**
5. Select this `chrome-extension/` folder (not `dist/` — the folder with `manifest.json`)
6. Click the ScanA11y toolbar icon to open the side panel (it stays open while you browse, unlike a popup)

## Architecture

- **Side panel** (`src/sidepanel/`) — React, imports the real
  `Button`/`Card`/`Badge`/`Tabs`/`Accordion` components and the actual
  `AccessibilityOptionsPanel` directly from `../src` (the main app) via a
  Vite `@` alias. Same design system, same component, not a copy.
- **Content script** (`src/content-script.ts`) — injected on demand
  (`activeTab` + `scripting`, never always-on) into the active tab. Owns
  everything that needs direct DOM access: click-to-inspect, contrast
  pairs, the accessibility-profile CSS/DOM logic, a native keyboard/
  focus-order walkthrough, and running axe-core. Talks to the side panel
  over `chrome.runtime` messaging (async — the side panel is a separate
  execution context from the page, not an iframe).
- **Background** (`src/background.ts`) — MV3 service worker; its only job
  is `chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true})`.

## What each tab does

- **Audit** — runs axe-core (vendored, no network fetch) plus a native
  keyboard/focus-order walkthrough directly in the tab, then presents the
  same WCAG compliance-matrix report the web app's workbench does
  (`extractFindings` + `computeComplianceMatrix` + the real
  `wcag-registry`, reused verbatim from `src/engine/`) — grouped by
  principle, pass/fail/needs-review/manual per criterion, plus a findings
  list with "Highlight on page".

  Playwright (used server-side for the web app's keyboard walkthrough)
  can't run inside a content script — it's a Node library that drives a
  browser externally. The native walkthrough here replicates the same
  checks (missing focus indicator, unreachable elements) via direct
  `.focus()` calls against the real live page instead.

- **Inspect** — click-to-inspect (the content script owns the on-page
  hover/click overlay and pushes the result back), real contrast-ratio
  verdicts via `src/lib/contrast.ts`, a focus-order walkthrough with step
  controls, and a contrast-pairs scan across the page.

- **Accessibility** — the actual `AccessibilityOptionsPanel` component
  (`variant="inline"`), full feature set: 9 profiles, color, text,
  content, accessibility aids, screen reader (read aloud), voice support,
  orientation. `onApply`/`onScroll`/`onGetPageText` are wired through the
  content-script bridge instead of postMessage to a same-origin iframe.

## Publishing to the Chrome Web Store

Not done as part of this — that requires a Chrome Web Store developer
account (one-time $5 registration fee) and submitting through the
[developer dashboard](https://chrome.google.com/webstore/devconsole) for
review. Run `npm run build:extension` and zip the `chrome-extension/`
folder (manifest + `dist/` + `icons/` + `vendor/`) once you have that
account.
