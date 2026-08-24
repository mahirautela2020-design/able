# ScanA11y Chrome Extension

Audits the currently open tab, inspects individual elements, and applies
on-page accessibility options — no login, no history stored, no server
calls. Everything runs locally in the tab via `activeTab` + `scripting`
permissions, injected only when you click a button.

## Load it (unpacked, for local testing)

Chrome doesn't let you install from source without going through the Chrome
Web Store review — while developing, load it as an "unpacked" extension:

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked**
4. Select this `chrome-extension/` folder
5. Pin the ScanA11y icon to your toolbar

## What each tab does

- **Audit** — injects a local copy of axe-core (`vendor/axe.min.js`, no
  network fetch) into the active tab and runs it there. Lists violations
  by impact with a "Highlight on page" action per result.
- **Inspect** — click-to-inspect mode: click any element to see its role,
  accessible name, computed contrast ratio (with AA pass/fail), touch
  target size, and tab index. Press Escape or the on-page "Exit" button
  to stop.
- **Accessibility** — injects `vendor/a11y-widget.js`, a local copy of the
  same widget served publicly at
  [scana11y-nine.vercel.app/widget.js](https://scana11y-nine.vercel.app/widget.js)
  (see `src/lib/widget/accessibility-widget-script.ts`). Vendored instead
  of fetched at runtime because Chrome Web Store policy disallows
  executing remotely-loaded code — keep this file in sync if the SDK
  source changes.

## Publishing to the Chrome Web Store

Not done as part of this — that requires a Chrome Web Store developer
account (one-time $5 registration fee) and submitting through the
[developer dashboard](https://chrome.google.com/webstore/devconsole) for
review. This folder is ready to zip and upload as-is once you have that
account.
