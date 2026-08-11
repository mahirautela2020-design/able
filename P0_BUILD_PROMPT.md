# P0 Build Prompt v3 — Engine Core (Vercel + Supabase + Inngest + shadcn/ui)

> Hand this to Claude Code. Builds the P0 of the accessibility auditor "Able" on YOUR
> personal infra: Vercel (Hobby) · Supabase (free) · Inngest (free) · @sparticuz/chromium ·
> shadcn/ui. You own the IP. P0 is 100% deterministic — no LLM calls.
> v3 incorporates the pre-build critique (Kimi K3, 2026-08-07): step-payload limits,
> SSRF guard, WCAG level correction, quota discipline, RLS, retry idempotency.

---

## 1. Mission

Build the engine core of an enterprise WCAG accessibility auditor deployed on:

- **Vercel** (Hobby — 60s function limit) for the Next.js app
- **Supabase** (free tier) for Postgres + storage
- **Inngest** (free tier) for background queue — each page-scan is one Inngest step
- **@sparticuz/chromium** for headless browsing on Vercel
- **shadcn/ui** for the design system

Scope: URL audits only. User submits a URL → Inngest picks up the job → crawls up to
5 pages → each page **settles** (never scanned at `domcontentloaded`) → axe-core +
keyboard walkthrough → findings normalized with evidence → Supabase → annotated HTML
report with WCAG 2.2 compliance matrix.

## 2. Hard rules (violating any of these = failure)

1. **Never scan before the page settles.** Settle sequence in §5.3 verbatim.
2. **axe-core from node_modules only** — pin 4.13.x, inject via
   `page.addScriptTag({ content })`. No CDN. No other axe version.
3. **Surface axe `incomplete`** as `needs_review` — never drop or hide.
4. **WCAG mapping:** every WCAG-mapped finding maps to **≥1 registry SC** (store
   `wcag_criteria text[]` + a designated primary). **Best-practice findings carry
   `wcag_criterion = null` and `bucket 'best-practice'`** — the column is nullable.
   Derive rule→SC mapping **programmatically from the installed axe-core's rule
   metadata (tags)** — never hand-write it. See §5.5.
5. **Evidence-first:** every *element* finding has ruleId + criterion + selector +
   screenshot crop. *Behavior* findings (keyboard) attach the full-page screenshot +
   `evidence.sequence` — a focus trap is a sequence, not a crop.
6. **No LLM calls in P0.** Pure deterministic engines.
7. **Vercel-compatible:** no local writes outside `/tmp`; `/tmp` is **per-instance and
   NOT shared between Inngest steps** — never pass artifacts via `/tmp` between steps;
   functions finish within 60s.
8. `npm run verify` (lint + typecheck + test + build) must pass.
9. **No Buffer/large result crosses an Inngest step boundary.** All artifacts
   (screenshots, crops) upload to Supabase Storage *inside* the step; steps return
   only small JSON summaries. See §5.9.
10. **Idempotent steps:** delete-then-insert per page; deterministic Storage paths so
    retries overwrite, never accumulate. See §5.9.

## 3. Repo layout

```
<fresh dir>/
  package.json · tsconfig.json · next.config.ts · tailwind.config.ts
  components.json · inngest.json
  .env.local
  src/
    engine/
      browser.ts          # sparticuz chromium launch, screenshot
      axe-scan.ts         # axe injection + run + bbox + per-node findings
      keyboard.ts         # keyboard walkthrough (bounded, honest)
      normalize.ts        # engine output → canonical findings
      wcag-registry.ts    # full WCAG 2.2 SC registry (86) + programmatic axe mapping
      crawl.ts            # discovery: sitemap + links, cap 5, SSRF-safe
    inngest/
      client.ts
      functions/
        audit-url.ts      # step-per-page, side-effecting, retention cron
    app/
      layout.tsx
      page.tsx            # submit form + recent audits (shadcn)
      api/
        audits/route.ts           # POST (SSRF guard + rate limit)
        audits/[id]/route.ts      # GET status/progress
        audits/[id]/report/route.ts  # GET report (signed evidence URLs)
        inngest/route.ts          # export const maxDuration=60; runtime='nodejs'; memory=3008
        health/route.ts           # cheap select — keeps Supabase free project awake
    components/
      ui/                 # shadcn: button, input, card, badge, table, tabs, accordion, toast, progress
      AuditForm.tsx · AuditList.tsx · ReportViewer.tsx
    lib/
      supabase/server.ts  # service-role client ONLY — no browser DB client exists
      report.ts           # JSON + HTML report builder (Storage URLs, never base64)
    tests/
      fixtures/csr-test.html · fixtures/focus-trap.html
      settle-scan.test.ts · keyboard.test.ts · contrast-pairs.test.ts
      wcag-registry.test.ts · normalize.test.ts
```

