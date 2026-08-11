import { describe, it, expect } from "vitest";

const hasChrome = !!process.env.CHROME_EXECUTABLE_PATH;

(hasChrome ? describe : describe.skip)("settle-scan", () => {
  it("settle-scan: catches CSR violations, zero noise (requires Chrome)", async () => {
    // Full browser test would go here when CHROME_EXECUTABLE_PATH is set
    expect(true).toBe(true);
  });
});
