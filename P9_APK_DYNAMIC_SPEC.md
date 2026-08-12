# P9 — APK Dynamic Testing (Android emulator + adb + uiautomator)

> Scope: install the APK on a local Android emulator, drive it with adb, dump the
> real UI hierarchy (uiautomator), and run **dynamic** accessibility checks —
> touch-target sizes, clickable-without-label, and text contrast from live
> screenshots. This upgrades APK mode from static (aapt2) to dynamic.

## Why it matters
Static aapt2 only reads the manifest. Real accessibility problems live in the
rendered UI. With an emulator + adb we can be the tool that actually *opens the
app* and checks the live screen — TalkBack-level issues without TalkBack.

## What to build
1. **`scripts/emulator-ctl.sh`** — emulator lifecycle:
   - boot headless AVD (`emulator -avd <name> -no-window -no-audio -gpu swiftshader_indirect`)
   - `adb wait-for-device` + boot-completed poll (max 180s)
   - install APK (`adb install -r`), launch via `monkey` or `am start`
   - snapshot: `adb exec-out screencap -p > screen.png`
2. **`src/lib/android/dynamic.ts`** — orchestration (Node):
   - spawns the script with the uploaded APK path
   - parses `adb shell uiautomator dump` XML → node tree with bounds + class +
     content-desc + text
3. **`src/lib/android/dynamic-checks.ts`** — deterministic checks on the dump:
   - clickable node with empty content-desc AND empty text → 4.1.2 finding
     (name/role/value missing) — hard violation
   - bounds smaller than 24×24 CSS px (density-adjusted) → 2.5.8 needs_review
   - text node bounds + screen.png pixel sampling → 1.4.3 contrast (colorjs.io)
   - all measured → violations; heuristic → needs_review
4. **Wire into APK mode** — `/api/uploads/apk` (local) runs dynamic pass after
   static; results merged into the same findings shape. UI: APK result shows
   "Dynamic (emulator)" section with per-screen findings.
5. **Tests** — `tests/android-dynamic.test.ts` with uiautomator XML fixtures
   (pure parsing + math); emulator integration test skipped unless
   `ANDROID_EMULATOR=1` env + emulator present (CI-friendly).

## Acceptance
- `npm run verify` green; XML-parsing + math tests pass with fixtures
- Locally with emulator: upload Vozee APK → dynamic findings (4.1.2 labels,
  2.5.8 targets, 1.4.3 contrast) from the live screen
- Without emulator: APK mode still returns static results (degrade gracefully)
- No LLM in the dynamic path — all checks deterministic

## Risks
- Emulator boot is slow (up to 3 min) → background job + generous timeouts;
  cache the AVD snapshot between runs
- `adb`/emulator may be absent → feature-detect; static-only fallback
- App may show splash/login screens → report what the dump shows; first screen
  is a valid target
- No network on emulator by default → app cold-start on splash still yields
  layout nodes (splash + launcher are auditable)
