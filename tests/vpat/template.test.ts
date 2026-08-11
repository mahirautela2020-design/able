import { describe, it, expect } from "vitest";
import { getVpatTemplate, getVpatCriteriaIds } from "@/lib/vpat/template";

describe("vpat/template", () => {
  const template = getVpatTemplate();
  const criteriaIds = getVpatCriteriaIds();

  it("has 38 SC across A + AA", () => {
    expect(template.sections).toHaveLength(38);
    expect(criteriaIds).toHaveLength(38);
  });

  it("has unique criteria ids", () => {
    expect(new Set(criteriaIds).size).toBe(criteriaIds.length);
  });

  it("has required columns: Criteria, Level, Conformance, Remarks", () => {
    for (const section of template.sections) {
      expect(section.criteria).toBeTruthy();
      expect(section.level).toMatch(/^(A|AA)$/);
      expect(section.conformance).toMatch(
        /^(Supports|Partial|Does Not Support|Not Applicable)$/
      );
      expect(typeof section.remarks).toBe("string");
    }
  });

  it("has correct number of level A and AA criteria", () => {
    const aCriteria = template.sections.filter((s) => s.level === "A");
    const aaCriteria = template.sections.filter((s) => s.level === "AA");
    expect(aCriteria.length).toBe(25);
    expect(aaCriteria.length).toBe(13);
  });

  it("includes all WCAG 2.0 A+AA criteria", () => {
    const expectedIds = [
      "1.1.1", "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5",
      "1.3.1", "1.3.2", "1.3.3",
      "1.4.1", "1.4.2", "1.4.3", "1.4.4", "1.4.5",
      "2.1.1", "2.1.2", "2.2.1", "2.2.2", "2.3.1",
      "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.5", "2.4.6", "2.4.7",
      "3.1.1", "3.1.2", "3.2.1", "3.2.2", "3.2.3", "3.2.4",
      "3.3.1", "3.3.2", "3.3.3", "3.3.4",
      "4.1.1", "4.1.2",
    ];
    expect(criteriaIds.sort()).toEqual(expectedIds.sort());
  });
});
