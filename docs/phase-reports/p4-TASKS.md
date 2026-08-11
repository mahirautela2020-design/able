# P4 — Mobile + Code Audit: Builder Task Checklist

Phase spec: PRODUCT_BLUEPRINT.md §2, ENTERPRISE_SPEC.md §10
Branch: `phase/p4-mobile-code`
Verify gates: `npm run verify` green; browser tests green; **APK lint fixture**; **code-lint wrapper tests**

## Tasks (each task → files → test name)

1. **Mobile scope entry.** Add `platform: 'web' | 'ios' | 'android'` to `scope_pages` (migration `supabase/migrations/NNNN_mobile_scope.sql`). Touch `lib/types/scope.ts`, audit-create form `components/workbench/new-scope-form.tsx`. Test `__tests__/mobile-scope.test.ts` accepts android/ios entries.

2. **APK upload + manifest parse.** `app/api/uploads/apk/route.ts` accepts `.apk` (size cap 200MB, stored in private evidence bucket), extracts `AndroidManifest.xml` via `lib/android/manifest.ts` (uses `apk-parser` OSS, pinned version — NO paid APIs). Persist `mobile_artifacts` table. Test `__tests__/apk-upload.test.ts` runs against `__fixtures__/sample-appk.apk` (committed dummy) — gate: **APK lint fixture** must parse package + min/target SDK.

3. **APK lint runner.** `lib/android/apk-lint.ts`: runs `lint` checks via local `aapt2`/`apktool` shell-out (pinned, no network) producing structured findings (rule id, severity, file, line) into `findings` table with `source='android-lint'`. Test `__tests__/apk-lint.test.ts` runs against fixture APK and emits ≥1 finding row; LLM never synthesizes findings.

4. **iOS IPA parity (deferred-but-stubbed).** `lib/ios/manifest.ts` parses `Info.plist` from `.ipa`. Stub returns empty list if `7zip`/`plist` lib missing — log BLOCKER-IF-ABSENT in RISKS, do not fail build. Test `__tests__/ipa-stub.test.ts` returns [] gracefully.

5. **Code audit source.** Add `code_repo` field to `audits` (migration `NNNN_code_audit.sql`); form `components/workbench/code-repo-form.tsx` accepts `git+ssh`/`https` URL. SSRF guard extension in `lib/ssrf.ts` rejects private/local IPs and link-local for clone host (re-uses existing guard, do not weaken). Test `__tests__/ssrf-code.test.ts` rejects `http://169.254.169.254/...` and `git@localhost:...`.

6. **Code clone + checkout.** `lib/git/clone.ts` clones into sandboxed `tmp/audit-<id>/` (shallow `--depth 1`, fixed ref). Sandbox dir lives outside repo, cleaned in `finally`. Test `__tests__/clone-sandbox.test.ts` asserts no `node_modules`/`.git` traversal outside sandbox.

7. **Code-lint wrapper.** `lib/code/lint-runner.ts` shells out to pinned local linters only — ESLint (`@typescript-eslint`), `axe-core` against committed HTML in repo, `jsx-a11y`. No network calls. Emits findings into `findings` with `source='code-lint'`. Test `__tests__/lint-runner.test.ts` — **code-lint wrapper tests** gate: runs against `__fixtures__/sample-repo/` (committed fixture with 2 planted a11y bugs) and emits exactly those 2 finding rows (regex-match on rule id), no extras.

8. **Code findings UI.** Reuse P1 findings list with `source` filter dropdown addition in `components/workbench/filters.tsx`. Touch `app/(app)/scope/[auditId]/findings/page.tsx`. Test `__tests__/findings-source-filter.test.tsx` narrows by `code-lint` source.

9. **Mobile simulator view.** `app/(app)/scope/[auditId]/mobile/[pageId]/page.tsx` renders stored Android tree with TalkBack-friendly labels (`lib/android/accessibility-tree.ts`). Test `__tests__/mobile-tree.test.tsx` renders from fixture JSON.

10. **Inngest queue wiring.** `inngest/functions/process-mobile.ts` + `inngest/functions/process-code.ts` enqueue APK lint and code clone+lint on scope create. Throttle = ≥1s between jobs (per BluePrint). Test `__tests__/inngest-mobile-code.test.ts` asserts both functions register and throttle.

11. **Browser smoke gate.** `e2e/p4-mobile-code.spec.ts` (Playwright, `CHROME_EXECUTABLE_PATH`): seed APK + code-repo audit → see lint finding rows. Wire into `npm run verify`.

## Rules
- LLM never creates findings (ENTERPRISE_SPEC §2); all findings come from pinned local tooling.
- OSS stack only — `apktool`/`aapt2`/`plist` libs must be OSS, pinned versions in `package.json`.
- SSRF guard must stay intact or be strengthened — never weakened for clone host.
- Sandbox clones; `tmp/audit-*` never committed (already gitignored).
- Stay in §2/mobile+code scope — NO screen readers, maturity, ACR/VPAT (those are P5).