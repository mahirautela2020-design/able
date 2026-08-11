# Workbench Vision — The Interactive Accessibility Tool (brainstorm, 2026-08-07)

> User-driven requirement: full interactive accessibility tool — not modal→URL→report.
> User controls which modules to test (ARIA, keyboard, color blindness, screen reader,
> ACR, VPAT, contrast, mobile/web/tablet, touch targets…), can inspect ANY element,
> tweak the DOM in a playground, retest, and import artifacts (website, portal, APK,
> iOS app, Figma, image). Companion docs: ENTERPRISE_SPEC.md, P0_BUILD_PROMPT.md.

---

## 1. The reframe: two products in one

Market tools are batch scanners or dev extensions. We build a **workbench**:

| Mode | What it is | Who it's for | Output |
|---|---|---|---|
| **Audit** (batch) | URL/portal/Figma/APK/IPA → pick modules → run → evidence report | Compliance, delivery leads, sales | ACR/VPAT, executive report, maturity, per-SC matrix |
| **Explore** (interactive) | A live, remote product session you drive from our UI — click any element, inspect its full a11y profile, tweak it, retest live | Designers, QA, devs | Live findings, fixes, recorded flows, saved sessions for batch audit |

One product, one data model: Explore findings save into the same `findings` table as
Audit runs; the report engine can't tell them apart. **This is the gap**: axe DevTools
is the closest (but dev-extension-only, dev-jargon, no designer UX); WAVE is a
static overlay; Accessibility Insights' "Ad hoc" tools are per-page extensions. A web
workbench with live session + designer-first UX + report linkage is unclaimed.

## 2. Explore mode — the interactions (designer-first)

1. **Element picker (the headline).** Hover/click any element in the live mirrored
   view → inspector panel shows: accessible name (from the real accessibility tree),
   role, ARIA attributes, **live contrast ratio + pass/fail per level**, font size,
   touch-target size, tab-order position, focus style, ancestor chain, and the WCAG
   criteria it maps to. One click → "save to report."
2. **Live contrast + one-click fixes.** "4.2:1 — fails AA (needs 4.5:1). Fix: darken
   text to #595959 → 5.1:1 ✅". Apply in playground → element restyles in-session →
   re-run checks → green. Export the exact CSS fix into the report. (Beats every
   contrast checker: they show a number, we show the fix and let you try it.)
3. **Keyboard replay.** Play/pause Tab traversal with numbered focus rings; live
   detection of traps, missing focus styles, order vs visual layout mismatch. The
   P0 keyboard walkthrough becomes interactive here.
4. **Color-blind simulation overlays.** Live viewport filters (protanopia,
   deuteranopia, tritanopia, achromatopsia) + **recompute every contrast pair under
   the simulation** — flag pairs that fail only for color-blind users. No market tool
   computes this; it's a genuine differentiator and cheap to build (CSS filters +
   colorjs.io simulation matrices).
5. **Screen-reader read-along.** Play the accessibility tree as simulated speech
   (honest label: "simulated — verify with real NVDA/VoiceOver"). Lets designers
   "hear" the page without installing anything. Real-SR mode: launch a guided NVDA
   session on the VM (out-of-process) with evidence capture.
6. **Touch-target heatmap.** Overlay circles on interactive elements; red < 24×24
   (2.5.8), orange 24–44, with spacing info. Toggle mobile/tablet/web viewports.
7. **ARIA tree.** Collapsible structure view (roles/states/names) — click a node →
   element highlighted. Like WAVE's ARIA panel, but interactive and live.