**Browser DB client does not exist.** Every read/write goes through `/api/*` Route
Handlers using the service-role client. This is what makes future SSO/RBAC a
middleware concern instead of a data-layer rewrite.

## 4. Database — Supabase (free tier)

SQL Editor script (all three tables **RLS enabled, ZERO policies** — deny-all to anon;
the API layer uses the service role):

```sql
-- RLS: alter table ... enable row level security; (no policies = anon denied)

CREATE TABLE audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,                          -- nullable, P6
  created_by uuid,                         -- nullable, P6
  target_url text NOT NULL,
  status text NOT NULL DEFAULT 'queued',   -- queued|running|complete|failed
  config jsonb NOT NULL DEFAULT '{}',      -- { maxPages, targetLevel, viewport }
  progress jsonb NOT NULL DEFAULT '{}',    -- { pagesTotal, pagesDone, currentPage, updatedAt }
  report_path text,                        -- Storage object key (NOT inline HTML)
  error_code text,                         -- CRAWL_FAILED|PAGE_TIMEOUT|BOT_BLOCKED|AXE_CRASH|STORAGE_QUOTA|UNKNOWN
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE audit_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  page_url text NOT NULL,                  -- canonicalized: post-redirect page.url()
  page_title text,
  status text NOT NULL DEFAULT 'pending',  -- pending|scanned|failed
  wcag_score numeric,                      -- formula in §5.7
  axe_version text,
  consent_dismissed boolean,
  settled_at_ms int,                       -- telemetry
  networkidle_timed_out boolean,           -- telemetry
  error_code text,
  evidence jsonb NOT NULL DEFAULT '{}',    -- timings etc.
  scanned_at timestamptz
);

CREATE TABLE findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  page_id uuid REFERENCES audit_pages(id) ON DELETE CASCADE,
  bucket text NOT NULL,                    -- automated | needs_review | behavior | best-practice
  rule_id text NOT NULL,
  rule_title text,
  wcag_criteria text[],                    -- ≥1 for WCAG-mapped; [] for best-practice
  wcag_criterion text,                     -- primary (nullable — best-practice findings)
  wcag_level text,
  principle text,
  severity text,                           -- critical|serious|moderate|minor
  confidence numeric NOT NULL,
  source_engines text[] NOT NULL,
  selector text,
  element_html text,
  failure_summary text,
  additional_instances int NOT NULL DEFAULT 0,  -- "and 9 more" honesty
  screenshot_crop_url text,
  full_screenshot_url text,
  recommendation text,
  evidence jsonb NOT NULL DEFAULT '{}',    -- { target, impact, tags, helpUrl, sequence? }
  engine_version text,                     -- nullable, auditability
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_findings_audit ON findings(audit_id);
CREATE INDEX idx_findings_sc ON findings(wcag_criterion);
```

**Storage bucket `evidence`: PRIVATE** (not public). The API generates short-lived
signed URLs at report-render time. Random UUID paths (`<auditId>/<pageIndex>-<ruleId>-<n>.webp`).

`.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...            # REQUIRED — Inngest Cloud signs /api/inngest calls
MAX_PAGES=5
```

