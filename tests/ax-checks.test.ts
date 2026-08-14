import { describe, it, expect } from "vitest";
import {
  detectRoleMismatch,
  detectReadingOrderDivergence,
  detectDuplicateNames,
  runAxChecks,
} from "@/engine/ax-checks";
import type { AxFlatNode } from "@/engine/ax-tree";

function node(overrides: Partial<AxFlatNode>): AxFlatNode {
  return {
    role: "generic",
    name: "",
    description: "",
    level: null,
    value: null,
    checked: null,
    disabled: false,
    expanded: null,
    isVisible: true,
    rect: null,
    focusable: false,
    domTag: null,
    ...overrides,
  };
}

describe("detectRoleMismatch — requires real domTag (regression: was always null pre-fix)", () => {
  it("flags an <a> with role=button", () => {
    const nodes = [node({ role: "button", domTag: "a", name: "Go" })];
    const findings = detectRoleMismatch(nodes);
    expect(findings).toHaveLength(1);
    expect(findings[0].wcag_criterion).toBe("4.1.2");
    expect(findings[0].rule_id).toBe("ax-role-mismatch");
  });

  it("flags a <button> with role=link", () => {
    const nodes = [node({ role: "link", domTag: "button", name: "Cancel" })];
    expect(detectRoleMismatch(nodes)).toHaveLength(1);
  });

  it("does not flag a matching tag/role pair", () => {
    const nodes = [node({ role: "button", domTag: "button", name: "Submit" })];
    expect(detectRoleMismatch(nodes)).toHaveLength(0);
  });

  it("produces nothing when domTag is null (the pre-fix production behavior)", () => {
    const nodes = [node({ role: "button", domTag: null, name: "Go" })];
    expect(detectRoleMismatch(nodes)).toHaveLength(0);
  });
});

describe("detectReadingOrderDivergence — requires real rect (regression: was always null pre-fix)", () => {
  it("flags a fully-reversed visual vs. AX-tree order", () => {
    // 6 nodes in AX/document order 0..5; rects place them in exactly the
    // reverse visual (top-to-bottom) order, so every pair is inverted.
    const nodes: AxFlatNode[] = Array.from({ length: 6 }, (_, i) =>
      node({
        role: "link",
        name: `item-${i}`,
        rect: { x: 0, y: (5 - i) * 100, width: 50, height: 20 },
      })
    );

    const findings = detectReadingOrderDivergence(nodes);
    expect(findings).toHaveLength(1);
    expect(findings[0].wcag_criterion).toBe("1.3.2");
    expect(findings[0].bucket).toBe("needs_review");
  });

  it("does not flag when visual order matches AX order", () => {
    const nodes: AxFlatNode[] = Array.from({ length: 6 }, (_, i) =>
      node({
        role: "link",
        name: `item-${i}`,
        rect: { x: 0, y: i * 100, width: 50, height: 20 },
      })
    );

    expect(detectReadingOrderDivergence(nodes)).toHaveLength(0);
  });

  it("produces nothing when rects are null (the pre-fix production behavior)", () => {
    const nodes: AxFlatNode[] = Array.from({ length: 6 }, (_, i) =>
      node({ role: "link", name: `item-${i}`, rect: null })
    );

    expect(detectReadingOrderDivergence(nodes)).toHaveLength(0);
  });
});

describe("detectDuplicateNames — unaffected by the rect/domTag bug, sanity check", () => {
  it("flags two links sharing an accessible name", () => {
    const nodes = [
      node({ role: "link", name: "Read more" }),
      node({ role: "link", name: "Read more" }),
    ];
    const findings = detectDuplicateNames(nodes);
    expect(findings).toHaveLength(1);
    expect(findings[0].wcag_criterion).toBe("2.4.4");
  });
});

describe("runAxChecks — end to end with realistic enriched nodes", () => {
  it("surfaces role-mismatch and reading-order findings together when given real rect/domTag data", () => {
    const nodes: AxFlatNode[] = [
      node({ role: "button", domTag: "a", name: "Delete", rect: { x: 0, y: 300, width: 40, height: 20 } }),
      ...Array.from({ length: 5 }, (_, i) =>
        node({ role: "link", name: `nav-${i}`, rect: { x: 0, y: (4 - i) * 50, width: 40, height: 20 } })
      ),
    ];

    const findings = runAxChecks(nodes);
    const ruleIds = findings.map((f) => f.rule_id);
    expect(ruleIds).toContain("ax-role-mismatch");
    expect(ruleIds).toContain("ax-reading-order");
  });
});
