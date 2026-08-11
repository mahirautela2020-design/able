# Accessibility Auditor — Enterprise Spec (v1, 2026-08-07)

> Enterprise-grade accessibility auditing platform for Coforge, deployed on the company
> Azure VM (Windows Server, 2 vCPU / 7.95 GB / 126 GB, nginx). Inputs: **URL · Figma ·
> Code/CI · Image · Manual**. Outputs: WCAG 2.2 A/AA/AAA reports + W3C maturity scoring.
> Human-in-the-loop is a first-class feature (that's the designer's role, by design).
> Companion doc: `REVERSE_ENGINEERING.md` (market teardown this spec responds to).

---

## 1. Product thesis

Market tools are single-mode, fragmented, and workflow-broken (evidence:
REVERSE_ENGINEERING.md §9):

- **axe DevTools** = dev extension; manual/VPAT/CI/monitoring split across 5 SKUs
- **WAVE** = single-page static analysis; API costs $; site-wide outsourced to Pope Tech
- **Lighthouse** = performance-first; 10 a11y audits are manual-only (weight 0)
- **Accessibility Insights for Web** = best workflow, but Chrome/Edge only, Android
  discontinued, needs-review scope narrow
- **Contrast checkers** = one color pair at a time; no gradients, no tokens, no batch
- **Screen readers** = human testing with no integrated tooling
- **Maturity scoring** = W3C published the model (Nov 2025); **nobody implements it**

**Our wedge — one platform, one data model:** findings → needs-review → human verdicts
→ tickets → ACR/VPAT all in one database, plus the four things no competitor has:
**Figma design audit, image upload mode, keyboard-behavior automation, maturity
scoring with automated evidence.**

## 2. Hard engineering rules (non-negotiable, from the field diagnosis)

1. **LLM never creates findings.** It explains engine-verified findings. Vision-LLM
   output = "needs review" advisory only. (The old suite failed by using the LLM as
   an oracle; the rules layer that fixed it — evidence-first, additive-only
   enrichment — is the template here.)
2. **Evidence-first:** every finding = ruleId + WCAG criterion + level + selector +
   HTML snippet + screenshot crop + confidence + source engine(s).
