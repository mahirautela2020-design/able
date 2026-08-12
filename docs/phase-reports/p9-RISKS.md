# P9 RISKS — APK Dynamic Testing

> Mitigations must keep the "LLM never creates findings; evidence-first; deterministic"
> guardrails (ENTERPRISE_SPEC §2). Dynamic findings = measured, not generated.

## Risks & mitigations

1. **Emulator/adb absent on the build machine** → `emulator-ctl.sh` exits 2; `runDynamicAudit`
   returns `ran:false`; APK route returns static-only. NEVER crash the upload. Test the
   degrade path in `tests/apk-upload.test.ts`. **BLOCKER-IF-ABSENT**: P9 still ships; only the
   live path needs the host to have Android SDK + AVD created. CI runs the skip branch.

2. **Emulator boot slow / flaky (up to 3 min)** → 180s timeout on `sys.boot_completed`; if
   exceeded, treat as "absent" (degrade gracefully, no hang). Cache AVD snapshot between runs
   (`-snapshot` flag) — note in README, not required for acceptance.

3. **uiautomator dump XML format variance** → Android uiautomator can emit namespaces/
   hierarchy quirks across API levels. Parser must tolerate missing attrs (default `""`, `0`)
   and bad XML (return `[]`, never throw). Fixtures must cover a real `uiautomator dump`
   capture (commit a representative one to `tests/fixtures/ui-dump.xml`).

4. **Touch-target dp vs px** → bounds from uiautomator are in **px**; 24dp threshold needs
   density from `adb shell getprop ro.sf.lcd_density` (or `wm density`). If density missing,
   assume 420 (xxhdpi) and mark finding `needs_review` (not violation) since exact size is
   uncertain. Document the assumption in code.

5. **Contrast from screenshot** → PNG pixel sampling is heuristic (no exact text/bg mask).
   Sample the text-node's bounds center region; if ambiguous, mark `needs_review` (NOT a
   violation) per spec §3 ("heuristic → needs_review"). Reuse the `image-contrast`
   util/colorjs path — do NOT introduce a second contrast implementation.

6. **Splash/login screen only** → first dumped screen is a valid audit target; report what's
   visible. Do NOT try to drive navigation (out of scope, nondeterministic). Findings scoped to
   "Screen 1 (cold start)".

7. **No network on emulator** → spec explicitly accepts cold-start splash/launcher audits;
   no network simulation needed. Do NOT add network plumbing (scope creep + nondeterminism).

8. **LLM-in-path temptation** → resist summarizing/describing findings with an LLM. All
   finding text is templated/verbatim from measured values (bounds, contrast ratio). Add a
   `tests/android-dynamic.test.ts` assertion: no finding has `source !== 'dynamic'` prose.

9. **APK already deleted / path race** → `runDynamicAudit` receives `apkPath` from storage;
   ensure file exists before spawn; missing → `ran:false`, not throw.

10. **Two-process / port conflict** → emulator uses ports (5554/5555); never collide with
    Next dev server (port 3000) — different ports, but ensure only ONE emulator instance per
    run (lockfile or `adb emu kill` first). Follow AGENTS.md "never run two servers" spirit.

## BLOCKER-IF-ABSENT (orchestrator stop list)
- Android SDK + `adb` + `emulator` on PATH for the **live** path (CI/build only needs the
  skip path). AVD must be pre-created by the user (`$ANDROID_AVD_HOME`). The agent CANNOT
  install the Android SDK or create an AVD on its own — flag for user if live run requested.