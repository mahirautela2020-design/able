# ScanA11y

**Enterprise-grade WCAG 2.2 accessibility auditing — open source.**

ScanA11y audits digital products for accessibility against the full WCAG 2.2
success criteria (A/AA/AAA) with **evidence-first findings**: screenshots,
per-criterion compliance matrix, W3C maturity scoring, and 16:9 PDF reports.

## Input modes

| Mode | What it scans |
|---|---|
| **URL** | Live website — axe-core + keyboard walkthrough + evidence crops |
| **Figma** | Design files — contrast, touch targets, image alt (OAuth2, per-user) |
| **UI screenshot** | Upload an image — vision-model advisory suggestions |
| **APK** | Android package — aapt2 manifest + dynamic emulator testing |
| **iOS (.ipa)** | iOS bundle — Info.plist + icon asset static analysis + guided VoiceOver checklist |

## Why it's "best value"

- **Same engine as the leaders** — axe-core is what axe DevTools, Lighthouse,
  and Microsoft Accessibility Insights wrap; ScanA11y uses it directly.
- **One platform, six modes** — no four-tool stack.
- **Zero paid APIs in the audit pipeline** — all engines are open source.
- **LLM discipline** — vision models only *suggest* (needs_review bucket);
  they never create hard findings. Contrast is deterministic color math.

## Stack

- **Next.js 16** (App Router, Turbopack) + TypeScript
- **Supabase** (Postgres, RLS, storage) — owner-scoped, 24h TTL cleanup
- **Inngest** (background audit pipeline, retention cron)
- **Playwright + @sparticuz/chromium** (browser engine, serverless-ready)
- **shadcn/ui** components, Geist font

## Quick start

```bash
npm install
cp .env.local.example .env.local   # fill Supabase + Inngest values
npx playwright install chromium     # browser for audits
npm run inngest:dev                 # background worker (terminal 1)
npm run dev                         # app (terminal 2) → localhost:3000
```

Verify: `npm run verify` (lint + typecheck + tests + build).

## APK dynamic testing (emulator)

Beyond static `aapt2` manifest analysis, APK uploads can boot a local Android
emulator and run **dynamic** checks on the live UI hierarchy
(`scripts/emulator-ctl.sh` → `adb uiautomator dump` + screenshot): 4.1.2 name/
role/value, 2.5.8 touch-target size, and 1.4.3 contrast (all deterministic, no
LLM in the path).

- Requires the Android SDK (`adb` + `emulator` on PATH) and a pre-created AVD.
- Enable with `AVD_NAME=<name>` (or force with `APK_DYNAMIC=1`).
- Integration tests run only when `ANDROID_EMULATOR=1`.
- Without the emulator, APK mode **degrades gracefully** to static-only results.

## Free tier & auth

- Anonymous users get **5 audits/day per IP** — no account needed.
- Sign up (instant, no email confirmation) for unlimited audits + Figma connect.
- Audit reports and Figma authorizations **self-delete within 24 hours**.

## Database

`supabase/migrations/` — apply with the Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push
```

## iOS (.ipa) static analysis — honest limits

Uploading an `.ipa` runs **static analysis only** — the bundle is unzipped and
its `Info.plist` (XML or binary) plus icon assets are inspected for
accessibility-relevant metadata. Because bundle metadata **cannot prove a live
failure**, every static result is a `needs_review` flag, never a hard violation.

**Dynamic iOS testing genuinely requires macOS / Xcode.** No tool on a Windows
or Linux host can drive the iOS Simulator. ScanA11y is honest about this: the
dynamic part ships as a **guided VoiceOver / Simulator checklist** the operator
completes on a Mac — the industry-standard manual step, not a fabricated result.

## Roadmap (honest gaps)

iOS dynamic testing (VoiceOver on Simulator — needs macOS/Xcode),
TalkBack automation (manual/guided today — industry-wide limitation),
screen-reader automation on web (manual/guided today),
deterministic UI-element detection (OmniParser/supervision — P8 shipped
element bounding boxes; full OmniParser integration still open).

## License

[MIT](LICENSE) — personal portfolio IP, not affiliated with any employer.
