import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPage } from "@/engine/browser";
import { waitForPageSettle } from "@/engine/settle";
import { runAxe } from "@/engine/axe-scan";

const hasChrome = !!process.env.CHROME_EXECUTABLE_PATH;

const fixtureUrl = (name: string) => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return `file:///${path.join(dir, "fixtures", name).replace(/\\/g, "/")}`;
};

describe("settle-scan", () => {
  it.skipIf(!hasChrome)(
    "settled scan catches CSR violations, zero noise findings",
    async () => {
      const result = await withPage(async (page) => {
        await page.goto(fixtureUrl("csr-test.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        await waitForPageSettle(page, { networkidleTimedOut: false });
        return runAxe(page);
      });

      const ruleIds = result.findings
        .filter((f) => f.bucket === "automated" || f.bucket === "needs_review")
        .map((f) => f.rule_id);

      // The CSR fixture hydrates content 1.5s after load. A settled scan sees it.
      expect(ruleIds).toContain("image-alt");
      expect(ruleIds).toContain("label");
      expect(ruleIds).toContain("color-contrast");
      expect(ruleIds).toContain("link-name");
      // Noise findings on an empty root must NOT appear
      expect(ruleIds).not.toContain("landmark-one-main");
      expect(ruleIds).not.toContain("page-has-heading-one");
    },
  );

  it.skipIf(!hasChrome)(
    "unsettled scan sees the empty root (documents why settle matters)",
    async () => {
      const result = await withPage(async (page) => {
        await page.goto(fixtureUrl("csr-test.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        // No settle — the bug the tool must never regress into.
        return runAxe(page);
      });

      const ruleIds = result.findings.map((f) => f.rule_id);
      // Without settle, the root is still empty: noise rules fire, real ones don't.
      expect(ruleIds).toContain("landmark-one-main");
      expect(ruleIds).not.toContain("image-alt");
    },
  );
});
