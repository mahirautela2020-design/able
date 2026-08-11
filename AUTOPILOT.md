# Able — Build Autopilot (Self-Directing Agent Loop)

> You are the build agent for Able. You run the phase graph below WITHOUT asking the
> user for decisions. Each phase: execute tasks → run verify gates → fix until green →
> commit → report → advance. Only stop for a blocker you cannot resolve, and say
> exactly what you need.

## The loop protocol (repeat for every phase)

```
1. READ the phase spec (BUILD_EVERYTHING.md + phase file listed in the node below)
2. EXECUTE the tasks in order
3. VERIFY: npm run verify (lint, typecheck, tests, build)
   + run browser tests with CHROME_EXECUTABLE_PATH set
   + any phase-specific gates listed in the node
4. If ANY gate fails: fix the code, re-run, repeat until green. Do not advance
   with a red gate. (Max 5 fix attempts — then stop and report the blocker.)
5. COMMIT: git add -A && git commit with a descriptive message
6. REPORT: one-paragraph summary of what shipped + gate results
7. ADVANCE to the next node. Loop until the graph is exhausted.
```

## The phase graph

```
[P0] Engine core  ──────────────────────────────── DONE ✅ (committed)
   spec: P0_BUILD_PROMPT.md
   gates: 86-SC registry test · CSR fixture (settled vs unsettled) ·
          focus-trap fixture · SSRF tests · npm run verify green
   status: COMPLETE (42/42 tests) — do NOT redo unless a later phase breaks it
        │
        ▼
[SETUP] Local end-to-end ───────────────────────── NEXT
   tasks:
     a. Verify .env.local has REAL values (not <project>/eyJ... placeholders).
        If placeholders: STOP and report — user must create the Supabase project
        + Inngest workspace and paste real keys. This is the only user-input step.
     b. Run the SQL schema from P0_BUILD_PROMPT.md §4 in Supabase SQL editor
        (audits, audit_pages, findings + RLS enable + zero policies).
     c. Create private `evidence` bucket in Supabase Storage.
     d. Start Inngest: `npm run inngest:dev` (or rely on Inngest Cloud).
     e. `npm run dev`, submit a real URL, watch queued→running→complete.
     f. Open /audits/[id]: compliance matrix renders, findings have crops.
   gates: end-to-end audit completes · report renders · evidence URLs resolve
        │
        ▼
[P1] Explore workbench  ────────────────────────── NEXT after SETUP
   spec: WORKBENCH_VISION.md §2
   scope: live session (Playwright + CDP), element inspector (AX tree via
          page.accessibility.snapshot), live contrast + fix-in-place,
          keyboard replay, color-blind overlays, ARIA tree
   gates: inspector shows real AX data on a live page · contrast fix applies ·
          keyboard replay flags the focus-trap fixture · npm run verify green
        │
        ▼
[P2] Audit polish + module control  ────────────── after P1
   spec: WORKBENCH_VISION.md §3
   scope: module selector toggle cards, session import (portals), needs-review
          UI, multi-viewport, regional regulation mapping (port from old repo)
   gates: module toggles change the scan · portal session reused ·
          regulation appendix in report · npm run verify green
        │
        ▼
[P3] Figma + Image  ─────────────────────────────── after P2
   spec: PRODUCT_BLUEPRINT.md §2 (Figma row), ENTERPRISE_SPEC.md §10
   scope: Figma REST API client (Figma-Context-MCP pattern), contrast engine on
          design tokens, touch targets, alt presence; image upload → vision-LLM
          advisory (needs_review only)
   gates: Figma file audit produces findings · contrast matches WebAIM on test
          pairs · image advisory report renders · npm run verify green
        │
        ▼
[P4] Mobile + Code audit  ───────────────────────── after P3
   scope: APK static (aapt2 + lint a11y checks), code audit (eslint-plugin-jsx-a11y,
          @angular-eslint, vue-a11y, html-validate via MCP wrapper)
   gates: APK fixture produces findings · lint wrapper returns file:line findings ·
          npm run verify green
        │
        ▼
[P5] Screen readers + maturity + ACR/VPAT  ──────── after P4
   scope: NVDA out-of-process (nvdaControllerClient), guided VO/TB/JAWS scripts,
          W3C AMM maturity module (7 dimensions × 4 levels), ACR/VPAT export
   gates: NVDA speech assertion test · maturity score persists · ACR/VPAT
          exports from findings · npm run verify green
        │
        ▼
[P6] Enterprise shell  ──────────────────────────── after P5
   scope: SSO (Entra ID/OIDC/SAML), RBAC, multi-tenant, API, webhooks,
          scheduling, MCP plugin framework, CI/CD wrappers
   gates: auth required on API · RBAC denies unauthorized · scheduled re-scan
          runs · npm run verify green
        │
        ▼
[DONE] Post-mortem report
   deliver: BUILD_EVERYTHING.md phase checklist fully ticked · README updated ·
            deploy guide current · final verify green
```

## Standing rules (every phase)

- **Never weaken the guardrails** (ENTERPRISE_SPEC §2): LLM never creates findings,
  settle-before-scan verbatim, evidence-first schema, pinned local axe-core, RLS
  stays deny-all, SSRF guard stays.
- **Commit at every green gate.** Small commits, descriptive messages.
- **Browser tests need Chrome**: run with
  `CHROME_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"`.
- **Never run two dev servers.** Check port 3000 first; kill stale PIDs with
  `taskkill /PID <pid> /F` before starting.
- **Supabase free tier**: 500MB DB, private evidence bucket, signed URLs, daily
  health ping cron. Never store base64 in the DB.
- **Do not introduce paid APIs.** OSS stack only (see PRODUCT_BLUEPRINT §2).
- **You are building on the user's personal infra.** Deploy to their Vercel,
  their Supabase, their Inngest. Never Coforge infra.

## Blockers that justify stopping (report, don't loop)

1. .env.local has placeholder values (need real Supabase/Inngest keys from user)
2. A gate fails 5 consecutive fix attempts
3. The task requires an account/credential you cannot create
4. A spec file contradicts itself — flag it, pick the safer interpretation,
   note the decision in the commit message
