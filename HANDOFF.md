# ScanA11y — Agent Handoff / Current State

> Read this first. Read ORCHESTRATOR.md, AGENTS.md, CLAUDE.md for roles/conventions.
> Latest: P11 merged. Build graph is CLAUDE-backed (AGENT_BACKEND=claude, `run-build.sh`).

## How to run an agent phase (do NOT use opencode-go — use Claude Code)
```bash
cd "M:/Asus Laptop/Desktop/Able"
AGENT_BACKEND=claude bash run-build.sh <phase-key>   # e.g. p12
```
- Researcher → builder → verifier → PR-raiser run via `claude -p` (Pro sub, $0 opencode-go).
- Phase keys: p1..p6 (ENTERPRISE_SPEC), p7 (NVDA), p8 (vision), p9 (APK), p10 (iOS), p11 (SR engine). See the PHASES array in run-build.sh.
- To add a phase: write `<KEY>_SPEC.md`, add a row to the PHASES array, commit, then run.
- Each phase = its own branch → squash-merged PR (non-cumulative).

## Verified current state (main = `87c2f88`, clean tree)
- **All P1–P11 merged.** P0–P10 + P11.
- Test suite: **436 passed / 10 skipped (446 total)** — `npx vitest run`.
- Gates: `npx tsc --noEmit` clean, `npx eslint .` 0 errors, `npm run build` green.
- Deployed: **https://scana11y-nine.vercel.app** (Vercel + Supabase + Inngest Cloud + @sparticuz/chromium + shadcn/ui).

## Product positioning (from PRODUCT_BLUEPRINT.md)
Enterprise WCAG 2.2 accessibility auditor (URL / Figma / image / code / APK / iOS),
human-in-the-loop, W3C maturity, ACR/VPAT, OSS engines only (axe-core 4.13, Playwright,
colorjs.io), zero paid APIs, vision LLM advisory-only. Best-value: axe-parity + breadth + price.

## P11 — Deterministic Browser Screen-Reader Engine (JUST MERGED #12)
Built on the accessibility tree (Playwright `page.accessibility.snapshot`), NOT NVDA.
Files: `src/engine/ax-tree.ts`, `src/engine/ax-checks.ts`, `src/engine/sr-speech.ts`,
`src/components/workbench/sr-preview.tsx`, `src/app/api/audits/[id]/sr-preview/route.ts`,
wired into `src/inngest/functions/audit-url.ts` scan-page-N.
- SR preview panel streams AX-tree speech transcript (headings/buttons/links).
- Checks: empty accessible name → 4.1.2 (serious), role-mismatch → 4.1.2,
  reading-order divergence (AX vs visual) → 1.3.2 (needs_review), duplicate labels → 2.4.4/2.4.7.

## Open items / next phases (pick via spec + PHASES array)
- **P12 — Contrast Lab**: click-to-inspect on preview, AA/AAA/APCA, nearest-fix suggestion, CVD colorblind overlay. (Most visible win.)
- **P13 — Guided Manual Flow**: per-SC wizard + evidence capture, saved progress (MS Accessibility Insights Assessment parity).
- **P14 — Remediation + CI**: per-finding fix suggestions, "mark fixed" → re-scan diff, GitHub Action + JSON/HTML export.
- **P15 — VPAT/ACR 508 export**: formal doc generator from maturity matrix.

## Product-vision requirements (user priorities)
- Match or beat: color contrast checkers, Adobe (ALP), Microsoft (Accessibility Insights),
  NVDA, JAWS. Differentiator = deterministic SR engine (P11) + guided remediation + Contrast Lab.
- Use the browser screen-reader (AX tree) to build SR features IN the tool — no NVDA dependency for CI.
- Multi-page crawl, cross-page dedupe, page-path in every finding (already done).

## Local dev notes
- `INNGEST_DEV=true` + fresh Inngest dev server (`npm run inngest:dev`) + `npm run dev`.
- Windows git-bash: use `"M:/..."` spaced paths; `taskkill /PID`; `rm -rf .next` between builds.
- Pathological sites (koa.com) handled via per-page deadline (`PAGE_SCAN_TIMEOUT_MS`=90s).
- Preview proxy (`/api/preview-proxy`) renders XFO/CSP-blocked sites via server-side fetch.
