import { describe, it, expect } from "vitest";

const hasChrome = !!process.env.CHROME_EXECUTABLE_PATH;

describe("p4-mobile-code (e2e)", () => {
  it.skipIf(!hasChrome)("home page loads and shows audit form", async () => {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      executablePath: process.env.CHROME_EXECUTABLE_PATH,
      headless: true,
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto("http://localhost:3000", { timeout: 10_000 });
      const title = await page.title();
      expect(title).toBeTruthy();

      const form = page.locator("form");
      expect(await form.isVisible()).toBe(true);

      const input = page.locator('input[type="url"]');
      expect(await input.isVisible()).toBe(true);
    } finally {
      await context.close();
      await browser.close();
    }
  });
});
