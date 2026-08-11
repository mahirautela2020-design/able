import { describe, it, expect } from "vitest";
import { linkFindingsToAria } from "@/lib/sr/sr-finding-linker";
import type { Finding } from "@/engine/axe-scan";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    bucket: "automated",
    rule_id: "button-name",
    rule_title: "Buttons must have discernible text",
    wcag_criteria: ["4.1.2"],
    wcag_criterion: "4.1.2",
    wcag_level: "A",
    principle: "Robust",
    severity: "critical",
    confidence: 0.9,
    source_engines: ["axe-core"],
    selector: "#main > button",
    element_html: "<button></button>",
    failure_summary: "Fix button name",
    additional_instances: 0,
    bbox: null,
    evidence: {},
    engine_version: "4.13.0",
    ...overrides,
  };
}

describe("sr/linker", () => {
  it("returns null ariaNode when no snapshot provided", () => {
    const findings = [makeFinding()];
    const result = linkFindingsToAria(findings, null);
    expect(result).toHaveLength(1);
    expect(result[0].ariaNode).toBeNull();
    expect(result[0].finding.rule_id).toBe("button-name");
  });

  it("links finding to matching aria node by selector", () => {
    const findings = [makeFinding({ selector: "#main > button" })];
    const snapshot = {
      role: "WebArea",
      name: "",
      children: [
        {
          role: "main",
          name: "",
          children: [
            { role: "button", name: "Submit", children: [] },
          ],
        },
      ],
    };

    const result = linkFindingsToAria(findings, snapshot);
    expect(result).toHaveLength(1);
    expect(result[0].ariaNode).not.toBeNull();
    expect(result[0].ariaNode?.role).toBe("button");
  });

  it("links finding by role", () => {
    const findings = [makeFinding({ selector: "button" })];
    const snapshot = {
      role: "WebArea",
      name: "",
      children: [
        { role: "button", name: "Click me", children: [] },
      ],
    };

    const result = linkFindingsToAria(findings, snapshot);
    expect(result).toHaveLength(1);
    expect(result[0].ariaNode?.role).toBe("button");
  });

  it("handles finding with no selector", () => {
    const findings = [makeFinding({ selector: "" })];
    const result = linkFindingsToAria(findings, {
      role: "root",
      name: "",
      children: [],
    });
    expect(result[0].ariaNode).toBeNull();
  });
});
