# P2 Risks — Audit Mode Polish

## R1 — Stale preset badge (UX bug, currently real)
`src/app/audit-config/page.tsx` keeps `activePreset="standard"` after the user toggles a module off. Looks broken; reports lie.
**Mitigation:** task 3 introduces `matchPresetFromSelection`; recompute on every `setSelected`.

## R2 — Required-module toggle no-op is silently violated
`ModuleSelector.toggle` guards required modules client-side, but a parent passing `selected` with `enabled:false` on a required id renders a card that looks disabled with "Required" badge — confusing.
**Mitigation:** task 2 normalizes incoming props (required always on) and adds a unit test asserting `onChange` not emitted for required toggles.

## R3 — Needs-review decision state needs persistence
The new `review` field lives only in-memory if no DB write path exists. SETUP node (Supabase) is still pending — see AUTOPILOT blockers.
**Mitigation:** Store decisions in a module-level map (`src/lib/audit/review-state.ts`) keyed by finding id this phase; promote to Supabase in SETUP. Flag as BLOCKER-IF-ABSENT only if a fixture test tries to read persisted state post-reload (don't write that test yet).

## R4 — Portal sessions binding is fake until SETUP lands
`listPortalSessions()` will be a stub returning fixtures. Real Supabase row-level security + per-user isolation is a SETUP concern.
**Mitigation:** Task 5 stub + fixture tests; clearly comment the seam (`// SETUP: replace with Supabase query`). Do not attempt real DB now. NOT a blocker (fixture path is the verify target).

## R5 — Multi-viewport triples Playwright cost
Responsive scans 3 viewports → ~3x runtime + 3x Chromium contexts on the VM (memory: ~1.8 GB for 3 contexts). On a 4 GB box this collides with the dev server.
**Mitigation:** `src/engine/browser.ts` launches contexts sequentially (never parallel) and `close()`s each before next. Add a soft cap (skip largest viewport if VM mem < 3 GB free) — check via `os.freemem()`. Document in code comment.

## R6 — SSO auth methods are scope creep
`portal-sessions.ts` declares `sso-oidc` / `sso-saml`. Building real SSO now risks scope creep and needs IdP credentials.
**Mitigation:** Task 6 renders SSO options disabled with "coming soon" — no logic. SSO real work is P6 (enterprise shell).

## R7 — Regulation-mapping could miss SCs not yet in registry
`getScRegulationCoverage` only matches SCs present in `REGULATION_MAPPINGS[].mappedScIds`. If the WCAG registry gains new SCs, coverage silently drops.
**Mitigation:** Add a fixture test asserting every `mappedScIds` entry exists in the WCAG registry (`getWcagRegistry()` ids) — fails the suite on drift.

## R8 — Credentials in portal sessions must never reach logs/git
Portal session headers/cookies are secrets.
**Mitigation:** `portal-sessions.ts` types already separate `cookies`/`headers`; ensure the picker/form never logs values (no `console.log`, no `JSON.stringify(session)`); the listing shows name + targetUrl only. Add a test asserting the rendered picker does not contain any raw header value.

## R9 — CHROME_EXECUTABLE_PATH for local verify
E2E task 10 needs `CHROME_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"` per AGENTS.md, or Playwright falls back and may fail on Windows.
**Mitigation:** gate task 10 — skip e2e if env unset, log skip (don't fail the whole phase); unit tests still cover the same surface.

## Not blockers for this phase (credentials)
- No Figma PAT needed (P3).
- No Supabase/Inngest keys needed for fixture paths — only the live URL run is SETUP-gated.