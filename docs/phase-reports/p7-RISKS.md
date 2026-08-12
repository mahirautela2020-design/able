# P7 — NVDA Screen Reader Automation — Risks & Mitigations

> Reconciled v3 against `P7_NVDA_SPEC.md` §42-46 + standing guardrails
> (ENTERPRISE_SPEC §2, AGENTS.md).

## Hard blockers (stop + report)
1. **NVDA binary absent** on Windows worker / local dev. P7 cannot auto-install.
   Mitigation: `detectNvda()` feature-detect first; every surface degrades to
   `{ available: false }`. BLOCKER-IF-ABSENT only for SETUP node, not CI.
2. **Non-Windows / Vercel serverless.** Named-pipe IPC is Windows-only (§43).
   Driver returns `{ available: false }` when `platform !== 'win32'`; HTTP 200
   `{ available: false }`, documented limitation (§29). Any assumption of
   server-side NVDA = spec contradiction → ORCHESTRATOR §6.3.
3. **Node named-pipe IPC** — `net.createConnection('\\.\pipe\nvdaControllerClient')`
   on Windows; invalid path elsewhere → catch, return `{ available: false }`
   (never throws).

## Spec ambiguities
4. **Spoken-text capture API.** `nvdaController_speakText` SPEAKS; real capture
   is `nvdaController_getSpokenText`/braille (version-varies). Builder verifies
   API surface against installed NVDA's controller headers before locking
   `speech.ts`; wrong name forces rewrite.
5. **`needs_review` vs `findings` polarity.** Spec: ALL → `needs_review`; only
   provably-silent interactive → `findings`. Inversion breaks the
   LLM-never-creates-findings guardrail. Mitigation: guardrail test
   `tests/guardrails/nvda-silent-only.test.ts`.

## Concurrency / process hazards
6. **Zombie NVDA process** on failed/hung run. 3 s timeout (§46) on every call;
   `shutdown()` closes pipe (does NOT auto-start NVDA in v1 — safer reading of
   silent spec, ORCHESTRATOR §6.3).
7. **Single-instance NVDA** — concurrent runs collide on the pipe. Route-layer
   mutex keyed by audit id (in-process `Map`); fleet control out of scope.

## axe-core / WCAG coupling + PII
8. **No new LLM findings.** `nvda-checks.ts` pure functions; guardrail test
   asserts LLM summary never reads NVDA announcements as the verdict source.
9. **P5 overlap.** P7 must NOT modify `src/report/sections/sr-maturity.tsx` or
   `src/audit/schemas/maturity.ts`.
10. **NVDA reads form inputs aloud** — transcripts may contain typed values.
    Snapshot focuses on static audited DOM (GET-only, no submit); `<input
    type="password">` → redact spoken text to `'★'.repeat(len)`. Test asserts.

## CI gap + Next.js 16 shape
11. **CI green while NVDA never ran.** Fixture tests pass anywhere; browser
    test `it.skip` when unavailable. Gate real-NVDA e2e on `P7_NVDA_E2E=1`,
    doc in CONTRIBUTING-adjacent docs.
12. **Next.js 16 route handler shape.** AGENTS.md warns of breaking changes vs
    training data. Builder reads `node_modules/next/dist/docs/` for the
    route-handler API BEFORE writing the route; wrong shape → runtime 500.
13. **Credential check.** None — NVDA is a binary, not an account. Still
    BLOCKER-IF-ABSENT for SETUP node local e2e.