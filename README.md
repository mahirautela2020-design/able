# ScanA11y — Enterprise Accessibility Auditor

**Make the web work for everyone.**

ScanA11y audits websites against the full WCAG 2.2 success criteria (A/AA/AAA) with
deterministic, evidence-first findings — every issue backed by a rule ID, the exact
success criterion, a DOM selector, and a screenshot crop. Runs on open-source engines
(axe-core, Playwright, colorjs.io) — no paid APIs, no LLM-generated findings.

## Status

**P0 (engine core) — built.** URL audits end-to-end: submit a URL → crawl (≤5 pages) →
settle-then-scan with axe-core → keyboard behavior walkthrough (focus order, traps,
visibility, skip links) → findings mapped to the WCAG 2.2 SC registry (86 criteria) →
annotated compliance report with evidence.

## Stack

- **Next.js 16** (App Router) + **shadcn/ui** — web app & report UI
- **Supabase** (free tier) — Postgres + private evidence storage (signed URLs)
- **Inngest** (free tier) — background queue, one step per page (Vercel 60s-safe)
- **@sparticuz/chromium + Playwright** — headless browsing on Vercel
- **axe-core 4.13** (from node_modules, no CDN) — the industry-standard engine
- **colorjs.io** — contrast math (P1+)

## Key design decisions

- **Settle before scan** — pages are scanned only after content signal + network
  idle + fonts loaded. Never at `domcontentloaded` (the accuracy bug that sinks most
  homegrown auditors on JS-rendered sites).
- **Evidence-first** — a finding without ruleId + criterion + selector + screenshot
  crop is not a finding. Every finding maps to ≥1 SC via the installed axe-core's own
  rule metadata (programmatic, version-locked — never hand-written).
- **Honest buckets** — `automated` / `needs_review` (axe `incomplete`, gradients,
  focus traps — the human-judgment layer) / `behavior` (keyboard) / `best-practice`.
- **No LLM in the scan path** — P0 is 100% deterministic. AI (when it arrives) only
  explains engine-verified findings, never creates them.
- **SSRF-safe crawling** — private/loopback ranges rejected, post-redirect
  re-validation, IP rate limiting, bot-wall detection.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + Inngest keys
npm run inngest:dev                # local queue
npm run dev                        # app on :3000
npm run verify                     # lint + typecheck + test + build
```

Supabase: run the schema from `P0_BUILD_PROMPT.md` §4 in the SQL editor, enable RLS
on all tables (zero policies), create a **private** `evidence` bucket.

## Roadmap

| Phase | Scope |
|---|---|
| P0 ✅ | Engine core: settle-scan, WCAG registry, keyboard walkthrough, annotated report |
| P1 | Explore workbench: live session, element inspector, live contrast fixes, color-blind overlays |
| P2 | Module selector, portal sessions, needs-review UI, multi-viewport, regulation mapping |
| P3 | Figma + image modes |
| P4 | APK static, code/repo audit |
| P5 | Screen readers (NVDA out-of-process), maturity scoring, ACR/VPAT |
| P6 | Enterprise shell: SSO, RBAC, multi-tenant, API, MCP plugin framework |

Spec docs for every phase live in this repo (`PRODUCT_BLUEPRINT.md`,
`ENTERPRISE_SPEC.md`, `WORKBENCH_VISION.md`, `P0_BUILD_PROMPT.md`).

## License

Proprietary — personal portfolio project. (Specs in this repo describe the product
and its build plan; code is not yet licensed for external use.)
