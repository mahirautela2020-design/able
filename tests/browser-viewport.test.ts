import { describe, it, expect } from "vitest";
import { withPage } from "@/engine/browser";

const hasChrome = !!process.env.CHROME_EXECUTABLE_PATH;

describe("withPage — viewport override", () => {
  it.skipIf(!hasChrome)(
    "defaults to 1440x900 when no viewport is given (no regression)",
    async () => {
      const size = await withPage(async (page) => page.viewportSize());
      expect(size).toEqual({ width: 1440, height: 900 });
    }
  );

  it.skipIf(!hasChrome)(
    "opens the page at the requested viewport when one is given",
    async () => {
      const size = await withPage(
        async (page) => page.viewportSize(),
        { viewport: { width: 375, height: 812 } }
      );
      expect(size).toEqual({ width: 375, height: 812 });
    }
  );
});
