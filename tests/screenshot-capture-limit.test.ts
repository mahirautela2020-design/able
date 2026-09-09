import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { withPage, takeScreenshot, MAX_CAPTURE_PX } from "@/engine/browser";
import { cropRectFor } from "@/engine/evidence-crop";

const hasChrome = !!process.env.CHROME_EXECUTABLE_PATH;

const fixtureUrl = (name: string) => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return `file:///${path.join(dir, "fixtures", name).replace(/\\/g, "/")}`;
};

/**
 * Regression tests for the highest-impact defect found in stress testing:
 * Chromium composites a full-page capture through a 16384px texture, and past
 * that row it WRAPS AROUND, repeating the top of the page. The pipeline then
 * cropped findings from those repeated pixels and stored them as evidence.
 * Separately, sharp's WebP encoder rejects anything over 16383px, so the whole
 * screenshot used to be silently dropped on any tall page.
 */
describe("takeScreenshot — capture limits", () => {
  it.skipIf(!hasChrome)(
    "caps a document taller than the texture limit instead of wrapping around",
    async () => {
      const result = await withPage(async (page) => {
        await page.goto(fixtureUrl("tall-page.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        return takeScreenshot(page);
      });

      expect(result.documentHeight).toBeGreaterThan(MAX_CAPTURE_PX);
      expect(result.height).toBe(MAX_CAPTURE_PX);
      expect(result.truncated).toBe(true);

      const meta = await sharp(result.buffer).metadata();
      expect(meta.height).toBe(MAX_CAPTURE_PX);
    },
    120_000
  );

  it.skipIf(!hasChrome)(
    "produces a capture sharp can still encode as WebP",
    async () => {
      // The old 20000px clip threw "Processed image is too large for the WebP
      // format" here, and audit-url.ts swallowed it — no full screenshot at
      // all on any long page.
      const result = await withPage(async (page) => {
        await page.goto(fixtureUrl("tall-page.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        return takeScreenshot(page);
      });

      const webp = await sharp(result.buffer).webp({ quality: 80 }).toBuffer();
      expect(webp.byteLength).toBeGreaterThan(0);
    },
    120_000
  );

  it.skipIf(!hasChrome)(
    "reports the true size of a short page and does not mark it truncated",
    async () => {
      const result = await withPage(async (page) => {
        await page.goto(fixtureUrl("visible-focus.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        return takeScreenshot(page);
      });

      expect(result.truncated).toBe(false);
      expect(result.height).toBe(result.documentHeight);
      const meta = await sharp(result.buffer).metadata();
      expect(meta.height).toBe(result.height);
    },
    120_000
  );

  it.skipIf(!hasChrome)(
    "refuses to crop evidence for an element below the capture cut",
    async () => {
      const { screenshot, bottomY } = await withPage(async (page) => {
        await page.goto(fixtureUrl("tall-page.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        const bottomY = await page.evaluate(() => {
          const el = document.querySelector("#bottom") as HTMLElement;
          return el.getBoundingClientRect().y + window.scrollY;
        });
        return { screenshot: await takeScreenshot(page), bottomY };
      });

      expect(bottomY).toBeGreaterThan(screenshot.height);
      const crop = cropRectFor(
        { x: 0, y: bottomY, width: 200, height: 100 },
        screenshot.width,
        screenshot.height
      );
      expect(crop).toBeNull();
    },
    120_000
  );
});
