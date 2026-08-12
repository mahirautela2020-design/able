# P7 — NVDA Screen Reader Automation — Task Checklist

> Reconciled v3 against `P7_NVDA_SPEC.md` §13-32. No Inngest step, no Supabase
> evidence row, no walk DSL — spec rejects draft-v1 noise. LLM never creates
> findings (P7 §39, ENTERPRISE_SPEC §2).

## Scope
Drive NVDA via ControllerClient named-pipe IPC against a Playwright Chrome
instance of the audited page; capture announcements (name + role + timestamp);
run deterministic checks; surface in the workbench. Non-Windows / serverless /
no-NVDA degrade to `{ available: false }`.

## Tasks (mirror P7_NVDA_SPEC §13-32)
1. **`src/lib/sr/nvda-driver.ts`** — `detectNvda(): { available, path }`:
   `NVDA_PATH` env else Program Files defaults. Named-pipe IPC via
   `net.createConnection('\\.\pipe\nvdaControllerClient')`; expose `speak(text)`
   + spoken-text capture; **3 s timeout** on every call (§46). Absent →
   `{ available: false }`, never throws.
2. **`src/lib/sr/nvda-snapshot.ts`** — reuse `withPage` (P0/P1); focus elements
   in tab order (reuse P2 `keyboard.ts` results, else native Tab); call speak;
   output `Announcement[] = { at, element, spoken }`.
3. **`src/lib/sr/nvda-checks.ts`** — pure functions, deterministic:
   - interactive-element-named (empty name → silent finding),
   - heading-role-announced (level appears in announcement),
   - focus-order-matches-DOM (vs `keyboard.ts`).
   ALL → `needs_review`; only provably-silent interactive → `findings` (§25-26).
4. **`/api/audits/[id]/nvda/route.ts`** — POST triggers local run; returns
   `announcements + suggestions`. NVDA absent → HTTP 200 `{ available: false }`
   (§29). Verify handler shape against `node_modules/next/dist/docs/`.
5. **`src/components/workbench/nvda-panel.tsx`** — "Screen reader (NVDA)"
   panel listing announcements when available; else honest "run locally with
   NVDA installed" note (§38). Wire into P1 workbench; snapshot both states.
6. **`tests/nvda-checks.test.ts`** — fake announcement-log fixture (no NVDA in
   CI): silent detection, heading-role parsing, focus-order match. Browser
   test `it.skip` when `detectNvda().available === false`.

## Verify gates (P7 §34-39 + ORCHESTRATOR §4 spirit)
- `npm run verify` green; fixture tests pass without NVDA.
- Driver returns `{ available: false }` on Linux/CI (no throw).
- Workbench renders honest "run locally" note when unavailable.
- `nvda-checks.ts` pure functions — no LLM involvement.
- Guardrail regression: findings written ONLY for interactive+empty-spoken.

## Out of scope (P7)
- VoiceOver/JAWS/TalkBack (P5 catalog covers these).
- Installing NVDA — BLOCKER-IF-ABSENT for SETUP node, not CI.
- Live-region announcements (§13 covers focus/headings only).
- Serverless NVDA (architecturally impossible; documented).