3. **Settle before scan:** content signal → networkidle → fonts.ready → buffer.
   Never scan at `domcontentloaded` (proven root cause of the old tool's inaccuracy).
4. **Pinned local axe-core** (4.13.x, no CDN). `incomplete` → surfaced "needs review".
5. **Honest coverage:** automated ≈ 57% of issue volume / ~33% of SCs (Deque study).
   Report what was checked, never claim compliance — "criteria checked".

## 3. Capability matrix: replicate / beat / new

| Market capability | Our tool |
|---|---|
| axe-core automated rules (105) | **Replicate** — axe-core 4.13 pinned local |
| axe "incomplete" / needs-review | **Beat** — first-class bucket + per-rule confidence + human verdict workflow (AI4Web excludes 6 rules; LH weights them 0) |
| WAVE panel overlay (icons on page) | **Replicate** — screenshot overlay + click-through to evidence |
| WAVE contrast panel | **Beat** — token-level batch contrast, gradient/image handling, "darken by X to pass" remediation |
| AI4Web FastPass (5-min) | **Replicate** — automated + assisted tab-stops + needs review |
| AI4Web Assessment (24 tests, WCAG 2.2 AA) | **Replicate** — guided manual module (A/AA/AAA) |
| AI4Web issue filing (GitHub/Azure Boards) | **Replicate + Beat** — Jira + Azure DevOps + GitHub |
| Lighthouse a11y score | **Replicate** — optional perf context (avoid double-count) |
| LH manual audits (10) | **Beat** — keyboard walkthrough automates 6+ of them |
| axe for Figma (contrast/target-size/headings) | **Beat** — full Figma audit: tokens, reading order, alt presence, whole design system |
| WAVE API / stand-alone engine | **Beat** — free in-house, unlimited scans, CI-friendly |
| Screen-reader testing | **Beat** — guided NVDA (auto speech assertions) + VoiceOver/TalkBack/JAWS scripts with evidence capture |
| Contrast checkers (3) | **Beat** — computational gradients, batch, APCA-ready engine, API |
| ACR/VPAT creation (Axe Auditor) | **Replicate** — export ACR/VPAT from the same data model |
| Continuous monitoring (Axe Monitor) | **Replicate** — scheduled re-scans + trend dashboards |
| **None of the above** | **New:** Figma mode · image/screenshot mode · keyboard-behavior automation · W3C AMM maturity scoring · white-label executive reports · "ask the report" AI chat · multi-model remediation with before/after verification |

## 4. Architecture (Azure Windows VM)

```
Inputs: URL │ Figma │ Code/CI │ Image │ Manual
        │
        ▼
API Gateway (Next.js app — existing stack)
  Auth: Entra ID SSO (OIDC/SAML) · RBAC · API keys · rate limits
        │
        ▼
Job queue (pg-boss on Supabase Postgres — no Redis on this box)
  Audit jobs {type, targets, options, tenant} · retries · DLQ
        │
        ▼
Worker (same VM, concurrency-capped)
  Browser pool: Playwright + Chromium (Windows), semaphore = 2 concurrent
  Engines: axe-core 4.13 · HTML CodeSniffer · keyboard walkthrough ·
           contrast engine (colorjs.io) · Figma REST client ·
           vision-LLM (advisory) · LLM (remediation/summaries — synthesizer only)
        │
        ▼
Storage: Postgres 16 (LOCAL, Windows service on this VM — no external SaaS:
         tenants, audits, findings, maturity, pg-boss queue)
         Local disk 126 GB (screenshots, crops, reports) → Azure Blob later
        │
        ▼
Outputs: Web dashboard · PDF/PPTX/HTML/JSON · REST API · webhooks ·
         Jira/Azure DevOps export · scheduled re-scans
```

**Deployment reality (verified VM):** Windows Server, EPYC slice ~2.4 GHz,
7.95 GB RAM. Windows-native (no Docker): Node.js LTS services, Playwright Chromium,
nginx front (already deployed), **local Postgres 16 (Windows service) — zero external
SaaS**, pg-boss queue. RAM budget: OS+nginx ~2 GB · app ~0.5 GB · worker ~0.5 GB ·
Postgres ~0.5 GB · 2×Chromium ~1.2 GB · headroom ~2 GB. 10-page audit ≈ 4–8 min.
Scale path (documented): worker VMs + Redis + Azure Blob.

**Open-source stack (no paid APIs):** axe-core (MPL-2.0) · HTML CodeSniffer (BSD) ·
Playwright (Apache-2.0) · colorjs.io (MIT) · pg-boss (MIT) · Lighthouse core
(Apache-2.0) · Postgres. **NVDA (GPL-2.0) runs out-of-process only** — a separate
process on a test VM driven via its public `nvdaControllerClient` IPC (the industry
pattern: Assistiv Labs-style), never embedded or redistributed; documented in
`docs/LICENSING.md`.

## 5. Engine layer

| Engine | Job | Notes |
|---|---|---|
| axe-core 4.13 (pinned, local) | WCAG 2.2 A/AA/AAA rules | tags: wcag2a/aa/aaa, wcag21a/aa, wcag22aa, best-practice; `incomplete` surfaced |
| HTML CodeSniffer | Supplementary structure/table rules | free, extends beyond axe |
| **Keyboard walkthrough** (Playwright) | Focus order, traps, focus visibility, skip links | automates 6 of Lighthouse's 10 manual audits — unique |
| Contrast engine (colorjs.io) | Figma + image modes; gradient/image-aware; "darken by X" | computational, not sampled |
| Lighthouse (optional) | Perf/SEO context scores only | a11y category is axe-derived — never double-count |
| Vision-LLM | Image mode + advisory checks | ALWAYS needs-review, never hard findings |

Canonical finding schema:
```
ruleId · ruleTitle · wcagCriterion · wcagLevel · principle (POUR)
severity · confidence · sourceEngines[] · pageUrl · selector · elementHtml
screenshotCropUrl · failureSummary · userImpact · businessImpact
legalExposure · recommendation · fixPriority
```

## 6. WCAG layer

- Filters: WCAG 2.1/2.2 × A/AA/AAA (axe tags — never string matching).
- **Three buckets:** Automated (engine-verified) · Needs-review (axe `incomplete` +
  vision advisories + gradients/images) · Manual (guided designer judgment).
- **WCAG 2.2 focus:** thin automated coverage everywhere (only `target-size` +
  timing in axe) — ship explicit 2.2 checks: focus appearance (2.4.11/2.4.13),
  dragging alternatives (2.5.7), target size (2.5.8), consistent help (3.2.6),
  redundant entry (3.3.7), accessible auth (3.3.8/9).
- **Future-proof:** mapping tables (outcome ↔ checks ↔ criteria) data-driven and
  swappable — WCAG 3.0 (Mar 2026 WD, Bronze/Silver/Gold) is a moving target and
  **no longer names APCA**; don't hard-code either.

## 7. Manual module + screen-reader workflows

- Guided per-criterion tests (like AI4Web Assessment): instructions, expected vs
  actual, pass/fail/NA, screenshot attach, auto-save, pre-filled from automated
  bucket. Per level A/AA/AAA.
- **Screen readers:** NVDA automation first (nvdaControllerClient — free, most
  programmable: speech assertions via speakText/isSpeaking, page driving via
  keyboard, NVDA Remote for proctoring). Guided proctored scripts for
  VoiceOver/TalkBack/JAWS with evidence capture (screen + audio + tree). Honest
  expectation: ~30–50% of SR findings remain human-mediated.
- **ACR/VPAT export** from the same data model (matches Axe Auditor; sells to
  EAA/ADA/EN 301 549 buyers).

## 8. Maturity module (W3C AMM — first-mover)

- Model: **7 Dimensions** (Communications · ICT Development Lifecycle · Knowledge
  and Skills · Oversight & Culture · Personnel · Procurement · Support) × **4
  levels** (Inactive → Launch → Integrate → Optimize), judged on **Proof Points**
  (evidence-based deliverables; N/A allowed). Align with the official
  `AssessmentTool.xlsx` structure — no commercial tooling exists.
- **Hybrid scoring:** structured questionnaire per dimension + **automated
  evidence**: scan coverage, violation counts & trend over time, remediation rate,
  manual-test completion rate, ACR/VPAT status.
- Output: per-dimension level, overall maturity, evidence ledger, prioritized
  improvement roadmap. Sells the platform as governance tool, not just a scanner.

## 9. AI layer (synthesizer only)

1. Remediation suggestions with code examples + **verifiable before/after axe run**
   (fix applied → re-scan → delta shown). Multi-model friendly.
2. Executive summary + client-ready narrative; prioritization (severity × journey
   impact × legal exposure).
3. Plain-language WCAG explanations for designers.
4. Vision-LLM: image mode + Figma frame analysis — advisory only.
5. "Ask the report" chat (CopilotKit, existing stack).

## 10. Input modes

| Mode | Runs | Output |
|---|---|---|
| URL | crawl (sitemap+links), settle-scan, keyboard walk, screenshots, multi-viewport, auth headers/cookies | full report |
| Figma | REST API: text/fill nodes → contrast engine (alpha-correct), touch targets, alt presence, reading order, token-level pass | design report + annotated frames |
| Code/CI | CLI + GitHub Action + **Azure DevOps task**; localhost via runner | CI gate + artifact |
| Image | upload screenshot → vision-LLM advisory + guided checklist | advisory report |
| Manual | guided tests + SR scripts + review queue + ACR/VPAT | compliance summary |

## 11. Enterprise features

Entra ID SSO (OIDC/SAML) · SCIM · RBAC (admin/auditor/developer/viewer) · multi-tenant
orgs+projects · audit log · scheduled re-scans (regression monitoring) · REST API +
webhooks · Jira + Azure DevOps + GitHub export · PDF/PPTX/HTML/JSON · white-label
reports · data residency (Azure region) · SOC2-ready posture · usage analytics.

## 12. Report

Executive summary (client-ready) · overall score · **maturity level** · A/AA/AAA
status per page · POUR · findings with evidence · prioritized remediation plan ·
regression trend · compliance summary (auto-pass / manual-pass / manual-fail /
needs-review) · ACR/VPAT export.

## 13. Build plan (sized for the VM)

| Phase | Scope | Est. |
|---|---|---|
| P0 | Engine core: pg-boss queue + worker + browser pool (cap 2), settle-scan, **full WCAG 2.2 SC registry + exact mapping + compliance matrix**, **keyboard behavior walkthrough**, evidence schema, report v1 | 3–4 wks |
| P1 | URL mode polish: crawl, screenshots, needs-review UI, multi-viewport, auth | 1–2 wks |
| P2 | Figma mode: REST + contrast engine + touch targets + token pass | 2–3 wks |
| P3 | Image mode + vision-LLM advisory | 1–2 wks |
| P4 | CI: CLI + GitHub Action + Azure DevOps task | 1–2 wks |
| P5 | Manual module + SR workflows + **maturity module** | 2–3 wks |
| P6 | Enterprise shell: SSO/RBAC/tenants/audit/API/webhooks/scheduling | 2–3 wks |
| **Total** | | **~3–4 months** |

## 14. Definition of done (per phase)

- CSR regression fixture: settled scan catches real violations, zero noise on empty
  root; contrast unit tests match WebAIM/Vispero on known pairs incl. alpha blends.
- Every finding traceable to a source engine; zero LLM-generated findings.
- `npm run verify` green at end of every phase.
- Manual results + maturity scores persist and feed the report.
- Demo-ready at P1: a live URL audit that beats WAVE/axe DevTools output on the
  same page (evidence + needs-review + keyboard findings).

## 15. Immediate next steps

1. Stand up P0 skeleton on the VM (Node services, pg-boss, worker, browser pool).
2. Port the proven scan core (settle logic + axe 4.13 + evidence schema) from the
   diagnosis work into the new codebase.
3. Ship P1 demo against a Coforge client site; record side-by-side vs WAVE/axe.
