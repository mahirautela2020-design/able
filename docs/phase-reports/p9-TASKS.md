# P9 TASKS — APK Dynamic Testing (emulator + adb + uiautomator)

> Scope: upgrade APK mode from static (aapt2/manifest) to DYNAMIC — boot emulator,
> install APK, dump live UI hierarchy, run deterministic a11y checks on the dump.
> Spec: P9_APK_DYNAMIC_SPEC.md. No LLM in the dynamic path.

## Tasks (ordered)

1. **`scripts/emulator-ctl.sh`** — bash lifecycle script (git-bash on Windows):
   - commands: `boot`, `install <apk>`, `launch <pkg>`, `snapshot <out.png>`, `dump <out.xml>`, `shutdown`.
   - `boot`: `emulator -avd $AVD_NAME -no-window -no-audio -gpu swiftshader_indirect &`
     then `adb wait-for-device` + poll `getprop sys.boot_completed` (timeout 180s).
   - Feature-detect `adb` and `emulator` on PATH; if absent, `exit 2` (graceful skip flag).
   - Verify: `tests/android-dynamic.test.ts` asserts script `--help` lists subcommands; emulator
     integration test runs only when `ANDROID_EMULATOR=1` (skip otherwise).

2. **`src/lib/android/dynamic.ts`** — Node orchestrator (pure, no network):
   - `runDynamicAudit(apkPath, opts)`: spawns `emulator-ctl.sh`, returns `{ ran: boolean,
     screens: DynamicScreen[] }`. If `adb`/emulator absent or `exit 2`, `ran=false` (caller
     degrades to static-only).
   - `parseUiAutomatorXml(xml: string): UiNode[]` — each node: `{class, content-desc, text,
     bounds:[l,t,r,b], clickable}`. Use the existing `accessibility-tree.ts` naming style.
   - Screenshot captured via `adb exec-out screencap -p` → Buffer for pixel sampling.
   - Verify: `parseUiAutomatorXml` unit test on committed XML fixture
     (`tests/fixtures/ui-dump.xml`); bad-XML returns `[]` not throw.

3. **`src/lib/android/dynamic-checks.ts`** — deterministic checks on parsed nodes:
   - `checkLabels(nodes)`: clickable node with empty `content-desc` AND empty `text` →
     finding 4.1.2 (name/role/value missing) — **violation**.
   - `checkTouchTargets(nodes, densityDpi)`: bounds < 24×24 dp (convert px→dp via density)
     → 2.5.8 **needs_review**.
   - `checkContrast(nodes, screenshot: Buffer)`: sample text-node pixels from `screen.png`,
     compute contrast via existing `colorjs.io`/contrast util (reuse `image-contrast` path)
     → 1.4.3 violation (<4.5:1) or needs_review (4.5–7).
   - Output reuses the project findings shape (`{criterion, severity, source:'dynamic',
     evidence, element}`) — verify against `tests/findings-source-filter.test.ts` shape.
   - Verify: `tests/android-dynamic.test.ts` fixtures → exact finding counts/severities.

4. **Wire into `/api/uploads/apk` (`src/app/api/uploads/apk/route.ts`):**
   - After `parseApkManifestFromBuffer`, call `runDynamicAudit(apkPath)`. Guard: only if env
     `APK_DYNAMIC=1` OR emulator present; else static-only (current behavior unchanged).
   - Merge dynamic findings into results; add `dynamic: { ran, screens[] }` to response JSON.
   - UI: APK result component renders "Dynamic (emulator)" section listing per-screen findings.
     Locate existing APK result component (search `app/**/apk*`); add section behind `ran` flag.
   - Verify: `tests/apk-upload.test.ts` extended — no emulator → `dynamic.ran === false`,
     static results unchanged (regression-safe).

5. **Tests — `tests/android-dynamic.test.ts`** (pure parsing + math, no emulator):
   - parse fixtures → label/target/contrast findings with expected counts.
   - density conversion math (px↔dp) assertions.
   - integration test (`describe.skip` unless `ANDROID_EMULATOR=1`) boots AVD, uploads fixture
     APK, asserts `dynamic.ran === true`.
   - Verify gate: `npm run verify` green; lint + typecheck clean.

6. **Docs — short note in README/P9 section**: how to enable emulator (AVD name env,
   `ANDROID_EMULATOR=1`), graceful-degrade behavior. Verify: build passes (docs in code block).

## Mapping to verify gates (ORCHESTRATOR §4 has no P9 row — derive from spec §Acceptance)
- `npm run verify` green → task 5.
- XML-parsing + math tests pass with fixtures → tasks 2–3.
- No-emulator → static-only degradation → tasks 2 + 4.
- No LLM in dynamic path → all checks deterministic → task 3 (review for any randomness).