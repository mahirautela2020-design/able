# Product Blueprint — Accessibility Auditor (Coforge, 2026-08-07)

> **Owner's view.** This document answers: why a Coforge client should choose this
> product over Deque/Microsoft/WAVE/Adobe/screen-reader tools + the exact open-source
> stack that builds it + the report your client receives. Derived from
> REVERSE_ENGINEERING.md, ENTERPRISE_SPEC.md, WORKBENCH_VISION.md, and the P0 build
> prompt. Treat it as the single source of product truth.

---

## 1. Why us — the competitive pitch

| Capability | Deque (axe DevTools/Auditor/Monitor) | Microsoft (AI for Web) | WAVE | Adobe (color tools) | Screen readers (JAWS/NVDA) | **Us** |
|---|---|---|---|---|---|---|
| **WCAG coverage** | 2.2 A/AA (57% of issue volume; ~28/86 SCs automatable) | 2.2 AA (24-test Assessment, ~50 automated) | 2.2 checks (no certification; hidden-content noise) | 2.1 only (contrast tool) | N/A (testing tools, not auditors) | **2.2 A/AA/AAA + 3.0 readiness** (all 86 SCs mapped, full compliance matrix, 3.0 outcome alignment table) |
| **Input modes** | URL + Figma (basic: contrast/target/headings annotations) | URL (browser extension, single active page) | URL (single-page static analysis; JS-limited in hosted mode) | Single color pair (web) | N/A | **URL · Figma (full: tokens, reading order, alt, touch targets) · APK (static a11y via Android Lint) · Image/screenshot · Code/Repo (ESLint a11y + axe CLI) · iOS checklist + scripts** |
| **Interactive workbench** | Browser extension (in-page panel, dev UX) | Browser extension (Ad hoc tools, FastPass tab stops) | Browser extension (icon overlay — no interactive DOM tweaks) | None (color picker only) | None | **Web workbench: live session, click-any-element inspector, live contrast fix-in-place, keyboard replay, color-blind overlay + recomputed contrast, ARIA tree, DOM tweak console** |
| **Human-in-the-loop** | Axe Auditor (separate SaaS SKU, guided manual tests) | Assessment mode (24 tests, assisted/manual — but Chrome/Edge only) | Refuses pass/fail; "WAVE cannot check all issues" | None | Human-only (manual SR testing, no tooling) | **First-class: needs-review bucket → designer verdict → evidence, per-criterion manual checklists, guided SR scripts, all in one platform** |
| **Maturity scoring** | None | None | None | None | None | **W3C AMM (7 dimensions × 4 levels), automated evidence (violation trend, remediation rate), first-mover** |
| **Regional compliance** | EN 301 549, Section 508 tags on rules (no per-region report) | None (export is HTML/JSON, no regulation mapping) | None | None | None | **Map findings → EU EAA (2025), ADA Title II, Section 508 refresh, AODA, EN 301 549, ATP; per-region legal exposure in every report** |
| **Report** | Dev-style HTML/JSON; bundle adds BI dashboards | HTML/JSON snapshot; CodePen export | Single-URL web report ("does not certify") | None (ratio only) | None | **Executive summary · WCAG SC compliance matrix (86 rows) · Annotated screenshots (severity-color bboxes) · Recommendations with code fixes · Regional exposure · Maturity score · ACR/VPAT export · PDF/PPTX/HTML** |
| **AI** | Axe Assistant chatbot + MCP Server (single-vendor accept/reject fixes) | None | None | None | None | **Multi-model remediation with before/after axe verification, plain-language explanations, "ask the report" chat, vision-LLM advisory (image/Figma) — additive only, never generates findings** |
| **Pricing model** | Free tier → Pro (sales-quote) → Bundle (sales-quote) | Free (OSS extension) | Free extension; API $0.025–0.04/credit; stand-alone $4k–12k/yr | Free (web) | JAWS paid (quote-based), NVDA free | **Coforge-internal cost (open-source stack, own VM) — transparent, no per-scan billing** |
| **Multi-platform** | Browser extension only (any browser) | Chrome/Edge only; Android discontinued (2023) | Chrome/Firefox/Edge extension | Web only | Windows (NVDA/JAWS), macOS (VO), Android (TB) | **Any browser (web app) · Windows VM · Azure-native · Figma (REST API) · APK static · iOS checklist · eventual CI/CLI for any CI runner** |

