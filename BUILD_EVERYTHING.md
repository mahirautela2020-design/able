# BUILD_EVERYTHING.md — Master Build Sequence for Claude Code

> Everything you need to build the full accessibility auditor, phase by phase.
> This is the index. Hand it to Claude Code with the target deployment profile.

---

## 0. Choose your deployment (do this FIRST)

**Path A — Personal portfolio (recommended):** Vercel (free) + Supabase (free) + Inngest (free).
You own the IP. A live public URL you can demo in interviews. Free tier limits are
fine for demo-scale traffic. Follow `DEPLOYMENT_GUIDE.md` §A.

**Path B — Coforge enterprise:** Azure Windows VM (2vCPU/7.95GB) + local Postgres 16.
Follow `P0_BUILD_PROMPT.md` (which targets the VM) and `DEPLOYMENT_GUIDE.md` §B.

**Path C — Hybrid:** build all phases on Path A (personal), keep enterprise features
(SSO, multi-tenant, on-prem) in code/documentation for a potential Coforge license deal.
This is the recommended long-term strategy: own the core, monetize enterprise separately.

## 1. File index — the complete spec

| File | Purpose |
|---|---|
| `PRODUCT_BLUEPRINT.md` | **Always load first.** Competitive pitch, OSS stack (verified), report structure, MCP strategy. Claude needs this for context on every build. |
| `REVERSE_ENGINEERING.md` | Market teardown — what every competitor does, where they're weak. Claude uses this when building features that "beat" a specific tool. |
| `ENTERPRISE_SPEC.md` | Architecture, data model, engine layer, WCAG layer, maturity module, enterprise features. The technical blueprint. |
| `WORKBENCH_VISION.md` | Explore workbench interactions (10 interactions, module control, import modes). Build target for P1–P2. |
| `P0_BUILD_PROMPT.md` | **Executable prompt for P0 (enterprise VM path).** Queue + worker + browser pool + settle-scan + WCAG registry + keyboard walkthrough + report v1. |
| `DEPLOYMENT_GUIDE.md` | Personal (Vercel/Supabase/Inngest) and Enterprise (Azure VM) deployment paths. |
| `accessibility-auditor-oss-reference.md` | Raw 20KB OSS tool reference (repos, licenses, last-commit, maturity flags). Load when Claude needs specifics on a dependency. |

## 2. Build sequence (run in order — each builds on the last)

### Phase 0: Engine Core (3–4 weeks of Claude sessions)

**Prompt:** `P0_BUILD_PROMPT.md` — targets Vercel + Supabase + Inngest + shadcn/ui
directly. The prompt is self-contained: scaffold, Inngest function per page step,
@sparticuz/chromium on Vercel, Supabase schema + storage, shadcn/ui components for
the report viewer and submit form. No adaptation needed — Claude follows it as-is.

### Phase 1: Explore Workbench (3–4 weeks)

Build the interactive workbench per `WORKBENCH_VISION.md` §2:
- Live session (Playwright + CDP, mirrored to the UI)
- Element inspector (accessible tree + live contrast + role/ARIA/touch-targets)
- Live contrast fix-in-place + keyboard replay + color-blind overlays + ARIA tree

**Note:** the Explore workbench runs a live Chromium session. On Vercel (Path A), this is
constrained — live sessions need the Node runtime. **Recommendation:** develop locally
on your Windows machine using `npx next dev` and point it at your personal Supabase for
persistence. The Explore workbench is a dev-experience feature — demo it live in
interviews from your laptop; the batch URL auditor can be public on Vercel.

### Phase 2: Module Control + Portals

- Module selector UI (toggle cards per `WORKBENCH_VISION.md` §3)
- Session import (login in Explore → reuse in Audit for SSO-protected portals)
- Needs-review UI (axe `incomplete` → human verdict interface)
- Multi-viewport scans (mobile/tablet/desktop)
- Regional regulation mapping (port from your old repo's `lib/accessibility/regional-compliance.ts`)

### Phase 3: Figma + Image

- Figma MCP server (Figma-Context-MCP MIT or custom REST wrapper) — extract tokens,
  run contrast engine, touch-target checks, alt-presence, reading order
- Image upload → vision-LLM advisory report (marked "needs review" always)
- Contrast engine unit tests (validated against WebAIM/Vispero CCA known pairs)

### Phase 4: Mobile + Code Audit

- APK static analysis (Android SDK command-line tools + lint a11y checks — Windows-installable)
- Code audit MCP wrappers (eslint-jsx-a11y, @angular-eslint, vue-a11y, html-validate)
- @axe-core/cli for CI URL scans

### Phase 5: Screen Readers + Maturity + ACR/VPAT

- NVDA out-of-process (separate VM/service), guided VO/TalkBack/JAWS scripts
- W3C AMM maturity module (7 dimensions, 4 levels, questionnaire + automated evidence)
- ACR/VPAT export from the findings table
- PDF/PPTX export for executive reports

### Phase 6: Enterprise Shell

- SSO (Entra ID / OIDC / SAML), RBAC, multi-tenant
- REST API + webhooks, scheduled re-scans, Jira/Azure DevOps export
- MCP plugin framework for third-party app connectivity

## 3. Estimated Claude API spend (rough, per phase)

| Phase | Claude sessions | ~Tokens | ~Cost |
|---|---|---|---|
| P0 | 5–10 sessions | Heavy (15K-context prompts, full-codebase edits) | ~$15–40 |
| P1 | 3–6 sessions | Medium (UI-heavy, less backend complexity) | ~$10–25 |
| P2–P6 | 15–30 sessions cumulative | Variable | ~$50–150 |
| **Total** | | | **~$75–215** |

(Assuming Claude Code usage. Your old workflow was Claude.ai + manual edits — same ballpark.)

## 4. First command to give Claude

Load `PRODUCT_BLUEPRINT.md` first, then the appropriate P0 prompt. Example:

> "You are building DesignVelocity, an enterprise accessibility auditor.
> Read `PRODUCT_BLUEPRINT.md` and the deployment I've chosen in
> `DEPLOYMENT_GUIDE.md`. Then execute the P0 build from `P0_BUILD_PROMPT.md`
> (or its personal-Vercel adaptation). Start with scaffolding the project."

---

*This is the master index. When in doubt, always point Claude at `PRODUCT_BLUEPRINT.md`
first — it contains the OSS stack, competitive target, and report design that every
subsequent build must align with.*
