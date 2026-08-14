import { describe, it, expect } from "vitest";
import { extractFindings, type AxeResult } from "@/engine/axe-scan";

function makeResult(overrides: Partial<AxeResult["violations"][number]> = {}): AxeResult {
  return {
    testEngine: { name: "axe-core", version: "4.13.0" },
    passes: [],
    inapplicable: [],
    incomplete: [],
    violations: [
      {
        id: "color-contrast",
        help: "Elements must have sufficient color contrast",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.13/color-contrast",
        impact: "serious",
        // Real axe-core order: category, then the WCAG LEVEL tag
        // ("wcag2aa"), THEN the rule-specific SC tag ("wcag143") — tags[0]
        // is never the criterion.
        tags: ["cat.color", "wcag2aa", "wcag143", "ACT"],
        description: "Ensures the contrast between foreground and background colors meets WCAG thresholds",
        nodes: [
          {
            html: "<p>low contrast text</p>",
            impact: "serious",
            target: ["p.low-contrast"],
            failureSummary: "Fix contrast",
            any: [],
            all: [],
            none: [],
          },
        ],
        ...overrides,
      },
    ],
  };
}

describe("extractFindings — WCAG criterion mapping (regression: wcagCriterion = wcagTags[0] picked a level tag, not the SC)", () => {
  it("resolves wcag_criterion to the rule-specific dotted SC id, not the level tag", () => {
    const findings = extractFindings(makeResult(), "4.13.0", new Map());
    expect(findings).toHaveLength(1);
    expect(findings[0].wcag_criterion).toBe("1.4.3");
    expect(findings[0].wcag_criterion).not.toBe("wcag2aa");
  });

  it("wcag_criteria contains the dotted id, matching the registry's key format used by computeComplianceMatrix", () => {
    const findings = extractFindings(makeResult(), "4.13.0", new Map());
    expect(findings[0].wcag_criteria).toContain("1.4.3");
  });

  it("principle resolves correctly now that criterion is a real dotted id", () => {
    const findings = extractFindings(makeResult(), "4.13.0", new Map());
    expect(findings[0].principle).toBe("Perceivable");
  });

  it("falls back to the raw axe tag when a rule has no registry mapping (e.g. AAA rule not yet in the mapping)", () => {
    const findings = extractFindings(
      makeResult({ id: "some-unmapped-rule", tags: ["cat.other", "wcag2a", "wcag199"] }),
      "4.13.0",
      new Map()
    );
    expect(findings[0].wcag_criterion).toBe("wcag199");
  });
});
