# P1 — Explore Workbench: Risks & Mitigations

1. **No real scan data (SETUP deferred).** Findings/AX-snapshot tables empty. Mitigation: committed `__fixtures__/audit-p1.json` drives all UI; `scripts/seed-fixture.ts` loads it; tests never hit live DB.

2. **Supabase keys absent.** BLOCKER-IF-ABSENT for prod reads. Mitigation: `ensureSupabase()` guard; fall back to fixture if `SUPABASE_URL`/`SUPABASE_ANON_KEY` missing or client throws; flag in PR.

3. **AX-snapshot schema drift.** axe-core 4.13 node tree may differ from fixture. Mitigation: pin `axe-core@4.13.x` exact; capture fixture from real `axe.run()` shape; add `isAxNode()` type guard in `lib/axe/types.ts`.

4. **Evidence screenshots slow / expire.** Private Storage URLs expire; large PNG blocks render. Mitigation: `next/image` lazy; placeholder thumbnail for P1 (full variant at scan time = SETUP/P2).

5. **WCAG URL rot.** Hard-coded links may 303/404. Mitigation: single source `lib/wcag.ts` map id→canonical `/Understanding/<id>` (stable); chip reads from there.

6. **Two dev servers on port 3000.** Double-start. Mitigation: `npm run verify` pre-check kills stale PID (`taskkill /PID <pid> /F`) before browser tests; never run two `next dev`.

7. **Playwright + Next 16 + Turbopack e2e flakiness.** Mitigation: run browser gate against `next start` (prod build), not `dev`; document in `e2e/README.md`.

8. **Builder invents findings.** Temptation to stub fake findings to make UI pass. Mitigation: all findings come ONLY from fixture file; no `findings.insert` in app code; reviewer verifies no LLM-generated WCAG claims.

9. **Spec scope creep.** Builder tempted into export/ACR (P5) or modules (P2). Mitigation: TASKS §2 scope only; reviewer rejects out-of-phase code.

10. **Credential blocker check.** P1 needs NO new creds (Figma=P3, Supabase=SETUP). Flag immediately if any task surfaces a credential requirement — do not improvise.