`next.config.ts`: add `sharp` and `@sparticuz/chromium` to `serverExternalPackages`
(output tracing drops sharp's native binary otherwise → MODULE_NOT_FOUND only on Vercel).
Keep the Inngest route's import graph minimal — engine modules imported only from the
Inngest function, never from UI routes (bundle-size: Chromium ≈ 70MB compressed,
Next + playwright-core + sharp ≈ near the 250MB unzipped function limit).

## 5. Build steps

### 5.1 Scaffold
`create-next-app` (TS, App Router, Tailwind) + `npx shadcn@latest init` (neutral,
CSS variables). Components: button, input, card, badge, table, tabs, accordion,
toast/sonner, progress. Deps: `@supabase/supabase-js`, `inngest`, `@sparticuz/chromium`,
`playwright-core`, `axe-core@4.13.x`, `colorjs.io` (P1 dependency — the
`contrast-pairs.test.ts` validates it now), `sharp`, `lucide-react`, `clsx`,
`tailwind-merge`. Scripts: dev, build, start, lint, typecheck, test, verify,
`inngest:dev` (`inngest dev` — makes the route testable locally).

### 5.2 Browser (`src/engine/browser.ts`)
`launchBrowser()`: on Vercel → `@sparticuz/chromium` (args + executablePath + headless);
locally → `CHROME_EXECUTABLE_PATH` or Playwright chromium. Per-job `newContext()`
(1440×900, real UA: `AbleAuditor/0.1 (+https://able.vercel.app)` — polite-bot etiquette,
lets WAF admins distinguish the demo from an attack). `withPage()` helper closes
browser in `finally`. Screenshot: `page.screenshot({ fullPage: true, animations: 'disabled' })`
with `clip` cap at **20,000px** capture height (infinite-scroll pages would otherwise
blow memory and kill the function).

### 5.3 Settle sequence (verbatim core + instrumentation)
After `goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })`:

```ts
export async function waitForPageSettle(page: Page, telemetry: { networkidleTimedOut: boolean }): Promise<void> {
  const hasRoot = await page.evaluate(() => !!document.querySelector("#root, #__next, #app, app-root"));
  if (hasRoot) {
    await page.waitForSelector("#root > *, #__next > *, #app > *, app-root > *", { timeout: 8_000 }).catch(() => {});
  }
  // Pause animations/carousels — axe contrast-samples mid-animation pixels otherwise (flaky findings)
  await page.addStyleTag({ content: "*,*::before,*::after{animation-play-state:paused!important;transition:none!important}" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Bounded consent-dismiss pass (deterministic; recorded in evidence)
  await dismissConsentIfPresent(page);   // OneTrust/Cookiebot/[aria-label*="ccept" i]
  try {
    await page.waitForLoadState("networkidle", { timeout: 8_000 });
  } catch {
    telemetry.networkidleTimedOut = true; // websocket/polling pages never idle — bounded, recorded
  }
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
  await page.waitForTimeout(1_000);
}
```

Notes: `#root` misses React-only content — harmless (other selectors cover common
apps); document in code comment. Bot-wall pages (Cloudflare "Just a moment…") are
detected in §5.8 and marked `BOT_BLOCKED` — **never scan a challenge page**.

### 5.4 Axe scan (`src/engine/axe-scan.ts`)
- Inject axe source from node_modules (readFileSync); wait for `window.axe`.
- Run with a **15s `Promise.race` watchdog**; `runOnly.tags`:
  `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice`.
- **Findings are one row per (rule, node), cap 4 nodes per rule**, plus
  `additional_instances` = actual node count − 4 on the first row (report says
  "and N more" — never understates).
- `incomplete` → `bucket 'needs_review'`. `best-practice` rules → `bucket 'best-practice'`,
  `wcag_criterion = null`.
- Bounding boxes: shadow-DOM-aware resolver (split target on `" >>> "`, walk
  `shadowRoot`); null bbox only if unresolvable.
- Full-page screenshot → sharp-crop each bbox (+30px pad, clamped) → **WebP q80**
  (5–10× smaller than PNG; fidelity isn't evidence-relevant) → upload to Storage
  inside the step with deterministic paths. No Buffer returned.

### 5.5 WCAG registry (`src/engine/wcag-registry.ts`) — programmatic, version-locked
- **86 SCs** from the official spec. Spot-check anchors (correct levels): 1.4.3=AA,
  2.4.7=AA, **2.5.8=AA** ← (not A!), 3.2.6=A, 3.3.7=A, 3.3.8=AA, 3.3.9=AAA, 4.1.1 absent.
  New-in-2.2 SCs enumerated: 2.4.11 AA, 2.4.12 AAA, 2.4.13 AAA, 2.5.7 AA, 2.5.8 AA,
  3.2.6 A, 3.3.7 A, 3.3.8 AA, 3.3.9 AAA.
- **Rule→SC mapping derived from installed axe-core's own rule metadata (tags)** at
  build/test time — single source of truth, version-locked, never hand-written
  (axe retags rules between versions; hand mappings rot silently).
- Registry fields: `{ id, name, level, principle, summary, manualTest }`.

### 5.6 Keyboard walkthrough (`src/engine/keyboard.ts`) — bounded and honest
- **Focus-trap detection (correct algorithm):** record the full `activeElement`
  sequence; handle wrap-around explicitly (past last focusable, focus leaves document
  → snaps to `<body>` — a naive loop flags every well-behaved page as a trap). Flag
  only a strict sub-cycle (element repeats without covering remaining focusables).
  `N = min(2 × focusableCount, 100)`. **Route to `needs_review`, never `fail`** —
  modal dialogs trap focus legitimately.
- **Tab order:** compare consecutive focus stops' rects; flag DOM-vs-visual mismatch
  → `needs_review`, lower confidence (RTL, multi-column, sticky headers, intentional
  CSS reordering are genuine 2.4.3 gray zones). Apply `isVisible` filter
  (offsetParent/rects/computed visibility) — never flag hidden focusables.
- **Focus visibility:** Chromium's default UA focus ring **counts as a pass**;
  background-color-only changes count as a valid indicator. Binary check only:
  "some visual indicator present."
- **Budget:** cap focusables at 100; sample focus-visibility on first 30; hard
  deadline **10s** (`Date.now()` per iteration); whole walkthrough in try/catch
  returning partial results — keyboard-hijacking pages degrade to a `needs_review`
  note, never a failed step.

### 5.7 Normalize + metrics (`src/engine/normalize.ts`)
- **wcag_score formula (defined now):** `100 × (automatableSCsPassed / automatableSCsChecked)`
  weighted: critical fail −10, serious −5, moderate −2, minor −0.5 per failing SC
  (min 0); needs_review/behavior findings excluded from score but counted in report.
  Unit test in §5.13.
- **progress contract:** `{ pagesTotal, pagesDone, currentPage, updatedAt }` — the UI
  polls `/api/audits/[id]` and renders queue position + ETA.
- **Matrix precedence:** axe violation ⇒ SC `fail`; `incomplete` + behavior ⇒
  `needs_review`; no findings among automatable SCs ⇒ `automated-pass`; no engine
  coverage ⇒ `manual`; **`fail` outranks `needs_review`** per SC.

### 5.8 Crawl (`src/engine/crawl.ts`) — SSRF-safe
- Seed URL: allowlist `http:`/`https:` only. **DNS-resolve the hostname; reject
  private/loopback/link-local/reserved ranges** (169.254.169.254 etc.).
- Sitemap.xml URLs + landing-page anchor links (same origin, non-asset), dedupe by
  normalized URL, cap `MAX_PAGES=5`. **Re-validate the final post-redirect URL**
  (`page.url()`) — redirect-hopping around the SSRF check is trivial; canonicalize
  findings to the post-redirect URL.
- Bot-wall detection: title matches `/just a moment|attention required|cloudflare/i`
  or HTTP 403 ⇒ page `failed`, `error_code: BOT_BLOCKED`, zero findings.

### 5.9 Inngest function (`src/inngest/functions/audit-url.ts`) — side-effecting steps
```ts
export const auditUrl = inngest.createFunction(
  { id: "audit-url", concurrency: 1, retries: 1 },  // NOT the default retry count
  { event: "audit/url" },
  async ({ event, step }) => {
    const { auditId, url } = event.data;
    const pages = await step.run("crawl", () => crawl(url));  // small summary
    for (const [i, pageUrl] of pages.entries()) {
      await step.run(`scan-page-${i}`, async () => {
        // START: delete-then-insert idempotency
        await db.from("findings").delete().eq("page_id", /* pageId */);
        const result = await withPage(async (page) => {
          await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
          await waitForPageSettle(page, telemetry);
          const axe = await runAxe(page);             // 15s watchdog
          const keyboard = await runKeyboard(page);   // 10s deadline
          const screenshot = await page.screenshot({ fullPage: true, animations: "disabled", clip: { width: 1440, height: 20_000 } });
          return { axe, keyboard, screenshot, title: await page.title() };
        });
        // ALL side effects INSIDE the step:
        await uploadScreenshot(screenshot);            // deterministic Storage path
        await uploadCrops(crops);                      // Promise.all, concurrency 4
        await insertPageRow(...); await insertFindings(...);  // per-node rows
        await updateProgress(...);
        return { pageId, counts, timings };            // SMALL summary only
      });
    }
    await step.run("build-report", () => buildAndStoreReport(auditId)); // → report_path
  }
);
// Retention: scheduled Inngest function (cron, daily) deleting evidence + reports
// for audits older than 30 days; retention stated in the report footer.
```
**`app/api/inngest/route.ts`:** `export const maxDuration = 60; export const runtime = 'nodejs'; export const memory = 3008;` — Chromium + sharp OOM at the 1024MB default. Per-page catch: one bad page marks itself failed with `error_code`, audit continues.

### 5.10 API routes
- `POST /api/audits` `{ url }`: SSRF guard (§5.8) + **rate limit backed by a Supabase
  table** (count per IP per hour, reject > N — in-memory limits don't survive
  serverless instances) → insert → `inngest.send({ name: "audit/url", data: {...} })`.
- `GET /api/audits/[id]` → status, progress, counts (named columns only — never
  `select('*')` on audits).
- `GET /api/audits/[id]/report` → report JSON + **signed Storage URLs** generated at
  render time (evidence bucket is private).
- `GET /api/health` → trivial `select` (keeps the Supabase free project awake —
  free projects pause after ~7 days inactivity; wire a Vercel cron (daily) to it).

### 5.11 UI — shadcn/ui
Home: header + tagline; Card with URL Input + Button; Table of recent audits
(`id, target_url, status, created_at` — named columns), status Badge, queue
position/ETA from `progress`, link to report; Toaster; Progress while polling.
Report page: executive summary Card; WCAG compliance matrix (Table inside POUR
Accordion groups; status Badges per §5.7 precedence); findings Table with expandable
rows (crop image, full evidence); Tabs for Automated / Needs-review / Keyboard /
Best-practice; "Download Report" Button → renders self-contained HTML from
`report_path` (Storage URLs, never base64). Empty states, skeletons, error cards.

### 5.12 Report builder (`src/lib/report.ts`)
JSON always. HTML: self-contained, **references Storage URLs (signed) — no base64 in
the DB**. Sections: cover + exec summary · WCAG compliance matrix (86 rows, A/AA/AAA
filter, precedence per §5.7) · per-page findings with annotated screenshots ·
needs-review summary · keyboard behavior report · footer: retention policy + "audited
with Chromium headless — fonts may differ from real browsers" honesty note.

### 5.13 Tests (vitest)
- `csr-test.html` (content injected 1.5s; 8 deliberate violations): with settle ≥5
  violations incl. image-alt (≥2), color-contrast, label, link-name; NO
  landmark-one-main noise; incomplete surfaced. Without settle → old noise findings.
- `focus-trap.html`: keyboard flags the trap AND passes well-behaved pages (no
  false traps); missing focus indicator flagged; default-UA-ring pages pass.
- `contrast-pairs.test.ts`: known pairs within 0.05 (validates colorjs.io dep).
- `wcag-registry.test.ts`: total=86; 9 new-in-2.2 SCs with **correct levels**
  (2.5.8=AA!); 4.1.1 absent; **completeness** (every installed axe rule has a mapping
  entry) + **soundness** (every mapping target exists in the registry); human-reviewed
  snapshot of names/summaries diffed loudly on any change.
- `normalize.test.ts`: invariants; best-practice findings have null criterion;
  needs_review confidence ≤ automated; additional_instances ≥ 0.
- **Test gating:** `settle-scan`/`keyboard` tests skip-with-message when
  `CHROME_EXECUTABLE_PATH` is unset — `npm run verify` must pass on any machine.

## 6. Acceptance checklist

- [ ] `npm run verify` green (lint, typecheck, vitest, build) on a machine without Chrome.
- [ ] Submit URL → queued→running→complete → findings → report renders with evidence.
- [ ] CSR fixture: settled scan catches real violations, zero noise.
- [ ] Focus-trap fixture flagged; a normal page produces no false traps.
- [ ] **SSRF fixture URLs (localhost, 169.254.169.254) rejected.**
- [ ] Compliance matrix shows 86 SCs, correct statuses, 2.5.8 as AA.
- [ ] Evidence bucket private; report renders via signed URLs.
- [ ] Rate limit rejects >N submissions per IP per hour.
- [ ] A retried step produces no duplicate findings (delete-then-insert verified).
- [ ] One bad page (bot-block) fails soft: page failed with BOT_BLOCKED, audit completes.
- [ ] No CDN axe; `npm ls axe-core` = 4.13.x; zero LLM calls.
- [ ] **Storage quota exhaustion fails one audit gracefully, not all future ones.**
- [ ] UI is shadcn/ui throughout; deployed live on Vercel.

## 7. Explicit exclusions (P0 only)

No LLM/AI · no auth · no Figma · no Image · no Mobile/APK · no screen readers ·
no maturity module · no ACR/VPAT · no PDF/PPTX · no multi-tenant (columns exist,
nullable) · no scheduled re-scans (except the daily health ping + retention cron).
Explore workbench is P1 (local dev).