8. **DOM tweak console.** Safe presets first ("add alt text", "add label", "change
   color") with instant re-run; raw DOM view for advanced users — the "tweak it
   through inspect" ask, minus the learning curve.
9. **Flow recorder.** Record a journey (login → form → checkout) once; replay it in
   audits — each step audited (dynamic content, focus management, live regions,
   state changes). This is the "user-flow analysis" Deque sells in Pro — ours is
   native to the workbench, free, and OSS-built.
10. **Session manager.** Logins, cookies, headers saved per project (portals behind
    SSO!) → the batch Audit reuses them. Enterprise-critical for internal portals.

## 3. Audit mode — module control (the user's first ask)

Configuration screen with toggle cards (saved presets: Quick / Standard / Compliance
/ Full). Each card shows: what it checks, WCAG SCs covered, est. runtime.

| Module | Engine | WCAG focus |
|---|---|---|
| Automated A/AA/AAA | axe-core 4.13 | all automatable SCs |
| Needs review | axe `incomplete` | human-judgment bucket |
| Keyboard behavior | Playwright walkthrough | 2.1.1/2.1.2/2.4.1/2.4.3/2.4.7/2.4.11 |
| ARIA structure | axe + AX tree | 4.1.2/4.1.3 |
| Contrast & color-blind | contrast engine + sim matrices | 1.4.3/1.4.11/1.4.6 + CVD |
| Touch targets | geometry checks | 2.5.8/2.5.5 |
| Responsive (mobile/tablet/web) | multi-viewport scans | 1.4.4/1.4.10 |
| Screen reader | tree assertions (all 4 SRs) + guided scripts | 1.1.1/4.1.x + SR behavior |
| Performance | Lighthouse core (optional) | context, not WCAG |
| Manual checklist | guided tests | the ~60% that can't be automated |
| **Outputs:** ACR · VPAT · executive report · maturity | report generators | compliance |

## 4. Import reality check (honest, VM-feasible)

| Artifact | Feasibility | Approach |
|---|---|---|
| URL / portal | ✅ now | Playwright; session import from Explore logins |
| Figma | ✅ P2 | REST API + contrast engine + tokens |
| Image | ✅ P3 | vision-LLM advisory + guided checklist |
| **APK (Android)** | ⚠️ static ✅ / dynamic ⚠️ | **Static (no device, ship first):** `aapt2` + **Android Lint accessibility checks** (OSS, part of Android SDK) + XML/layout scan (missing contentDescription, labelFor, small touch targets, sp-vs-px, contrast from colors) + manifest (targetSdk, permissions). **Dynamic (device/emulator):** Google ATF + UIAutomator tree assertions. Emulator needs nested virtualization — Azure supports it on Dv3+ (not B-series); or a real Android device on the network via adb. Design for both; ship static. |
| **iOS (.ipa)** | ❌ full automation on Windows | Needs macOS/Xcode (simulator) or a Mac cloud (paid). Ship: guided manual checklist + report template + test scripts for a Mac in the office. Honest limitation, documented. |
| Desktop apps | ❌ v1 | Windows UI Automation later if a client demands it |

## 5. Technical feasibility (all OSS, fits the stack)

- **Live session:** Playwright + CDP — one Chromium instance on the VM, our UI mirrors
  it (screenshot stream / DOM proxy), clicks map back via coordinates/AX snapshot.
- **Accessibility tree:** Playwright's `page.accessibility` snapshot API — the real AX
  tree (labels, roles, states) with zero extra deps. This is the enabler for the
  element inspector and read-along.
- **Per-element checks:** axe `context: { include: [selector] }` for focused runs;
  computed styles via CDP for live contrast; colorjs.io for ratios + CVD simulation
  matrices; CSS `filter` for viewport overlays.
- **DOM tweaks:** in-session `evaluate` style/attr patches, then re-run axe on the
  patch scope. No page reload → instant retest.
- **APK static:** Android SDK command-line tools (aapt2, lint) are OSS/free — run on
  the Windows VM natively.
- **NVDA:** out-of-process on a test VM (GPL, never embedded) — see ENTERPRISE_SPEC.

## 6. Revised roadmap

| Phase | Scope | Est. |
|---|---|---|
| P0 | Engine core (settle-scan, WCAG registry + matrix, keyboard walkthrough, queue/worker, report v1) | 3–4 wks |
| **P1** | **Explore workbench v1**: live session + element inspector + live contrast/fixes + keyboard replay + color-blind overlays + ARIA tree | 3–4 wks |
| P2 | Audit mode polish: **module selector**, session import (portals), needs-review UI, multi-viewport, auth | 2 wks |
| P3 | Figma mode + Image mode | 3 wks |
| P4 | **APK static analysis** (aapt2 + lint + XML/color scan) | 2 wks |
| P5 | Screen-reader module (NVDA out-of-process + guided SR) + maturity + ACR/VPAT generators | 3 wks |
| P6 | Enterprise shell: SSO/RBAC/tenants/API/webhooks/scheduling + CI/CLI | 3 wks |
| **Total** | | ~5–6 months |

P1 is the demo centerpiece: a designer clicking a live product, seeing contrast fail,
pressing "fix" and watching it pass — that's the sales story no competitor can tell.

## 7. Open questions to lock down next

1. APK dynamic testing: does Coforge have Android devices/adb access, or a VM size
   that supports nested virtualization (Dv3+)? Determines if dynamic mode ships.
2. Is there a Mac anywhere at Coforge for iOS checklist/devices? (No = iOS stays
   checklist-only.)
3. Explore session persistence: how long do sessions live (minutes? hours?)? Affects
   VM memory (a live Chromium holds ~600 MB — 2 sessions max on this box).
4. Do we keep batch-only for clients (report output) and Explore as an internal
   designer tool first? (Recommended: yes — Explore demos internally, Audit ships.)
