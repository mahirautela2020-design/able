# P1 — Explore Workbench v1: Builder Task Checklist

> Spec: WORKBENCH_VISION.md §2 (items 1,2,3,4,7) + §6 P1 row
> Branch: `phase/p1-workbench` · Gates: `npm run verify` green · browser tests green · **AX-snapshot smoke test**
> Existing assets to extend (NOT rebuild): `components/workbench/workbench.tsx`,
> `components/workbench/ax-tree.tsx`, `lib/sr/snapshot.ts`, `lib/axe/types.ts`,
> `lib/ssrf.ts`, `engine/keyboard.ts`, `engine/axe-scan.ts`.
> P0 results-viewer (filters, findings-list, finding-detail, evidence-viewer,
> snapshots page) is DONE — do not redo it.

## Tasks (WHAT → files → WCAG/feature → test)

1. **Explore fixture page** — `tests/fixtures/explore-demo.html`: same-origin
   page with a low-contrast button, an `<img>` missing alt, a 20×20 link, a
   mis-labelled input, a tab-order quirk. Drives every P1 explore feature
   deterministically. Verify: served by `tests/e2e/util.ts` and loadable by
   Playwright.

2. **Explore mode toggle in shell** — In `components/workbench/workbench.tsx`,
   add a "View / Explore" segmented control. Explore mode replaces the
   findings drawer with the Explore panel (task 3+); View mode keeps today's
   findings list. Verify: `workbench-explore-toggle.spec.ts` switches panes.

3. **Element picker overlay** — New
   `components/workbench/explore/element-picker.tsx`: pointer-events layer
   over the iframe; on hover draw an outline box with element label; on click
   capture a same-origin AX-node + computed style via `postMessage` bridge
   (fixture page exposes a small `__ableInspect` helper). Cross-origin sites
   fall back to disabled picker + "open in new tab" (honest limitation).
   Verify: `workbench-picker.spec.ts` clicks the low-contrast button, picker
   selects it.

4. **Element inspector panel** — New
   `components/workbench/explore/inspector-panel.tsx` showing for the picked
   element: accessible name, role, ARIA attrs, font-size, touch-target size,
   tab-order index, ancestor chain, mapped WCAG SCs (via `lib/wcag.ts` /
   `engine/wcag-registry.ts`). Verify: `workbench-inspector.spec.ts` shows
   role/name for the picked button.

5. **Live contrast meter + one-click fix** — New
   `lib/contrast.ts` (`ratio(fg,bg)`) + `components/workbench/explore/contrast-fix.tsx`:
   shows "4.2:1 — fails AA (needs 4.5:1)"; "Fix" button applies a suggested
   darker color to the picked element in-session (postMessage patch), re-runs
   ratio, shows green. Export CSS snippet. Maps 1.4.3/1.4.11. Verify:
   `workbench-contrast-fix.spec.ts` fixes the button → ratio ≥ 4.5 → green.

6. **Keyboard replay** — New
   `components/workbench/explore/keyboard-replay.tsx`: Play/Pause, step
   forward/back, numbered focus rings drawn over iframe; reuses
   `engine/keyboard.ts` `tabSequence` shape (run against fixture via a
   `lib/explore/keyboard-probe.ts` injected bridge). Live flags:
   focus-trap, missing focus style, tab-order mismatch. Maps 2.1.2/2.4.3/2.4.7.
   Verify: `workbench-keyboard-replay.spec.ts` steps forward and renders ≥1
   numbered ring.

7. **Color-blind simulation overlays** — New
   `lib/cvd.ts` (protanopia/deuteranopia/tritanopia/achromatopsia matrices via
   colorjs.io) + `components/workbench/explore/cvd-overlay.tsx`: viewport
   filter dropdown + recompute every visible contrast pair under the
   simulation, flagging pairs that pass normal but fail under CVD. Maps 1.4.3.
   Verify: `workbench-cvd.spec.ts` selects deuteranopia, a pair flips to fail.

8. **ARIA tree panel (interactive)** — Wire existing
   `components/workbench/ax-tree.tsx` to the live picker: clicking a node
   highlights the corresponding element in the iframe; data from
   `lib/sr/snapshot.ts` `captureAriaSnapshot` run against the fixture via a
   server route `app/api/explore/ax-snapshot/route.ts` (SSRF-guarded by
   `lib/ssrf.ts` `validateHost`). Verify: `workbench-ax-tree.spec.ts` clicks a
   node → element highlights. **This is the AX-snapshot SMOKE GATE.**

9. **Explore smoke test** — `tests/e2e/explore-smoke.spec.ts`: open workbench
   → toggle Explore → pick the low-contrast button → see inspector + contrast
   fail → apply fix → green → open ARIA tree → click node → element
   highlights. Runs against `next start`. Wire into `npm run verify`.

## Rules
- LLM never creates findings; evidence-first; pinned axe-core 4.13 (ENTERPRISE_SPEC §2).
- Stay in §2 P1 scope — NO flow recorder, NO session manager, NO audit modules, NO export (later phases).
- Cross-origin sites: degrade honestly (disabled picker, "open in new tab"). Same-origin fixture is the demo path.
- Reuse `lib/ssrf.ts` for ANY URL input (route in task 8). Never bypass.