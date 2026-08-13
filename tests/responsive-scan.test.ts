import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPage } from "@/engine/browser";
import { scanReflow, scanResponsive, RESPONSIVE_VIEWPORTS } from "@/engine/responsive-scan";

const hasChrome = !!process.env.CHROME_EXECUTABLE_PATH;

const fixtureUrl = (name: string) => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return `file:///${path.join(dir, "fixtures", name).replace(/\\/g, "/")}`;
};

describe("responsive reflow scan", () => {
  it.skipIf(!hasChrome)(
    "flags a reflow (1.4.10) finding at a 375px mobile viewport",
    async () => {
      const findings = await withPage(async (page) => {
        await page.goto(fixtureUrl("reflow-overflow.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        return scanReflow(page, { name: "mobile", width: 375, height: 812 });
      });

      expect(findings).toHaveLength(1);
      expect(findings[0].wcag_criterion).toBe("1.4.10");
      expect(findings[0].bucket).toBe("automated");
      expect((findings[0].evidence as { viewport: { width: number } }).viewport.width).toBe(375);
    }
  );

  it.skipIf(!hasChrome)(
    "does not flag reflow at a 1440px desktop viewport (content fits)",
    async () => {
      const findings = await withPage(async (page) => {
        await page.goto(fixtureUrl("reflow-overflow.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        return scanReflow(page, { name: "desktop", width: 1440, height: 900 });
      });

      expect(findings).toHaveLength(0);
    }
  );

  it.skipIf(!hasChrome)(
    "scanResponsive checks every configured breakpoint (mobile + tablet both overflow a 900px-wide block)",
    async () => {
      const findings = await withPage(async (page) => {
        await page.goto(fixtureUrl("reflow-overflow.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        return scanResponsive(page);
      });

      expect(RESPONSIVE_VIEWPORTS.length).toBeGreaterThanOrEqual(2);
      expect(findings).toHaveLength(RESPONSIVE_VIEWPORTS.length);
      const viewportNames = findings.map(
        (f) => (f.evidence as { viewport: { name: string } }).viewport.name
      );
      expect(viewportNames).toEqual(RESPONSIVE_VIEWPORTS.map((v) => v.name));
    }
  );

  it.skipIf(!hasChrome)(
    "does not false-positive on a well-behaved responsive page",
    async () => {
      const findings = await withPage(async (page) => {
        await page.goto(fixtureUrl("csr-test.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        await page.waitForSelector("#root > *", { timeout: 10_000 }).catch(() => {});
        return scanReflow(page, { name: "mobile", width: 375, height: 812 });
      });

      expect(findings).toHaveLength(0);
    }
  );
});
