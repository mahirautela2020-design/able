# P11 — Deterministic Browser Screen-Reader Engine (AX-tree based)

## Goal
Add a **server-side, deterministic screen-reader engine** that emulates what NVDA/JAWS read — built on the browser accessibility (AX) tree via Playwright, NOT a flaky out-of-process driver. This is the key differentiator vs axe/Lighthouse (single-page DOM heuristics) and vs NVDA/JAWS (Windows-only, non-CI).

## Why
- NVDA automation is Windows-only, out-of-process, flaky on CI (proven in P7).
- The deterministic core of a screen reader is the **accessibility tree** — `page.accessibility.snapshot()` in Playwright exposes it headlessly on Vercel.
- Lets users *experience* SR output in the workbench and catches bugs DOM heuristics miss (empty accessible names, reading order, live regions).

## Deliverables
1. **`src/engine/ax-tree.ts`** — capture AX snapshot per page via `page.accessibility.snapshot({ interestingOnly: false })`; normalize to a flat list of nodes: `{ role, name, description, level, value, checked, disabled, expanded, isVisible, rect, focusable }`. Guard with try/catch + 15s timeout.
2. **`src/engine/sr-speech.ts`** — convert a normalized AX node into the speech string an SR would emit (following ARIA Authoring Practices / NVDA conventions):
   - button/link: `"name, button"` / `"link"`
   - headings: `"heading level N, name"`
   - checked states: `"checkbox, checked"` / `"checked state"`
   - combo/expand: `"name, combo box, collapsed/expanded"`
   - focusable with empty accessible name → emit a **4.1.2 Name-Role-Value finding** (deterministic).
3. **`src/engine/ax-checks.ts`** — deterministic checks from the AX tree:
   - **Empty accessible name** on focusable controls → 4.1.2 (serious)
   - **Button vs link role mismatch** vs DOM tag → 4.1.2
   - **Reading order** — AX document order vs visual order (bounding-box y/x sort) diverges → 1.3.2 Meaningful Sequence (needs_review)
   - **Duplicate labels** for same-name links/buttons in a region → 2.4.4/2.4.7 (needs_review)
4. **Wire into `audit-url.ts`** — in `scan-page-N`, after `runAxe`, call `captureAxTree` + `runAxChecks`; merge the new findings into the page's finding set (engines list gains `"ax"`). Keep per-page deadline.
5. **`src/components/workbench/sr-preview.tsx`** — an "SR Preview" panel in the workbench right side: tab that streams the speech transcript for the first page's AX nodes (heading/list/button/link sequence) with a play button + "read from top". Data from a new lightweight `/api/audits/[id]/sr-preview` route returning ordered speech lines for page 0.
6. **Tests** (`tests/ax-tree.test.ts`) — fixture AX JSON → ax-checks: empty name flagged, reading-order divergence flagged, valid tree → no findings. Run via `npx vitest run`.

## Acceptance
- `npx tsc --noEmit` clean
- `npx vitest run` — all new ax tests pass, full suite green (>=436 passing)
- `npm run build` succeeds
- Local E2E: audit a small site (e.g. example.com), workbench SR Preview shows a readable speech transcript; findings DB contains `ax`-engine findings for any unlabeled controls.
- No paid APIs, no out-of-process deps, deterministic (same page → same transcript).

## Out of scope (future)
- Full virtual cursor/rotor simulation
- Voice synthesis playback
- Reading-order auto-fix suggestions
