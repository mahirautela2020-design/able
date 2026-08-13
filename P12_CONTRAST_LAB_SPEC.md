# P12 — Contrast Lab

## Goal
Turn the Explore workbench's existing live-contrast tooling (built in P1) into a real
**Contrast Lab**: click-to-inspect contrast on the *actual audited page* (not just the
bundled same-origin demo fixture), add APCA perceptual contrast alongside WCAG 2.x,
let the AA/AAA target for "nearest passing fix" be chosen explicitly, and persist a
flagged contrast pair as a real finding (1.4.3 / 1.4.11) with crop evidence in the
findings table — so Contrast Lab output shows up in the report, not just the live
session.

## What already exists (P1) — reuse, do not rebuild
- `src/lib/contrast.ts` — `contrastRatio`, `contrastVerdict` (AA/AAA, normal/large),
  `suggestFix` (binary-search nearest passing foreground, AA_NORMAL default only).
- `src/lib/cvd.ts` — `simulateCvd`, `flagCvdFailures`, `CVD_FILTERS` for
  protanopia/deuteranopia/tritanopia/achromatopsia.
- `src/components/workbench/explore/contrast-fix.tsx`, `cvd-overlay.tsx`,
  `element-picker.tsx`, `inspector-panel.tsx` — live single-element contrast readout
  + full-page CVD filter overlay (`document.body.style.filter`, see
  `public/explore-demo.html` `setFilter`), driven by a `window.__ableInspect` bridge
  object the page must expose (`inspect/focusables/contrastPairs/patch/highlight/
  focusEl/setFilter`).
- **Gap:** `ExplorePanel` iframes `audit.target_url` directly
  (`src/components/workbench/explore-workbench.tsx`, `ExplorePanel`
  `<iframe src={targetUrl}>`). Real external sites are cross-origin →
  `__ableInspect` is unreachable → the picker degrades to a "cannot inspect,
  open in new tab" banner. Explore mode today only truly works against the bundled
  `public/explore-demo.html` fixture. `src/app/api/preview-proxy/route.ts` already
  solves XFO/CSP framing for the read-only preview elsewhere in the app but is not
  wired into Explore, and it does not inject the inspect bridge.

## Deliverables
1. **Shared bridge script** — extract the `__ableInspect` bridge JS (currently
   inline in `public/explore-demo.html`) into `src/lib/explore/bridge-script.ts`
   exporting it as a string constant (`ABLE_INSPECT_BRIDGE_SCRIPT`). Keep
   `public/explore-demo.html` working unchanged (either it stays static and the
   constant is just reused server-side, or it is regenerated to include the shared
   constant at build time — do not break `tests/explore-fixture.test.ts` or any
   existing Explore behavior).
2. **Wire the bridge into the proxy** — `src/app/api/preview-proxy/route.ts`: after
   fetching and rewriting the upstream HTML, inject
   `<script>${ABLE_INSPECT_BRIDGE_SCRIPT}</script>` before `</body>` so any proxied
   page exposes `window.__ableInspect`, same contract as the demo fixture. Keep the
   existing SSRF guard, size cap, and CSP/XFO handling untouched.
3. **Explore uses the proxy** — `ExplorePanel` (or its caller) points the iframe
   `src` at `/api/preview-proxy?url=<encoded targetUrl>` instead of the raw URL.
   Keep the existing "cannot inspect, open in new tab" banner for cases the proxy
   itself rejects (non-HTML, >5MB, SSRF-blocked, upstream error) — this is a
   graceful-degradation path, not a hard requirement to fix every site.
4. **APCA** — new `src/lib/apca.ts` implementing the APCA-W3 perceptual contrast
   algorithm (public formula; hand-rolled, no external dependency — stays inside
   the OSS-only / zero-paid-API rule). Export `apcaContrast(textHex, bgHex): number`
   (signed Lc, -108..107) and a small verdict helper. Label it in the UI as
   **informational** — WCAG 2.x AA/AAA (`contrastVerdict`) remains the enforced
   pass/fail criterion; APCA is not an official WCAG 2.2 requirement, so never
   present an APCA-only pass/fail as a hard finding.
