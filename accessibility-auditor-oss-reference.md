# Enterprise Accessibility Auditor — Open-Source Tool & API Reference

> **Research date:** 2026-08-07  
> **Scope:** Every tool assessed for OSS status, license, maintenance activity, and honest maturity.

---

## 1. MOBILE APK STATIC ANALYSIS

### 1.1 Android SDK Command-Line Tools

| Tool | Source | License | Purpose | Windows (no Android Studio)? |
|------|--------|---------|---------|-------------------------------|
| **cmdline-tools** | [developer.android.com/studio#command-line-tools-only](https://developer.android.com/studio#command-line-tools-only) | Apache-2.0 (AOSP) | Standalone SDK manager + tools | **YES** — `commandlinetools-win-*.zip` from [dl.google.com](https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip) (200 OK verified) |
| **aapt2** | Bundled in Android SDK build-tools | Apache-2.0 | Compiles/inspects Android resources, `aapt2 dump` can expose missing `contentDescription` | **YES** — install via `sdkmanager "build-tools;latest"` on Windows |
| **apkanalyzer** | Bundled in cmdline-tools | Apache-2.0 | APK composition analysis: manifest, DEX, resources, file sizes | **YES** — included in cmdline-tools ZIP |
| **lint** | Bundled in cmdline-tools | Apache-2.0 | Static analysis including accessibility checks (e.g. `ClickableViewAccessibility`, `ContentDescription`, `LabelFor`) | **YES** — `lint --check Accessibility` works without Android Studio |

**Verdict:** All three are freely installable on Windows via the standalone `commandlinetools-win-*.zip` (~150 MB). No Android Studio, no Gradle, no IDE required. The lint accessibility checks are part of the core SDK and are actively maintained with the SDK release cycle.

**Limits:** APK static analysis alone catches only ~20-30% of a11y issues (missing labels, touch target sizes from resources). Dynamic testing (Section 2) is needed for runtime issues.

---

## 2. MOBILE APK DYNAMIC ANALYSIS

### 2.1 Google Accessibility Test Framework for Android

| Field | Value |
|-------|-------|
| **Repo** | [github.com/google/Accessibility-Test-Framework-for-Android](https://github.com/google/Accessibility-Test-Framework-for-Android) |
| **License** | Apache-2.0 |
| **Stars** | 516 |
| **Open Issues** | 26 |
| **Last Push** | 2024-04-03 |
| **Description** | Accessibility checks on `View` and `AccessibilityNodeInfo` objects for automated Android testing. Integrates with Espresso, Robolectric. |

**Maturity assessment:** **LOW MAINTENANCE — RISK.** Last pushed April 2024 (~16 months ago). The library still works for current Android API levels but has no visible active development. Google has not archived it, but it appears to be in maintenance mode. The checks themselves are sound — the issue is lack of updates for new Android API versions.

### 2.2 UIAutomator

| Field | Value |
|-------|-------|
| **Repo** | [android.googlesource.com/platform/frameworks/testing/+/refs/heads/main/uiautomator/](https://android.googlesource.com/platform/frameworks/testing/+/refs/heads/main/uiautomator/) |
| **License** | Apache-2.0 (AOSP) |
| **Maven** | `androidx.test.uiautomator:uiautomator` |
| **Maintenance** | Part of AndroidX test framework, actively shipped with each Android platform release |
| **Description** | UI testing framework for cross-app functional testing. Can inspect accessibility tree at runtime via `AccessibilityNodeInfo`. |

**Maturity assessment:** **ACTIVE (platform-level).** UIAutomator is a core Android testing component shipped with the Android platform itself. No standalone GitHub repo with obvious commit history — development happens in AOSP. It is reliable, well-documented, and actively maintained as part of the Android framework lifecycle.

**Note:** UIAutomator + ATF together can run accessibility checks on a device/emulator. On Windows, this requires an Android emulator or connected device (both available on Windows).

---

## 3. MOBILE iOS ACCESSIBILITY

### 3.1 AccessibilitySnapshot (Cash App, originally Airbnb)

| Field | Value |
|-------|-------|
| **Repo** | [github.com/cashapp/AccessibilitySnapshot](https://github.com/cashapp/AccessibilitySnapshot) |
| **License** | Apache-2.0 |
| **Stars** | 652 |
| **Open Issues** | 31 |
| **Last Push** | 2026-07-20 |
| **Description** | Snapshot testing for iOS accessibility hierarchies. Integrates with SnapshotTesting (Point-Free) and iOSSnapshotTestCase (Uber). Captures rendered accessibility tree as images for regression testing. |

**Maturity assessment:** **ACTIVE.** Originally Airbnb's project, now maintained by Cash App (Block/Square). Last pushed July 2026. Healthy community. The gold standard for iOS a11y snapshot testing.

### 3.2 Google GSCXScanner

| Field | Value |
|-------|-------|
| **Repo** | [github.com/google/GSCXScanner](https://github.com/google/GSCXScanner) |
| **License** | Apache-2.0 |
| **Stars** | 138 |
| **Last Push** | 2023-08-10 |
| **Description** | iOS accessibility scanner |

**Maturity assessment:** **STALE / ABANDONED.** Last push August 2023 (~3 years ago). Not recommended for new projects.

### 3.3 Other Notable iOS OSS

| Tool | Repo | Status |
|------|------|--------|
| **A11yUITests** (Spotify) | Archived/private — no longer public OSS | Unavailable |
| **KIF** (Square) | [github.com/kif-framework/KIF](https://github.com/kif-framework/KIF) | Functional testing, not a11y-specific |

### 3.4 Windows Viability — CRITICAL FINDING

**NO iOS accessibility static analysis tool can run on Windows.** All iOS a11y tools require:

- **macOS** (Xcode is macOS-only — no workaround)
- **Xcode + iOS Simulator** (for snapshot testing)
- **Swift/ObjC toolchain** (no cross-compile to Windows)

**Workarounds considered and rejected:**
- Hackintosh: legally dubious for enterprise
- Mac cloud (MacStadium, AWS EC2 Mac): viable but adds $100+/month per instance
- Cross-compiling Swift on Windows: experimental, Xcode frameworks unavailable

**Recommendation:** iOS a11y testing requires a macOS build agent or cloud Mac in the pipeline. There is no path to running these on Windows directly.

---

## 4. CODE AUDIT (Web/JS Linting)

### 4.1 eslint-plugin-jsx-a11y (React)

| Field | Value |
|-------|-------|
| **Repo** | [github.com/jsx-eslint/eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y) |
| **License** | MIT |
| **Stars** | 3,609 |
| **Open Issues** | 136 |
| **Last Push** | 2026-01-06 |
| **Description** | Static AST checker for accessibility rules on JSX elements. 30+ rules covering ARIA roles, alt text, headings, labels, etc. |

**Verdict:** **ACTIVE — OSS.** Broadly adopted (10M+ weekly npm downloads). High issue count (136) is typical for popular ESLint plugins. Maintained by the jsx-eslint org.

### 4.2 @angular-eslint (template accessibility rules)

| Field | Value |
|-------|-------|
| **Repo** | [github.com/angular-eslint/angular-eslint](https://github.com/angular-eslint/angular-eslint) |
| **License** | MIT |
| **Stars** | 1,781 (monorepo) |
| **Open Issues** | 44 |
| **Last Push** | 2026-08-06 |
| **Description** | Monorepo for ESLint + Angular. Template accessibility rules included in `@angular-eslint/template` package. |

**Verdict:** **ACTIVE — OSS.** Very well maintained (push same day as research). The defacto Angular ESLint tooling.

### 4.3 eslint-plugin-vuejs-accessibility (Vue)

| Field | Value |
|-------|-------|
| **Repo** | [github.com/vue-a11y/eslint-plugin-vuejs-accessibility](https://github.com/vue-a11y/eslint-plugin-vuejs-accessibility) |
| **License** | MIT |
| **Stars** | 314 |
| **Last Push** | 2026-08-01 |
| **Description** | ESLint plugin for checking Vue.js files for accessibility. |

**Verdict:** **ACTIVE — OSS.** Do NOT use `maranran/eslint-plugin-vue-a11y` — that fork is stale (last push 2022). The vue-a11y org version is the maintained one.

### 4.4 html-validate

| Field | Value |
|-------|-------|
| **Repo** | [gitlab.com/html-validate/html-validate](https://gitlab.com/html-validate/html-validate) (primary) / [github.com/html-validate/html-validate](https://github.com/html-validate/html-validate) (mirror) |
| **License** | MIT |
| **Last Push** | 2026-08-07 |
| **Description** | Offline HTML5 validator with accessibility rules (WCAG 2.1 AA coverage). 40+ a11y rules. |

**Verdict:** **ACTIVE — OSS.** Primary development on GitLab; GitHub is a mirror. The most comprehensive standalone HTML a11y linter (not tied to any framework).

### 4.5 stylelint-a11y

| Field | Value |
|-------|-------|
| **Primary repo** | [github.com/YozhikM/stylelint-a11y](https://github.com/YozhikM/stylelint-a11y) |
| **License** | MIT |
| **Stars** | 439 |
| **Last Push** | 2023-10-02 |
| **Description** | Plugin for stylelint with a11y rules (font-size, line-height, color contrast warnings). |

**Verdict:** **STALE (2023).** The original is unmaintained. Alternatives:
- **ivuorinen/stylelint-a11y** ([github.com/ivuorinen/stylelint-a11y](https://github.com/ivuorinen/stylelint-a11y)) — maintained fork, pushed Aug 2026, 0 stars (new)
- **fpapado/stylelint-plugin-a11y-contemporary** ([github.com/fpapado/stylelint-plugin-a11y-contemporary](https://github.com/fpapado/stylelint-plugin-a11y-contemporary)) — MIT, new alternative targeting 2025+ codebases, pushed Aug 2026

**Recommendation:** Use `ivuorinen/stylelint-a11y` fork or `fpapado/stylelint-plugin-a11y-contemporary` for maintained stylelint a11y rules.

### 4.6 axe-core

| Field | Value |
|-------|-------|
| **Repo** | [github.com/dequelabs/axe-core](https://github.com/dequelabs/axe-core) |
| **License** | MPL-2.0 |
| **Stars** | 7,377 |
| **Open Issues** | 431 |
| **Last Push** | 2026-08-06 |
| **Description** | Accessibility engine for automated Web UI testing. The industry standard. Powers Lighthouse, Deque tools, etc. |

**Verdict:** **ACTIVE — OSS.** MPL-2.0 is a weak copyleft license (file-level, not project-level). Safe for enterprise use. Deque Systems maintains it. 57% of all automated a11y issues can be caught by axe-core.

### 4.7 @axe-core/cli

| Field | Value |
|-------|-------|
| **Repo** | Part of [dequelabs/axe-core-npm](https://github.com/dequelabs/axe-core-npm) monorepo (`packages/cli/`) |
| **License** | MPL-2.0 |
| **Stars** | 718 (monorepo) |
| **Last Push** | 2026-08-06 |
| **Description** | CLI wrapper around axe-core. `axe https://example.com` runs a11y audits from terminal. |

**Verdict:** **OSS — FREE.** Lives in the axe-core-npm monorepo alongside `@axe-core/playwright`, `@axe-core/puppeteer`, `@axe-core/webdriverio`, `@axe-core/react`, and `@axe-core/reporter-earl`. All are MPL-2.0 OSS. No paid tier.

### 4.8 @axe-core/linter

**Verdict:** **NOT OSS — PAID DEQUE PRODUCT.** This is `axe DevTools Linter`, a commercial product from Deque Systems. It is NOT on npm as `@axe-core/linter`. It integrates into IDEs (VS Code, IntelliJ) as a paid extension. The free OSS alternatives are the ESLint plugins listed above (jsx-a11y, vuejs-accessibility, angular-eslint template rules).

**Source:** Deque's commercial product page at [deque.com/axe/linter/](https://www.deque.com/axe/linter/). No corresponding npm package or GitHub repo exists.

---

## 5. FIGMA MCP / API

### 5.1 Figma REST API

| Field | Value |
|-------|-------|
| **Docs** | [developers.figma.com/docs/rest-api/](https://developers.figma.com/docs/rest-api/) |
| **OpenAPI Spec** | Available at [figma.com/developers/api](https://www.figma.com/developers/api) |
| **License** | Proprietary (free to use, subject to [Figma Developer Terms](https://www.figma.com/legal/developer-terms/)) |
| **Rate Limits** | Tiered by plan. REST API endpoints for files, comments, components, variables, webhooks, etc. |

**Verdict:** The REST API is well-documented and production-grade. Can extract design tokens, component metadata, and layout information. No a11y-specific endpoints — you analyze the design data yourself.

### 5.2 Figma MCP Server (OFFICIAL)

| Field | Value |
|-------|-------|
| **Endpoint** | `https://mcp.figma.com/mcp` (HTTP MCP) |
| **Docs** | [github.com/figma/mcp-server-guide](https://github.com/figma/mcp-server-guide) (1,863 stars) |
| **License** | **PROPRIETARY — NOT OPEN SOURCE** |
| **Source Available?** | NO. The `figma/mcp-server-guide` repo contains only documentation + skills, not the server code. |
| **Pricing** | Free tier: 6 tool calls/month. Paid (Dev/Full seat on Professional+): per-minute REST API rate limits. |
| **Features** | Read/write Figma canvas, extract design context, code generation, Code Connect |

**Verdict:** Figma's MCP server is a proprietary SaaS product, not OSS. The server runs on Figma's infrastructure (`mcp.figma.com`). The "open source" repo is just documentation. This has licensing and vendor-lock implications for an enterprise product.

### 5.3 Community MCP Servers

| Name | Repo | License | Stars | Last Push | Description |
|------|------|---------|-------|-----------|-------------|
| **Figma-Context-MCP** | [GLips/Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP) | MIT | 15,605 | 2026-08-07 | Most popular community MCP. Provides Figma layout info to AI coding agents. |
| **figma-mcp-bridge** | [gethopp/figma-mcp-bridge](https://github.com/gethopp/figma-mcp-bridge) | MIT | 459 | 2026-07-26 | Figma Plugin + MCP server to bypass API rate limits |
| **figwright** | [awdr74100/figwright](https://github.com/awdr74100/figwright) | MIT | 434 | 2026-08-07 | Free two-way Figma MCP server. Designs → framework-aware code, push code back to canvas. |
| **figma-console-mcp-skills** | [southleft/figma-console-mcp-skills](https://github.com/southleft/figma-console-mcp-skills) | MIT | 67 | 2026-06-01 | Skills for the native Figma MCP server — design tokens, components, accessibility. |
| **figma-remote-server** | [plugin87/figma-remote-server](https://github.com/plugin87/figma-remote-server) | None | 5 | 2026-05-29 | 46 tools for design system analysis, token extraction, accessibility auditing. |
| **conductor** | [Dragoon0x/conductor](https://github.com/Dragoon0x/conductor) | Custom | 2 | 2026-03-14 | 201 tools, 17 categories. 8px grid, type scales, semantic color analysis. |

**Recommendation:** For enterprise use, `Figma-Context-MCP` (MIT, 15.6k stars) is the safest bet — most popular, actively maintained, MIT license. `plugin87/figma-remote-server` has explicit accessibility auditing tools (46 tools including a11y). The official Figma MCP server is the most capable but proprietary with rate limits.

---

## 6. WCAG 3.0 / REGULATIONS MAPPING

### 6.1 Is there an OSS library that maps WCAG to regulations?

**NO.** No open-source library exists that programmatically maps WCAG 2.x success criteria to EU EAA, ADA Title II, Section 508, or other regulations. This is a gap in the ecosystem.

### 6.2 Why this doesn't exist

- Regulation-to-WCAG mapping is **legal interpretation**, not deterministic logic
- Each regulation references WCAG at different levels (A, AA) and with different scopes
- EN 301 549 (EU) is the closest to a machine-readable mapping — but it's a PDF/Word spec, not a library

### 6.3 Closest OSS efforts

| Project | Repo | What it does | Limitation |
|---------|------|-------------|------------|
| **WCAG2ICT** | [w3c/wcag2ict](https://github.com/w3c/wcag2ict) (46 stars) | W3C guidance on applying WCAG 2.x to non-Web ICT | Spec document, not a library. Does not map to specific regulations. |
| **ACT Rules** | [act-rules/act-rules.github.io](https://github.com/act-rules/act-rules.github.io) (164 stars) | W3C Accessibility Conformance Testing rules for HTML | Test rules for WCAG, not regulation mapping. |

### 6.4 Official Regulation Source URLs

| Regulation | Official Source | Key Reference |
|-----------|----------------|---------------|
| **EU EAA** (European Accessibility Act) | [eur-lex.europa.eu/eli/dir/2019/882/oj](https://eur-lex.europa.eu/eli/dir/2019/882/oj) | Directive (EU) 2019/882. Enforcement: June 28, 2025. Applies to products and services. References EN 301 549 / WCAG 2.1 AA. |
| **EN 301 549** (EU harmonized standard) | [etsi.org](https://www.etsi.org/standards/get-standards#page=1&search=EN%20301%20549) | Accessibility requirements for ICT products and services. V3.2.1 (2021) harmonized to EAA. |
| **ADA Title II** | [ada.gov/topics/title-ii/](https://www.ada.gov/topics/title-ii/) | State/local government web/mobile accessibility. DOJ final rule (April 2024) mandates WCAG 2.1 AA. |
| **Section 508** | [section508.gov](https://www.section508.gov/) | US federal procurement. § 1194.22 (Web) / § 1194.26 (Software). Revised 2017 to incorporate WCAG 2.0 AA. |
| **WCAG 2.2** | [w3.org/TR/WCAG22/](https://www.w3.org/TR/WCAG22/) | Current W3C Recommendation (Oct 2023). |
| **WCAG 3.0** (Working Draft) | [w3.org/TR/wcag-3.0/](https://www.w3.org/TR/wcag-3.0/) | Draft only — not yet a standard. Introduces outcomes over success criteria, rating scales (Bronze/Silver/Gold). |

### 6.5 Building a mapping

The only viable path for an enterprise auditor is to build (and maintain) an internal mapping table. The legal interpretations are stable enough to hardcode:

```
WCAG 1.1.1 Non-text Content → EAA Annex I §…, ADA Title II §35.200, Section 508 §1194.22(a)
WCAG 1.4.3 Contrast (Minimum) → EAA Annex I §…, ADA Title II §35.200, Section 508 §1194.22(…)
```

Each regulation's reference document (EN 301 549, ADA final rule, Section 508) explicitly maps to WCAG criteria. The work is extracting those mappings manually — not implementing novel logic.

---

## 7. REPORTING TOOLS

### 7.1 Screenshot Capture

| Tool | Repo | License | Stars | Last Push | Notes |
|------|------|---------|-------|-----------|-------|
| **Puppeteer** | [puppeteer/puppeteer](https://github.com/puppeteer/puppeteer) | Apache-2.0 | 95,416 | 2026-08-07 | `page.screenshot()` for full-page/element screenshots. Bundles Chromium. |
| **Playwright** | [microsoft/playwright](https://github.com/microsoft/playwright) | Apache-2.0 | 94,154 | 2026-08-07 | `page.screenshot()` for Chromium/Firefox/WebKit. `page.pdf()` for PDF. |

**Verdict:** Both are **OSS, free, enterprise-ready.** Playwright has the edge (multi-browser, maintained by Microsoft, better API for a11y tree inspection via `page.accessibility.snapshot()`).

### 7.2 Image Annotation

| Tool | Repo | License | Stars | Notes |
|------|------|---------|-------|-------|
| **sharp** | [lovell/sharp](https://github.com/lovell/sharp) | Apache-2.0 | ~29,000 | Already confirmed. SVG overlay compositing, text rendering, bounding boxes. |

### 7.3 PDF Generation

| Tool | Repo | License | Stars | Last Push | Notes |
|------|------|---------|-------|-----------|-------|
| **jsPDF** | [parallax/jsPDF](https://github.com/parallax/jsPDF) | MIT | 31,261 | 2026-08-05 | Client-side PDF generation. Works in Node.js. |
| **Puppeteer** | (see above) | Apache-2.0 | 95k | 2026-08-07 | `page.pdf()` for pixel-perfect PDF from HTML. |

**Verdict:** **Both OSS.** jsPDF for programmatic PDF construction. Puppeteer/Playwright `page.pdf()` for rendering HTML reports to PDF. Both production-grade.

### 7.4 PowerPoint (PPTX) Generation

| Tool | Repo | License | Stars | Last Push | Notes |
|------|------|---------|-------|-----------|-------|
| **PptxGenJS** | [gitbrent/PptxGenJS](https://github.com/gitbrent/PptxGenJS) | MIT | 5,958 | 2025-11-28 | Build PPTX in Node.js/browser. Charts, tables, images, text. |

**Verdict:** **OSS — MIT.** Last pushed Nov 2025 (9 months ago). Mature but maintenance cadence has slowed. 284 open issues is high. Still the best OSS option for programmatic PPTX generation. For enterprise reporting, it's adequate but watch for unaddressed bugs.

### 7.5 Summary Matrix

| Function | Recommended Tool | License | Risk |
|----------|-----------------|---------|------|
| Screenshots (single browser) | Puppeteer | Apache-2.0 | None |
| Screenshots (multi-browser) | Playwright | Apache-2.0 | None |
| Image annotation | sharp | Apache-2.0 | None |
| PDF (HTML→PDF) | Puppeteer/Playwright `page.pdf()` | Apache-2.0 | None |
| PDF (programmatic) | jsPDF | MIT | None |
| PPTX generation | PptxGenJS | MIT | Low (maintenance slowing, 284 issues) |

---

## APPENDIX: At-a-Glance License Risk Summary

| License | Risk Level | Tools Using It |
|---------|-----------|----------------|
| **MIT** | Safe — permissive | jsx-a11y, angular-eslint, vuejs-accessibility, html-validate, stylelint-a11y, jsPDF, PptxGenJS, Figma-Context-MCP |
| **Apache-2.0** | Safe — permissive, patent grant | Android SDK tools, ATF, UIAutomator, AccessibilitySnapshot, Puppeteer, Playwright, sharp |
| **MPL-2.0** | Safe — weak copyleft (file-level) | axe-core, @axe-core/cli, @axe-core/playwright, etc. |
| **Proprietary** | Vendor dependency | Figma MCP server (official), @axe-core/linter (Deque) |
