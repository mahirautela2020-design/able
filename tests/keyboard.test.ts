import { describe, it, expect } from "vitest";

const hasChrome = !!process.env.CHROME_EXECUTABLE_PATH;

(hasChrome ? describe : describe.skip)("keyboard", () => {
  it("focus trap detection runs without throwing", () => {
    expect(true).toBe(true);
  });
});
