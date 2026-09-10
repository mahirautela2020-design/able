import { describe, it, expect } from "vitest";
import { extractWcagLevel } from "@/engine/finding-mapping";

describe("extractWcagLevel", () => {
  it("labels AA-tagged rules as AA", () => {
    // axe-core's own tags for the "color-contrast" rule (1.4.3, AA).
    expect(extractWcagLevel(["wcag2aa", "wcag143"])).toBe("AA");
  });

  it("labels AAA-tagged rules as AAA, not AA", () => {
    // axe-core's own tags for "color-contrast-enhanced" (1.4.6, AAA) and
    // "identical-links-same-purpose" (2.4.9, AAA). Both list "wcag2aaa"
    // first. A naive `tag.includes("aa")` check matches "wcag2aaa" too
    // (it contains "aa" as a substring of "aaa"), so checking the AA
    // branch before the AAA branch silently mislabels every AAA rule as
    // AA -- verified against node_modules/axe-core's real rule tags.
    expect(extractWcagLevel(["wcag2aaa", "wcag146"])).toBe("AAA");
    expect(extractWcagLevel(["wcag2aaa", "wcag249"])).toBe("AAA");
  });

  it("labels A-tagged rules as A", () => {
    expect(extractWcagLevel(["wcag2a", "wcag111"])).toBe("A");
  });

  it("returns null for an empty tag list", () => {
    expect(extractWcagLevel([])).toBeNull();
  });
});
