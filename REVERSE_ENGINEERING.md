# Reverse Engineering: Market Accessibility Tools (2026)

> Teardown compiled 2026-08-07 from primary sources (vendor docs, GitHub configs, W3C).
> Purpose: identify exactly what each market tool does, how it works, what it costs,
> and — critically — **where each one is weak**, so the Coforge enterprise auditor can
> match the strong parts and beat the weak ones.
> Full sources: axe-core `rule-descriptions.md`, Lighthouse `default-config.js`,
> deque.com, wave.webaim.org, accessibilityinsights.io, vispero.com, w3.org/TR.

---

## 1. The engine everyone shares: axe-core (Deque)

**The single most important fact: axe-core is the industry engine. axe DevTools,
Lighthouse's a11y category, and Microsoft Accessibility Insights all run axe-core
under the hood.** Nobody beats it on rule accuracy; you wrap it, extend it, and
present it better.

- **Version:** 4.13.0 (Aug 2026). **105 rules** (93 active; 7 experimental, 5 deprecated).
  Categories: ARIA (25), semantics (14), text-alternatives (12), keyboard (9),
  structure (8), name-role-value (7), tables (6), forms (5), time-and-media (5),
  language (4), parsing (4), color (3), sensory (3).
- **WCAG mapping:** tags per rule — `wcag2a/aa/aaa`, per-SC tags (`wcag111`…), plus
  Section 508, EN 301 549, RGAA, ACT rule IDs. **Only ~28 of 86 WCAG 2.2 SCs are
  tagged** (~33%; ~22 of 50 A/AA). WCAG 2.2's new SCs barely covered: `target-size`
  and timing rules only.
- **`incomplete` (needs review):** axe returns "incomplete" when it can't decide
  (technical limits, JS errors, gradients, pseudo-elements, overlapping content,
  1:1 fg/bg, transparency). **Market tools hide or under-weight these; surfacing
  them first-class is a differentiator.**
- **Coverage ceiling:** Deque's own study: automated testing covers **57% of issue
  volume** (~43% human) across 13,000+ pages — but by SC count it's ~33%.
  Impossible to automate: alt-text *meaning*, sensory cues, keyboard *behavior*
  (traps, shortcuts), focus visibility/obscuring, timing/animations, error
  prevention, reading order, cognitive load, all AAA.
