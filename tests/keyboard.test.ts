import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPage } from "@/engine/browser";
import { runKeyboard } from "@/engine/keyboard";

const hasChrome = !!process.env.CHROME_EXECUTABLE_PATH;

const fixtureUrl = (name: string) => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return `file:///${path.join(dir, "fixtures", name).replace(/\\/g, "/")}`;
};

describe("keyboard walkthrough", () => {
  it.skipIf(!hasChrome)(
    "detects the focus trap in the trap fixture",
    async () => {
      const result = await withPage(async (page) => {
        await page.goto(fixtureUrl("focus-trap.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        return runKeyboard(page);
      });

      expect(result.focusTrapDetected).toBe(true);
      // A trap is a sequence, not a single element — it must land in needs_review
      const trapFindings = result.findings.filter(
        (f) => f.bucket === "needs_review" && f.rule_id.includes("trap"),
      );
      expect(trapFindings.length).toBeGreaterThan(0);
    },
  );

  it.skipIf(!hasChrome)(
    "does not false-positive on a well-behaved page",
    async () => {
      const result = await withPage(async (page) => {
        await page.goto("file:///M:/Asus%20Laptop/Desktop/Able/tests/fixtures/csr-test.html", {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        // Wait for hydration so the page has real focusables
        await page.waitForSelector("#root > *", { timeout: 10_000 }).catch(() => {});
        return runKeyboard(page);
      });

      expect(result.focusTrapDetected).toBe(false);
      expect(result.focusableCount).toBeGreaterThan(0);
    },
  );
});
