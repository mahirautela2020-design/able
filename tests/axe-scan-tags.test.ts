import { describe, it, expect } from "vitest";
import { AXE_RUN_TAGS } from "@/engine/axe-scan";

describe("axe-scan tag coverage", () => {
  it("includes AAA-level tags alongside A/AA (audit-modules.ts advertises full-registry coverage)", () => {
    expect(AXE_RUN_TAGS).toEqual(
      expect.arrayContaining(["wcag2aaa", "wcag21aaa", "wcag22aaa"])
    );
  });

  it("still includes the existing A/AA/best-practice tags (no regression)", () => {
    expect(AXE_RUN_TAGS).toEqual(
      expect.arrayContaining([
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
        "wcag22aa",
        "best-practice",
      ])
    );
  });
});