- **Known false-positive classes** (from Deque's own docs): color-contrast on
  gradients/pseudo-elements/borders/overlaps/transparency; needs-review rules
  (`aria-hidden-focus`, `bypass`, `video-caption`, …). "Zero false positives" is
  marketing — 4.13.0 fixed 10 of them.

## 2. axe DevTools (Deque) — three tiers, fragmented

| Capability | Extension Free | Extension Pro | DevTools for Web (Bundle) |
|---|---|---|---|
| Basic axe-core automation | ✅ | ✅ | ✅ |
| Remediation guidance | ✅ | ✅ | ✅ |
| Intelligent Guided Testing (IGT) | ❌ | ✅ | ✅ |
| AI-enhanced automation | ❌ | ✅ | ✅ |
| User-flow analysis, component testing | ❌ | ✅ | ✅ |
| Issue dedup, Jira, SSO | ❌ | ✅ | ✅ |
| Axe MCP Server (agentic fixes) | ❌ | ❌ | ✅ |
| BI dashboards, linting, CI/CD | ❌ | ❌ | ✅ |
| Rules customization, on-prem | ❌ | ❌ | ✅ |

**Pricing:** Free tier free; Pro trial no-CC; **Bundle = sales-quote only** (no public
price). Axe Assistant (AI chatbot), Axe MCP Server (accept/reject fixes in Copilot/
Cursor/Claude Code). **Axe for Figma ("Axe for Designers"): free plugin — but only
checks contrast, target size, headings with static annotations.** Not a real
design-system audit.

**Adjacent products (fragmentation):** axe DevTools (dev) · **Axe Monitor**
(continuous monitoring, unlimited seats, Jira) · **Axe Auditor** (manual testing
SaaS + ACR/VPAT creation — quote-only) · Axe Assistant (AI) · MCP Server (agentic).
Four SKUs, separate logins, one data model missing.

## 3. Lighthouse (Google) — performance-first, a11y secondary

- **v13.4.1** (Jul 2026). A11y category: **76 audit refs = 58 weighted automated +
  8 zero-weight + 10 manual (weight 0)**. Runs axe-core.
- **Scoring is brutal:** weighted average, **no partial credit** — one unnamed
  button zeroes the whole `button-name` audit. Weights: minor 1, moderate 3,
  serious 7, critical 10.
- **10 manual audits (never scored):** focusable controls, interactive affordance,
  logical tab order, visual order vs DOM, focus traps, managed focus, landmarks,
  offscreen content, custom-control labels/ARIA. **These are exactly the checks a
  keyboard walkthrough can automate.**
- **Misses:** no crawl, no auth flows, no guided workflow, no AI, no trend.
  (v13 adds an "Agentic Browsing" category for agent-driven browsing checks.)

## 4. WAVE (WebAIM) — deliberately narrow, paid API

- **Free extensions** (Chrome/Firefox/Edge) evaluate the live rendered page in-browser,
  locally (privacy pitch). **Online tool under-applies JS** — WebAIM itself points
  scripted sites to the extension.
- **Panels:** Details, Errors (red), Contrast, Alerts (yellow, human-judgment),
  Features (green), Structural Elements, ARIA, Reference, Structure/Code, No-Styles
  toggle. Philosophy: "reveals, doesn't judge" — **refuses pass/fail certification**.
- **WCAG 2.2:** confirmed supported in checks.
- **Pricing:** extensions free; **API $0.04→$0.025/credit** (100 free credits);
  **stand-alone API $4k/$8k/$12k/yr**; site-wide scanning **outsourced to Pope Tech**
  (paid third party).
- **Limitations:** single-page by default; no crawl/scheduling/dashboards; **no CI,
  no SDK, no SARIF**; no Figma; credit pricing unfit for scale; flags hidden content
  by design (SPA noise).

## 5. Microsoft Accessibility Insights for Web — best workflow, narrow platform

- **Actively maintained (verified Aug 2026):** repo pushed 2026-08-07, release
  2.47.0 (Jun 2026). **Chrome/Edge only** — no Firefox, no Safari.
- **Modes:** FastPass (automated checks + **assisted Tab-stops test** + needs review,
  <5 min) · Quick Assess (10 requirements, WCAG 2.1 AA) · Assessment (**24 tests,
  WCAG 2.2 AA**, automated/assisted/manual) · Ad hoc tools (Color, Headings,
  Landmarks, Issues, Tab stops, Needs review, Accessible names).
- **Needs-review routing:** 6 axe rules routed to human judgment
  (`color-contrast`, `aria-input-field-name`, `duplicate-id-aria`, …); several more
  excluded entirely (no content built). Publishes its axe config as
  `@accessibility-insights/axe-config`.
- **Export:** HTML/JSON + CodePen; **issue filing to GitHub / Azure Boards** built in.
  CI = sibling `accessibility-insights-action` (GitHub Action).
- **Accessibility Insights for Android: DISCONTINUED** (2023; axe-android took over).
  Windows variant still active.

## 6. Color-contrast checkers — the weakest category (biggest opportunity)

| Capability | WebAIM CC | TPGi/Vispero CCA 3.5.5 | Adobe (Express) |
|---|---|---|---|
| Price / platform | Free, web+API | Free, desktop (Win/Mac) | Free, web |
| WCAG levels | 2.x AA/AAA | 2.0/2.1/2.2 A/AA/AAA | 2.1 AA/AAA |
| APCA / WCAG 3 | No | No | No |
| Alpha blending | fg slider | fg alpha | tint/alpha |
| Color-blind sim | No | **Yes (8 settings)** | Yes (palette) |
| Eyedropper | bookmarklet | **Native screen picker** | No |
| Batch / palette | No | No | Single-palette compare |
| Real-world accuracy | Weak | **Best (screen sampling)** | Weak |
| API / automation | Free single-pair JSON | None | None |

**Collective gaps:** no gradient/image background computation; no design-token /
design-system-wide audit; no CI-friendly API; no image upload; no remediation
("darken by X to pass AA"); no severity or user-impact scoring; no WCAG 3/APCA
readiness.

## 7. Screen readers — human testing, tooling around it

| SR | Cost | Automation surface (2026) |
|---|---|---|
| **NVDA** | Free/OSS | **Most automatable**: `nvdaControllerClient` (v3.0 in NVDA 2026.3 adds `isSpeaking`); speech assertable via `speakText`/`speakSsml`; NVDA Remote add-on |
| **JAWS** | Paid (quote-based) | **Least automatable**: scripting is customization, not test API; practice = VM + real humans |
| **VoiceOver** | Free (Apple) | Tree-level via AX APIs/XCTest; gesture feel + speech coherence = human |
| **TalkBack** | Free (Android) | Tree-level via UIAutomator/Espresso AccessibilityChecks; gestures = human |

- Honest ceiling: **fully automatable** = accessibility-tree assertions (labels,
  roles, states, focus) + coarse NVDA speech-output assertions. **Human** = alt-text
  meaning, announcement order/coherence, gestures, Braille, cross-reader parity.
  Industry: automated checkers miss ~75% of real AT bugs (Assistiv Labs); Deque 57%.
- Existing: Google ATF, Espresso AccessibilityChecks, Assistiv Labs (commercial
  remote real-SR sessions).

## 8. Standards status (2026)

- **WCAG 2.2:** W3C Rec Oct 2023 (2.2.2 update Dec 2024). 9 new SCs (2.4.11–13 focus,
  2.5.7/2.5.8 dragging/target-size, 3.2.6 consistent help, 3.3.7–9 auth/redundant
  entry); 4.1.1 Parsing removed. **Automated coverage of the new SCs is thin.**
- **WCAG 2.3:** no TR yet (draft only).
- **WCAG 3.0:** Working Draft Mar 2026. Bronze/Silver/Gold; outcomes→requirements→
  assertions; **no longer names APCA** — don't hard-code it. Not certifiable yet.
- **W3C Accessibility Maturity Model (AMM):** published **Group Note 4 Nov 2025** —
  **7 Dimensions** (Communications · ICT Development Lifecycle · Knowledge and
  Skills · Oversight & Culture · Personnel · Procurement · Support) × **4 cumulative
  levels** (Inactive → Launch → Integrate → Optimize), evaluated via **Proof Points**
  per dimension. Only existing tooling: an experimental Excel scoring sheet.
  **No commercial product implements this — wide-open space.**
- **Automation coverage stats:** Deque: 57% of issue volume; ~28/86 SCs (~33%) by
  count; W3C WAI: tools "can only assist." (The ~40% figure is folklore.)

---

## 9. Consolidated gaps — what a better tool does

1. **One platform, one data model.** Deque = 5 SKUs; MS = 4 products; WAVE =
   extension+API+PopeTech. Winner: single system where findings → needs-review →
   manual verdicts → tickets → ACR/VPAT all live in one database.
2. **Enterprise pricing opacity.** Every serious tier is sales-quote. Published
   self-serve pricing (or clear internal cost) is a wedge.
3. **Design-tool depth.** Axe for Figma = contrast/target-size/headings annotations
   only; WAVE/AI4Web: nothing. Winner: full Figma audit (text contrast w/ correct
   alpha blending, touch targets, alt-text presence, reading order, design-token
   pass) + **image/screenshot upload mode** (no market tool accepts an image).
4. **Contrast engine.** Nobody computes gradient/image backgrounds, nobody does
   token-level batch audits, nobody offers "darken by X to pass AA" remediation,
   nobody is APCA-ready. All three are free wins.
5. **First-class needs-review.** Market tools hide/under-weight axe `incomplete`
   (AI4Web excludes 6 rules; Lighthouse weights them 0; WAVE can't certify). Winner:
   per-rule confidence + evidence + human verdict workflow.
6. **Keyboard behavior automation.** Tab-order, focus traps, focus visibility,
   skip-links are manual/assisted in every tool. A Playwright walkthrough automates
   them — unique.
7. **Maturity scoring.** W3C AMM published Nov 2025, no tooling exists. A module
   that combines the 7×4 model with automated evidence (violation trend, remediation
   rate, scan coverage) is a first-mover enterprise sell.
8. **Screen-reader workflows built in.** Guided NVDA (automated speech assertions) +
   proctored VoiceOver/TalkBack/JAWS scripts with evidence capture.
9. **WCAG 2.2-focused checks + ACR/VPAT export.** New-SC coverage is thin everywhere;
   law-firm-grade ACR/VPAT output wins EAA/ADA buyers.
10. **Client-ready executive reporting.** Everyone exports HTML/JSON developer
    reports. White-label executive PDF/PPTX with maturity score + remediation
    roadmap is what agencies actually sell to clients.
11. **AI done honestly.** Deque sells single-vendor accept/reject fixes. Winner:
    multi-model remediation with **verifiable before/after axe runs**, plain-language
    explanations, and "ask the report" chat — with the LLM strictly additive
    (never generating findings).
