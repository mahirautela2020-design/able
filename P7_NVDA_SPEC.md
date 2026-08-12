# P7 — NVDA Screen Reader Automation (local Windows)

> Scope: automate NVDA (free, Windows-only) for real screen-reader verification of
> audited pages. This is the "automated SR testing" gap every commercial tool avoids.

## Why it matters
NVDA/JAWS/VoiceOver behavior (announcement order, live regions, focus announcements)
is not automatable in any commercial auditor. We can be first-mover *locally*: drive
NVDA via its ControllerClient API against the audited page in Chrome, capture what
NVDA announces, and diff it against expectations.

## What to build
1. **`src/lib/sr/nvda-driver.ts`** — Node driver for NVDA's ControllerClient:
   - detect NVDA install (`NVDA_PATH` env or default Program Files locations)
   - `nvdaControllerClient` IPC over named pipe (`\\.\pipe\nvdaControllerClient`)
     — speak, get spoken-text via NVDA's output capture, `nvdaController_speakText`
   - if NVDA absent → return `{ available: false }` (never crash the audit)
2. **`src/lib/sr/nvda-snapshot.ts`** — capture NVDA's spoken output for a page:
   - run the page in Playwright Chrome (existing `withPage`), focus elements in
     tab order, call speak, capture announcements, timestamp them
3. **`src/lib/sr/nvda-checks.ts`** — deterministic checks on the announcement log:
   - every interactive element announces *something* (name not empty)
   - heading announces role (heading level in announcement)
   - focus order announcements match DOM tab order (compare with keyboard.ts results)
   - ALL results go to `needs_review` bucket — NVDA behavior varies by version;
     only obvious silent-elements become findings
4. **`/api/audits/[id]/nvda`** route — POST triggers local NVDA run; returns
   announcements + suggestions. Guarded: only works when NVDA installed locally
   (serverless returns `{ available: false }` — documented limitation)
5. **Tests** — `tests/nvda-checks.test.ts` with a **fake announcement log** fixture
   (no NVDA needed in CI): verify silent-element detection, heading-role parsing,
   focus-order matching. Browser test skipped when NVDA absent.

## Acceptance
- `npm run verify` green; new tests pass with fixture data
- NVDA driver returns `{ available: false }` gracefully without NVDA
- Workbench shows a "Screen reader (NVDA)" panel listing announcements when
  available locally, else an honest "run locally with NVDA installed" note
- No LLM involvement — deterministic checks only

## Risks
- NVDA ControllerClient is Windows/named-pipe only → the driver must degrade
  gracefully on non-Windows/serverless (feature-detect first)
- NVDA speech output capture varies by version → only flag *silent* elements,
  never assert exact phrasing
- Named-pipe IPC from Node: keep timeouts (3s) so a hung NVDA never blocks an audit
