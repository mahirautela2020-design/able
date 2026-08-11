import { describe, it, expect } from "vitest";

describe("inngest-mobile-code", () => {
  it("process-mobile function exists and is registered", async () => {
    const { processMobile, functions } = await import("@/inngest/functions");
    expect(processMobile).toBeDefined();
    expect(functions).toContain(processMobile);
  });

  it("process-code function exists and is registered", async () => {
    const { processCode, functions } = await import("@/inngest/functions");
    expect(processCode).toBeDefined();
    expect(functions).toContain(processCode);
  });

  it("functions array includes all three phases", async () => {
    const { functions, auditUrl, processMobile, processCode } = await import("@/inngest/functions");
    expect(Array.isArray(functions)).toBe(true);
    expect(functions.length).toBeGreaterThanOrEqual(3);
    expect(functions).toContain(auditUrl);
    expect(functions).toContain(processMobile);
    expect(functions).toContain(processCode);
  });
});
