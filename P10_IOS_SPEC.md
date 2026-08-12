# P10 — iOS IPA Static Analysis (+ honest dynamic story)

> Scope: real static analysis of iOS .ipa bundles on ANY OS (unzip → Info.plist →
> asset catalog → accessibility metadata), plus a guided manual checklist for the
> dynamic part that genuinely requires macOS/Xcode/Simulator. HONEST LIMITATION:
> this Windows build machine cannot run iOS Simulator — dynamic testing stays a
> guided checklist (industry-standard manual step), and the README says so.

## Why it matters
APK got static (P4) + dynamic (P9). iOS deserves the same static depth so the
product claims "iOS" truthfully: bundle inspection, plist checks, asset/icon
analysis. Dynamic (VoiceOver on Simulator) is macOS-only — no tool on Windows can
fake that; guided checklist is the correct, honest answer.

## What to build
1. **`src/lib/ios/ipa.ts`** — parse .ipa (it's a zip):
   - locate `Payload/*.app/`, read `Info.plist` (plist → JSON: CFBundleIdentifier,
     CFBundleDisplayName, MinimumOSVersion, UILaunchStoryboardName, etc.)
   - `UIAccessibility`-relevant keys: `UIAccessibilitySpeechEnabled`-adjacent
     settings, localization arrays, icon assets (`AppIcon60x60`...)
2. **`src/lib/ios/checks.ts`** — deterministic checks on the parsed bundle:
   - missing CFBundleDisplayName → 1.3.1 (name/role) needs_review
   - missing localizations when CFBundleLocalizations absent → 3.1.1 needs_review
   - no launch storyboard (UILaunchStoryboardName absent) → 2.2.2-ish needs_review
   - icon set missing @2x/@3x variants → 1.4.11 needs_review (asset completeness)
   - ALL needs_review (bundle metadata can't prove a live failure — honest)
3. **`/api/uploads/ipa`** route — mirror APK route: session-guarded multipart,
   sanitized filename, storage upload, static parse → findings.
4. **`src/lib/ios/guided-checklist.ts`** — VoiceOver/Simulator checklist data
   (steps, WCAG mapping) surfaced in the UI for the macOS step:
   - "Run in Xcode Simulator → Enable VoiceOver → verify reading order" etc.
5. **Tests** — `tests/ios-ipa.test.ts` with a **generated fixture .ipa** (zip a
   stub Payload with Info.plist) — parse + check deterministically; plus
   `tests/ios-guided.test.ts` asserting the checklist maps to real SCs.

## Acceptance
- `npm run verify` green; fixture-based tests pass (no macOS needed)
- Upload a .ipa locally → static findings + guided checklist shown
- README/UI state the macOS/Simulator requirement clearly — no overclaiming
- All findings needs_review (metadata can't prove live failures); zero hard
  violations fabricated

## Risks
- plist can be binary (bplist) → support both XML and binary via `plist` npm lib
- App bundles can be large (100MB+) → 200MB upload cap, stream not buffer whole
- Never claim dynamic results — the guided checklist is explicit about macOS
