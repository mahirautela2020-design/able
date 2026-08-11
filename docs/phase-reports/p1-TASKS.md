# P1 — Explore Workbench: Builder Task Checklist

Phase spec: WORKBENCH_VISION.md §2 (Explore workbench)
Branch: `phase/p1-workbench`
Verify gates: `npm run verify` green; browser tests green; **AX-snapshot smoke test**

## Tasks (each task → files → test name)

1. **App shell + left nav.** Render two-pane layout. Touch `app/(app)/layout.tsx`, `components/workbench/sidebar.tsx`. Test `__tests__/layout.test.tsx` (nav links: Scope, Findings, Evidence).

2. **Scope/audit detail page.** `app/(app)/scope/[auditId]/page.tsx` shows audit name, URL, created date, page count. Reads `audits` + `scope_pages` via `lib/supabase/server.ts`. Test `__tests__/scope-page.test.tsx` renders meta from fixture.

3. **Findings list.** `app/(app)/scope/[auditId]/findings/page.tsx` lists axe-core findings grouped by WCAG criterion. Columns: criterion, severity, count, affected pages. Data from `findings` table (NEVER LLM-generated). Test `__tests__/findings-list.test.tsx`.

4. **Findings filter bar.** `components/workbench/filters.tsx`: severity (critical/serious/moderate/minor), level (A/AA/AAA), page, status. Test `__tests__/filters.test.tsx` narrows list.

5. **Finding detail slide-over.** `components/workbench/finding-detail.tsx`: rule id, failing HTML snippet, fix suggestion, evidence thumb. Test `__tests__/finding-detail.test.tsx` opens on row click, shows pinned axe rule id.

6. **AX-snapshot viewer (SMOKE GATE).** `app/(app)/scope/[auditId]/snapshots/[pageId]/page.tsx` renders stored `ax_snapshots` JSON as accessible tree via `components/workbench/ax-tree.tsx`. Test `__tests__/ax-snapshot.test.tsx` renders tree from fixture JSON.

7. **Evidence viewer.** `components/workbench/evidence-viewer.tsx`: screenshot + DOM snippet + CSS selector. Test `__tests__/evidence-viewer.test.tsx` shows alt text on screenshot.

8. **WCAG criterion chip.** `components/workbench/criterion-chip.tsx` + `lib/wcag.ts` map id→URL (`https://www.w3.org/WAI/WCAG22/Understanding/<id>`). Test `__tests__/criterion-chip.test.tsx` href correct.

9. **Empty + error states.** No findings / scan failed / evidence missing. Test `__tests__/empty-states.test.tsx`.

10. **Fixture seed.** `scripts/seed-fixture.ts` loads `__fixtures__/audit-p1.json` (committed, mocked axe output) into Supabase OR falls back to in-memory fixture. All UI tests read fixture, never live DB.

11. **Browser smoke gate.** `e2e/p1-workbench.spec.ts` (Playwright, `CHROME_EXECUTABLE_PATH`): load seeded audit → click finding → see AX snapshot. Run against `next start`, not `dev`. Wire into `npm run verify`.

## Rules
- LLM never creates findings; evidence-first; pinned axe-core 4.13 (ENTERPRISE_SPEC §2).
- Stay in §2 scope — NO export, NO maturity, NO portals (those are later phases).
- Extend existing files where possible; new components under `components/workbench/`.