5. **Target selector for nearest-fix** — extend `suggestFix` call sites (or
   `suggestFix` itself, backward-compatible) so the Contrast Lab UI lets the user
   pick AA vs AAA and normal vs large text before computing the nearest passing
   shade (today it's hardcoded to `AA_NORMAL`). Update `contrast-fix.tsx` with a
   small target toggle.
6. **CVD overlay parity check** — confirm the full-page filter overlay
   (`setFilter`) still works through the new proxy path (bridge is injected the
   same way); no rebuild needed, just verify with a test.
7. **Persist a contrast finding** — new route
   `src/app/api/audits/[id]/contrast-finding/route.ts` (POST):
   - body: `{ pageId?: string, selector: string, elementHtml?: string, fg: string, bg: string, bbox: {x,y,width,height} }`
   - server re-navigates to the page URL with `withPage` (reuse `src/engine/browser.ts`),
     takes a screenshot, crops the bbox region with `sharp` (same pattern as
     `src/inngest/functions/audit-url.ts` lines ~199-267), uploads the crop via
     `uploadEvidence` (`src/lib/supabase/server.ts`).
   - computes `contrastRatio`/`contrastVerdict` server-side from the posted colors
     (do not trust a client-computed ratio) and picks `wcag_criterion`: `1.4.3` if
     the element has non-empty text content, else `1.4.11`.
   - inserts one row via `insertFindings`: `bucket: "automated"`,
     `source_engines: ["contrast-lab"]`, `confidence: 1`, `severity` from the
     verdict, `screenshot_crop_url` from the upload, `evidence` jsonb carries
     `{ fg, bg, ratio, apcaLc }`.
   - resolve `pageId` by matching `audit_pages.page_url` to the current Explore
     target when not supplied; 404 if the audit doesn't exist.
8. **"Flag finding" button** in `contrast-fix.tsx` next to the existing "Apply fix"
   button, calling the new route and showing a success/error toast (`sonner`,
   already a dependency). Disable re-flagging the same selector twice in one
   session (client-side only).
9. **Tests** (`npx vitest run`):
   - `tests/apca.test.ts` — pure-function Lc values against known reference pairs
     (black-on-white, white-on-black, a mid-gray pair), monotonicity sanity checks.
   - extend `tests/contrast.test.ts` (or add `tests/contrast-fix-target.test.ts`)
     for `suggestFix` with AAA + large-text targets.
   - `tests/phase-p12-contrast-finding.test.ts` — route-level test for
     `contrast-finding/route.ts` (mock `withPage`/Supabase the same way other
     route tests in this repo do; assert the inserted row picks 1.4.3 vs 1.4.11
     correctly and that the ratio is server-computed, not trusted from the client).
   - a bridge-injection test confirming `preview-proxy` output contains the
     `__ableInspect` script tag.

## Acceptance
- `npx tsc --noEmit` clean
- `npx vitest run` — all new P12 tests pass, full suite green (>= 446 passing)
- `npm run build` succeeds
- Local E2E: run an audit on a real external URL, open Explore, click an element on
  the *actual* page (via the proxy) → live WCAG ratio + APCA Lc shown, "flag finding"
  persists a row in `findings` with a real crop URL, visible back in the report view.
- No paid APIs, no new external dependencies for APCA, deterministic (same colors →
  same Lc/ratio every time).

## Out of scope (future)
- Full-page automated contrast sweep (scanning every text node without a click) —
  axe-core's `color-contrast` rule already covers this in the batch pipeline; P12 is
  the interactive/manual lab, not a new automated engine.
- APCA as a hard pass/fail gate in the compliance matrix (WCAG 3.0 territory —
  revisit once APCA is normative, not just informational).
- Gradient/image-background contrast estimation (stays `needs_review` via axe, as today).
