import { describe, it, expect } from "vitest";
import { buildVPAT, vpatToCsv, vpatToJson } from "@/lib/vpat/builder";
import type { Finding } from "@/engine/axe-scan";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    bucket: "automated",
    rule_id: "color-contrast",
    rule_title: "Elements must have sufficient color contrast",
    wcag_criteria: ["1.4.3"],
    wcag_criterion: "1.4.3",
    wcag_level: "AA",
    principle: "Perceivable",
    severity: "moderate",
    confidence: 0.9,
    source_engines: ["axe-core"],
    selector: "div.low-contrast",
    element_html: "<div>text</div>",
    failure_summary: "Fix contrast",
    additional_instances: 0,
    bbox: null,
    evidence: {},
    engine_version: "4.13.0",
    ...overrides,
  };
}

describe("vpat/builder", () => {
  it("no findings produces Supports for all criteria", () => {
    const vpat = buildVPAT({ findings: [], maturity: null });
    for (const section of vpat.sections) {
      if (section.criteria.startsWith("Maturity")) continue;
      expect(section.conformance).toBe("Supports");
    }
  });

  it("critical finding for 1.4.3 produces Does Not Support", () => {
    const findings = [makeFinding({ severity: "critical", wcag_criteria: ["1.4.3"], wcag_criterion: "1.4.3" })];
    const vpat = buildVPAT({ findings, maturity: null });
    const sc = vpat.sections.find((s) => s.criteria.startsWith("1.4.3"));
    expect(sc).toBeDefined();
    expect(sc?.conformance).toBe("Does Not Support");
  });

  it("moderate finding produces Partial", () => {
    const findings = [makeFinding({ severity: "moderate", wcag_criteria: ["3.3.2"], wcag_criterion: "3.3.2" })];
    const vpat = buildVPAT({ findings, maturity: null });
    const sc = vpat.sections.find((s) => s.criteria.startsWith("3.3.2"));
    expect(sc).toBeDefined();
    expect(sc?.conformance).toBe("Partial");
  });

  it("remarks contain finding rule id for violations", () => {
    const findings = [makeFinding({
      severity: "critical",
      rule_id: "button-name",
      rule_title: "Buttons must have discernible text",
      wcag_criteria: ["4.1.2"],
      wcag_criterion: "4.1.2",
    })];
    const vpat = buildVPAT({ findings, maturity: null });
    const sc = vpat.sections.find((s) => s.criteria.startsWith("4.1.2"));
    expect(sc?.remarks).toContain("button-name");
  });

  it("untagged findings (no wcag criteria) are omitted", () => {
    const findings = [makeFinding({
      bucket: "best-practice",
      wcag_criteria: [],
      wcag_criterion: null,
    })];
    const vpat = buildVPAT({ findings, maturity: null });
    for (const section of vpat.sections) {
      if (section.criteria.startsWith("Maturity")) continue;
      expect(section.conformance).toBe("Supports");
    }
  });

  it("critical severity outranks moderate for conformance", () => {
    const findings = [
      makeFinding({ severity: "moderate", rule_id: "rule-a", wcag_criteria: ["1.1.1"], wcag_criterion: "1.1.1" }),
      makeFinding({ severity: "critical", rule_id: "rule-b", wcag_criteria: ["1.1.1"], wcag_criterion: "1.1.1" }),
    ];
    const vpat = buildVPAT({ findings, maturity: null });
    const sc = vpat.sections.find((s) => s.criteria.startsWith("1.1.1"));
    expect(sc?.conformance).toBe("Does Not Support");
  });

  it("includes maturity section when maturity data provided", () => {
    const findings = [makeFinding()];
    const vpat = buildVPAT({
      findings,
      maturity: { overall: 3.5, level: "Optimizing", byDomain: [] },
    });
    const maturitySection = vpat.sections.find((s) =>
      s.criteria.startsWith("Maturity")
    );
    expect(maturitySection).toBeDefined();
    expect(maturitySection?.remarks).toContain("Optimizing");
  });

  it("vpatToCsv returns valid CSV", () => {
    const vpat = buildVPAT({ findings: [], maturity: null });
    const csv = vpatToCsv(vpat);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Criteria,Level,Conformance,Remarks");
    expect(lines.length).toBeGreaterThan(1);
  });

  it("vpatToJson returns structured JSON", () => {
    const vpat = buildVPAT({ findings: [], maturity: null });
    const json = vpatToJson(vpat);
    expect(json.title).toBeDefined();
    expect(json.standard).toBe("WCAG 2.0");
    expect(Array.isArray(json.sections)).toBe(true);
  });
});
