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

async function keyboardOn(fixture: string) {
  return withPage(async (page) => {
    await page.goto(fixtureUrl(fixture), {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    return runKeyboard(page);
  });
}

const focusFindings = (findings: { rule_id: string }[]) =>
  findings.filter((f) => f.rule_id === "focus-indicator-missing");

/**
 * `checkFocusIndicator` used to hold two live `getComputedStyle` handles and
 * compare them — always equal, so it reported "no focus indicator" on 100% of
 * pages, including pages with nothing focusable on them. These tests pin both
 * directions: real rings are seen, real failures still fire.
 */
describe("focus indicator detection", () => {
  it.skipIf(!hasChrome)(
    "does not flag a page with a visible :focus ring",
    async () => {
      const result = await keyboardOn("visible-focus.html");
      expect(result.focusableCount).toBeGreaterThan(0);
      expect(result.focusIndicatorMissing).toBe(false);
      expect(focusFindings(result.findings)).toHaveLength(0);
    },
    120_000
  );

  it.skipIf(!hasChrome)(
    "does not flag a page that styles only :focus-visible",
    async () => {
      // Programmatic .focus() never matches :focus-visible in Chromium, so
      // this only passes via the stylesheet scan.
      const result = await keyboardOn("focus-visible-only.html");
      expect(result.focusIndicatorMissing).toBe(false);
    },
    120_000
  );

  it.skipIf(!hasChrome)(
    "still flags a page that suppresses the ring and replaces nothing",
    async () => {
      // `:focus { outline: none }` is a focus rule but not an indicator — the
      // stylesheet scan must not let it off the hook.
      const result = await keyboardOn("no-focus-indicator.html");
      expect(result.focusIndicatorMissing).toBe(true);
      expect(focusFindings(result.findings)).toHaveLength(1);
    },
    120_000
  );

  it.skipIf(!hasChrome)(
    "reports nothing on a page with no focusable elements",
    async () => {
      const result = await keyboardOn("no-focusables.html");
      expect(result.focusableCount).toBe(0);
      expect(result.focusIndicatorMissing).toBe(false);
      expect(focusFindings(result.findings)).toHaveLength(0);
    },
    120_000
  );

  it.skipIf(!hasChrome)(
    "records tab-sequence boxes in document coordinates",
    async () => {
      // Tabbing scrolls; viewport-relative boxes recorded across a walk are
      // not in one coordinate space, which fabricated tab-order findings.
      const result = await withPage(async (page) => {
        await page.goto(fixtureUrl("tall-page.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        await page.evaluate(() => window.scrollTo(0, 4000));
        return runKeyboard(page);
      });
      for (const step of result.tabSequence) {
        if (step.bbox) expect(step.bbox.y).toBeGreaterThanOrEqual(0);
      }
    },
    120_000
  );
});