## 2. Open-source technology stack (verified licenses, last-commit, May–Aug 2026)

| Input / Feature | OSS Tool | License | Maturity | Key detail |
|---|---|---|---|---|
| **URL audit (core)** | axe-core 4.13 + Playwright + HTML CodeSniffer | MPL-2.0, Apache-2.0, BSD-3 | ✅ Active (all pushed Aug 2026) | Industry standard — powers Lighthouse, AI4Web, axe DevTools |
| **Contrast engine** | colorjs.io | MIT | ✅ Active | WCAG 2.x + CVD simulation matrices + alpha blending |
| **Screenshots + annotations** | Playwright `page.screenshot()` + sharp | Apache-2.0 | ✅ Active | Full-page captures + SVG bounding-box overlays |
| **Keyboard walkthrough** | Playwright (custom script) | Apache-2.0 | ✅ Active | Tab traversal, focus visibility, trap detection — no external dep |
| **Accessibility tree (Explore)** | Playwright `page.accessibility.snapshot()` | Apache-2.0 | ✅ Active | Real AX tree — zero extra deps. The enabler |
| **Figma mode** | Figma REST API (v1) + **Figma-Context-MCP** (MIT, 15.6k★) or `plugin87/figma-remote-server` (accessibility tools built in) | MIT (community) | ✅ Active (MIT) / ⚠️ Official MCP server is **proprietary** (`mcp.figma.com`) — avoid; use community OSS | Extract frames, fills, text → contrast engine + touch targets + alt presence |
| **Code audit — React** | eslint-plugin-jsx-a11y | MIT | ✅ Active (Jan 2026, 10M+ wkly dl) | 30+ rules: ARIA, alt, headings, labels |
| **Code audit — Angular** | @angular-eslint/template | MIT | ✅ Active (Aug 2026) | Monorepo, defacto Angular ESLint |
| **Code audit — Vue** | vue-a11y/eslint-plugin-vuejs-accessibility | MIT | ✅ Active (Aug 2026) | **DO NOT use** `maranran/eslint-plugin-vue-a11y` (stale 2022) |
| **Code audit — HTML** | html-validate | MIT | ✅ Active (Aug 2026) | 40+ a11y rules, framework-agnostic, GitLab-primary |
| **Code audit — CSS** | ivuorinen/stylelint-a11y (fork) or `fpapado/stylelint-plugin-a11y-contemporary` | MIT | ⚠️ Original stale (2023), forks active (Aug 2026) | Font-size, line-height, contrast warnings |
| **Code audit — CLI** | **@axe-core/cli** | **MPL-2.0 — FREE OSS** | ✅ Active (Aug 2026) | `npx axe https://example.com` — part of axe-core-npm monorepo; NOT Deque's paid `@axe-core/linter` (which is a separate VS Code product, not OSS, not on npm) |
| **APK static** | Android SDK `lint` + `aapt2` + `apkanalyzer` | Apache-2.0 | ✅ Active (Android platform) | **Windows-installable via `commandlinetools-win-*.zip` — no Android Studio needed.** `lint --check Accessibility` catches missing contentDescription, labelFor, clickableView |
| **APK dynamic** | Google ATF (UIAutomator) | Apache-2.0 | ⚠️ ATF stale (last push Apr 2024), UIAutomator active (AOSP platform) | Still works for current API levels; ATF low-maintenance risk flagged |
| **iOS** | AccessibilitySnapshot (CashApp, ex-Airbnb) + guided scripts | Apache-2.0, MIT | ✅ Active (July 2026) | **WINDOWS-BLOCKED — ALL iOS a11y tools require macOS + Xcode.** Cloud Mac or office Mac required. Honest limitation. |
| **Screen reader** | NVDA + nvdaControllerClient (out-of-process, GPL-2.0) + guided VO/TB/JAWS scripts | GPL-2.0 (separate process only) | ✅ Active (NVDA 2026.3) | Speech assertions, tree checks, human guides — industry pattern: Assistiv Labs |
| **WCAG 3.0 readiness** | Custom mapping table (W3C WD March 2026) | MIT (ours) | Data-driven design | Align SCs → proposed outcomes |
| **Regional regulations** | **No OSS library exists.** Build internal mapping table (ported from existing codebase). Source: EU EAA (eur-lex), ADA Title II (ada.gov), Section 508 (section508.gov), EN 301 549 (etsi.org), AODA, ATP. | MIT (ours) | Stable legal references — legal interpretation, not novel logic |
| **Report** | Playwright `page.pdf()` + jsPDF (MIT) + PptxGenJS (MIT) + sharp (Apache-2.0) | MIT, Apache-2.0 | ✅ Active / ⚠️ PptxGenJS maint. slowing (Nov 2025, 284 issues — adequate, watch) | HTML → PDF via Puppeteer/Playwright; programmatic PDF via jsPDF; annotated crops via sharp |
| **Queue / DB** | pg-boss + PostgreSQL 16 + node-postgres | MIT, PostgreSQL License | ✅ Active | Job queue + persistence, local VM |
| **Web shell** | Next.js 16 (App Router) + TypeScript + vitest | MIT (all) | ✅ Active | Admin UI, Explore workbench, API |

