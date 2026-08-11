<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Able — Enterprise Accessibility Auditor

> Your job: build this product, phase by phase. Start here.

## First instruction

**Read `BUILD_EVERYTHING.md`** — the master index listing every file, build order,
and deployment path. Then read **`AUTOPILOT.md`** — the self-directing build loop.

## Deployment path

**Path A — Personal portfolio (my choice):** Vercel (Hobby) + Supabase (free) + Inngest
(free). Design system: shadcn/ui. This tool is MY IP — I own it, I deployed it on my
personal accounts, I use it in my FDE/GenAI interviews and portfolio.

## Build mode (AUTOPILOT — no user decisions needed)

Follow `AUTOPILOT.md`. The loop protocol per phase:

```
execute → verify (npm run verify + browser tests with CHROME_EXECUTABLE_PATH)
→ fix until green → commit → report → advance to next node in the phase graph
```

P0 is **COMPLETE** (42/42 tests, committed). The next node is **SETUP (local
end-to-end)**: real Supabase + Inngest keys, schema migration, private evidence
bucket, then a live URL audit through the UI. Only stop for the four blockers
listed in AUTOPILOT.md (placeholder .env, 5 failed fix attempts, missing
credentials, spec contradiction).

## Key files

| File | Load when |
|---|---|
| `BUILD_EVERYTHING.md` | Always first — master index, build sequence |
| `AUTOPILOT.md` | **The build loop — follow this during every phase** |
| `PRODUCT_BLUEPRINT.md` | Competitive context, OSS stack, report structure |
| `DEPLOYMENT_GUIDE.md` | Infrastructure choices (Path A = mine) |
| `P0_BUILD_PROMPT.md` | P0 spec (already executed — reference, don't redo) |
| `REVERSE_ENGINEERING.md` | Market teardown — when building "beat competitor X" features |
| `ENTERPRISE_SPEC.md` | Architecture reference |
| `WORKBENCH_VISION.md` | P1–P2 build target (interactive workbench) |
| `accessibility-auditor-oss-reference.md` | Tool repo links, licenses, maturity flags |

## Standing rules

- Never weaken the guardrails (ENTERPRISE_SPEC §2): LLM never creates findings,
  settle-before-scan, evidence-first, pinned local axe-core, RLS deny-all, SSRF guard.
- OSS stack only — no paid APIs (PRODUCT_BLUEPRINT §2).
- Personal infra only — never Coforge infra.
- Browser tests: `CHROME_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"`
- Never run two dev servers — check port 3000, kill stale PIDs with
  `taskkill /PID <pid> /F`.
