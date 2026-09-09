import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPage } from "@/engine/browser";
import { runAxe } from "@/engine/axe-scan";

const hasChrome = !!process.env.CHROME_EXECUTABLE_PATH;

const fixtureUrl = (name: string) => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return `file:///${path.join(dir, "fixtures", name).replace(/\\/g, "/")}`;
};

/**
 * axe-core is injected as an inline <script>. On a site with a strict
 * `script-src` CSP (github.com among them) the injection is rejected, the
 * rejection escaped the per-page scan, and Inngest then failed the WHOLE
 * audit — no report at all, including for pages that had already scanned.
 * `bypassCSP` on the browser context is what makes the injection land; it
 * applies only to our injected scripts and cannot change the page's own
 * behaviour, so findings are unaffected.
 */
describe("axe injection under a strict CSP", () => {
  it.skipIf(!hasChrome)(
    "scans a page whose CSP is script-src 'none'",
    async () => {
      const result = await withPage(async (page) => {
        await page.goto(fixtureUrl("strict-csp.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        return runAxe(page);
      });

      expect(result.axeVersion).not.toBe("unknown");
      // The fixture ships an image with no alt and an empty link, so axe has
      // something real to find — proving the engine actually ran.
      expect(result.findings.length).toBeGreaterThan(0);
    },
    120_000
  );
});