## 3. Report design — what the client receives

Every report is a self-contained single-file HTML (with PDF/PPTX export). Structure:

1. **Cover page:** project name · URL(s)/artifact · date · WCAG version · standard (A/AA/AAA) · overall score · maturity level · "confidential" watermark
2. **Executive summary (1 page):** overall score, counts per severity, top 5 risks (with
   business impact in plain language), regional compliance alerts (EAA/ADA/Section 508),
   remediation priority order, AI-generated narrative tied to the data (with source
   citations — the LLM synthesizes, never invents)
3. **WCAG compliance matrix:** all 86 SCs as rows, grouped by POUR principle, columns:
   Level · Status (✅ automated-pass / ❌ fail / 👁️ needs-review / 🖐️ manual / N/A) ·
   Findings count · Evidence links. Filter A/AA/AAA. Client-ready language per SC
   ("1.4.3 Contrast — 12 elements fail AA minimum, 4 flagged for review on
   gradients/images")
4. **Per-page breakdowns:** page URL + title + full-page annotated screenshot at top
   (severity-colored boxes drawn on the screenshot, numbered), findings table below
   with: severity icon · WCAG criterion · element selector + HTML snippet · crop image ·
   failure summary (plain language) · user impact · recommendation with code fix ·
   regional legal exposure. Click any finding → open the element's crop with bbox
   overlay, full evidence. Toggle code view for developers.
5. **Needs-review summary:** items requiring human judgment grouped by type (contrast
   on gradients, ARIA ambiguity, dynamic content) — designed to hand to a designer for
   verdict (the human-in-the-loop handoff).
6. **Keyboard behavior report:** tab-order diagram (numbered flow), focus traps
   flagged, missing-focus-style elements, skip-link analysis — this is the section no
   competing report has.
7. **Regional compliance appendix:** per-regulation items that are flagged, with
   citation of the specific regulation clause, penalty type (fine, injunction,
   reputational), and severity.
8. **Maturity scorecard (when the maturity module runs):** per-dimension level
   (Inactive→Launch→Integrate→Optimize), evidence ledger, improvement roadmap.
9. **Remediation action plan:** prioritized table (severity × user impact × fix
   effort × legal risk) with per-item status tracking when connected to Jira/Azure
   DevOps/GitHub.

## 4. MCP / plugin architecture

Third-party connectivity via the **Model Context Protocol (MCP)** — a single standard
interface that lets any MCP-compatible tool read/write to our audit data:

| Plugin | MCP capability | Status |
|---|---|---|
| **Figma Server** (REST API ↔ MCP) | Extract frames, fills, text, components → feed contrast engine + touch-target check; push annotations back as comments | Community server exists; we build/adapt an enterprise wrapper with OAuth |
| **Code Server** (eslint ↔ MCP) | Run a11y lint rules on files/directories on demand; return structured findings with file:line refs; register as pre-commit hook | Build as thin MCP wrapper around the linter stack (§2) |
| **App Emulator Bridge** (adb ↔ MCP) | Connect to Android emulator/device; run APK static (lint) + dynamic (UIAutomator ATF) on demand; return TalkBack tree findings | Build adb command wrapper + ATF runner as an MCP tool |
| **Browser Extension** (CDP ↔ MCP) | Light equivalent of the Explore workbench: inspect the current tab, run axe, return findings to our platform | Build as Chrome/Edge extension (leveraging existing AI4Web patterns) |
| **CI/CD Actions** (GitHub / Azure DevOps / MCP) | On PR, run axe + linters; post results to PR; block on severity threshold; register as CI step | MCP wrapper around @axe-core/cli + linters |

All MCP servers connect to the same Postgres data model → findings from Figma, code
reviews, manual inspections, and automated URL scans all live in one table, feed one
report.

## 5. Roadmap (revised, workbench-first)

| Phase | Scope | Est. |
|---|---|---|
| P0 | Engine core: pg-boss + worker + browser pool (cap 2), settle-scan, WCAG 2.2 SC registry (86) + exact mapping + compliance matrix, keyboard walkthrough, report v1 | 3–4 wks |
| P1 | Explore workbench v1: live session + element inspector + live contrast/fixes + keyboard replay + color-blind overlays + ARIA tree | 3–4 wks |
| P2 | Audit mode polish: module selector, session import (portals), needs-review UI, multi-viewport, auth, regulation mapping | 2 wks |
| P3 | Figma MCP server + Image mode (vision-LLM advisory) | 3 wks |
| P4 | APK static (aapt2 + lint) + Code audit (MCP wrapper around linter stack) | 2 wks |
| P5 | Screen-reader module (NVDA out-of-process + guided SR for all 4) + maturity module + ACR/VPAT generators | 3 wks |
| P6 | Enterprise: SSO (Entra ID), RBAC, multi-tenant, API, webhooks, scheduling, MCP plugin framework, CI/CD MCP wrappers | 3 wks |
| **Total** | | **~5–6 months** |

## 6. The pitch (what you say to a client — 60 seconds)

> "Every accessibility tool in the market is either a browser extension for developers,
> a static URL scanner, or a single-purpose color checker. None of them audit your Figma
> design files before a single line of code is written. None of them accept a screenshot
> of your mobile app and tell you what's wrong. None of them give you an organizational
> maturity score. None of them produce the kind of annotated executive report you
> actually show YOUR client — with per-regulation legal exposure and a prioritized fix
> plan.
>
> We built this because we're a design and delivery firm — we know the workflow: design
> in Figma → build → audit the URL → check the code in CI → test the mobile app →
> manual-review with a designer's judgment. This tool covers every step of that
> workflow, produces one report, and costs nothing per scan — it runs on our own
> infrastructure, on open-source engines that every compliance auditor already trusts
> because they're the same ones powering axe DevTools, Lighthouse, and Microsoft's
> own accessibility tester.
>
> And we never let AI make up findings — every issue has a screenshot, a WCAG criterion,
> a DOM selector, and a source engine. When AI helps, it explains fixes and writes
> summaries. You can verify every single thing it says."

**This document is the canonical product record.** Companion files: `ENTERPRISE_SPEC.md`
(architecture + deployment) · `WORKBENCH_VISION.md` (Explore interactions) ·
`REVERSE_ENGINEERING.md` (market teardown) · `P0_BUILD_PROMPT.md` (engineering spec).
