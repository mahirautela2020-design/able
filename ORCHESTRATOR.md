# ORCHESTRATOR — Multi-Agent Build Graph for Able

> One kickoff. Four roles. Six phases. Zero decisions needed until you test.
> The agent graph runs autonomously: each phase is researched, built, verified by
> deterministic gates, and landed as a PR on `main`. You only act when the run
> finishes (test on local server) or a hard blocker fires.

---

## 1. The agent graph

```
                 ┌─────────────────────────────────────────────────┐
                 │                 run-build.sh                     │
                 │   (bash orchestrator — git-bash on Windows)      │
                 └─────────────────────────────────────────────────┘
                                    │
        for each phase in P1 → P6   │
                                    ▼
        ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
        │  RESEARCHER  │ ───► │   BUILDER    │ ───► │  VERIFIER    │
        │  (kimi-k3)   │      │ (deepseek-   │      │ (shell —     │
        │  spec →      │      │  v4-pro)     │      │  deterministic│
        │  TASKS+RISKS │      │  implements  │      │  gates)      │
        └──────────────┘      └──────┬───────┘      └──────┬───────┘
                                     │                      │
                                     │   ┌─── fail ─────────┘
                                     │   │   (feeds failure
                                     │   │    output back to
                                     │   │    BUILDER, max 5)
                                     ▼   ▼
                              ┌──────────────┐
                              │  PR-RAISER   │
                              │ (git + gh —  │
                              │  branch,     │
                              │  commit,     │
                              │  push, PR)   │
                              └──────┬───────┘
                                     ▼
                              next phase →
```

## 2. Roles & contracts

| Role | Tool | Input → Output | Files |
|---|---|---|---|
| **Researcher** | `opencode run` + **glm-5.2** (cheap, strong analysis — was kimi-k3) | phase spec (WORKBENCH_VISION / ENTERPRISE_SPEC / BLUEPRINT) → `docs/phase-reports/PX-TASKS.md` (task checklist) + `PX-RISKS.md` (what could break) | `AGENTS/researcher.md` |
| **Builder** | `opencode run` + **deepseek-v4-pro** | phase spec + TASKS + RISKS (+ verifier failure output on retry) → implemented code, tests added | `AGENTS/builder.md` |
| **Verifier** | bash script (no LLM) | repo state → GREEN/FAIL (exit code) — `npm run verify` + browser tests with Chrome + phase gates | `AGENTS/verifier.sh` |
| **PR-raiser** | git + gh (no LLM) | green repo → `phase/pX-<name>` branch, commit, push, PR into `main` | `AGENTS/pr-riser.sh` |

## 3. The loop (per phase, inside run-build.sh)

```
1. RESEARCH   — kimi-k3 reads the phase spec → writes TASKS + RISKS (≤5 min)
2. BUILD      — deepseek-v4-pro implements, guided by TASKS/RISKS (10–30 min)
3. VERIFY     — verifier.sh: npm run verify + browser tests (2–4 min)
   ├─ GREEN → go to 5
   └─ FAIL  → capture output, feed to BUILDER ("fix these failures"), loop 2–4
               (max 5 attempts per phase, then hard-stop + report)
4. PR         — pr-riser.sh: branch phase/pX-*, commit, push, gh pr create → main
5. LOG        — append run summary to build-logs/run.log; advance to next phase
```

## 4. Phase → spec → branch mapping

| Node | Spec | Branch | Verify gates (beyond npm run verify) |
|---|---|---|---|
| **SETUP** (deferred — needs user keys) | P0_BUILD_PROMPT §4 | — | requires real Supabase/Inngest keys; skipped until user provides |
| **P1** Explore workbench | WORKBENCH_VISION.md §2 | `phase/p1-workbench` | browser tests green; AX-snapshot smoke test |
| **P2** Module control + portals | WORKBENCH_VISION.md §3 | `phase/p2-modules` | module-toggle unit tests; regulation mapping fixture |
| **P3** Figma + Image | PRODUCT_BLUEPRINT §2, ENTERPRISE_SPEC §10 | `phase/p3-figma-image` | contrast-pairs tests; Figma client parse fixture |
| **P4** Mobile + Code audit | PRODUCT_BLUEPRINT §2, ENTERPRISE_SPEC §10 | `phase/p4-mobile-code` | APK lint fixture; code-lint wrapper tests |
| **P5** Screen readers + maturity + ACR/VPAT | ENTERPRISE_SPEC §7-8 | `phase/p5-sr-maturity` | maturity questionnaire unit tests; ACR/VPAT export fixture |
| **P6** Enterprise shell | ENTERPRISE_SPEC §11 | `phase/p6-enterprise` | API auth/RBAC unit tests; MCP wrapper smoke |

## 5. Standing rules (same as AUTOPILOT — the agent never violates these)

- LLM never creates findings; settle-before-scan verbatim; evidence-first; pinned
  local axe-core; RLS deny-all; SSRF guard intact. (ENTERPRISE_SPEC §2.)
- OSS stack only (PRODUCT_BLUEPRINT §2). Personal infra only — never Coforge.
- Every phase lands on `main` via PR only — never direct pushes.
- Browser tests: `CHROME_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"`.
- Never run two dev servers; kill stale PIDs (`taskkill /PID <pid> /F`) before dev.
- Commit small, messages descriptive, no secrets ever (`.env*` gitignored).

## 6. Hard blockers (run stops, you get a report)

1. Verifier fails 5 consecutive times on one phase.
2. A phase needs credentials the agent can't create (e.g., Figma PAT — P3 will flag it).
3. Spec contradiction — agent picks the safer interpretation and notes it in the PR.
4. Any paid-API or Coforge-infra temptation — stop and report.

## 7. Cost & runtime estimate (whole run, P1→P6)

- Researcher: glm-5.2 × 5 phases ≈ $1–3
- Builder: deepseek-v4-pro × ~10–18 sessions (incl. retries) ≈ $15–45
- Verifier/PR: $0 (shell)
- **Total ≈ $16–48 · wall-clock ≈ 2–4 hours** (run `bash run-build.sh` in background;
  check `build-logs/run.log` for progress; PRs appear on GitHub as each phase lands)

## 8. After the run finishes

- 5 PRs on `main` (P1–P6), each independently reviewable and revertible.
- Then YOU: `git checkout main && git pull`, run `npm run dev`, test locally.
- SETUP node (Supabase/Inngest/Vercel) happens when you have keys — see
  `DEPLOYMENT_GUIDE.md` Path A. The agent cannot create accounts for you.
