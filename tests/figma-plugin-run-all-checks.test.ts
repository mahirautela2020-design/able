import { describe, expect, it } from "vitest";
import { runAllChecks, TESTED_SC_IDS } from "../figma-plugin/src/inspectors/index";
import type { FigmaNodeLike } from "../figma-plugin/src/types";

describe("TESTED_SC_IDS", () => {
  it("lists exactly the SC ids the live checks cover", () => {
    expect(TESTED_SC_IDS.sort()).toEqual(["1.1.1", "1.4.3", "1.4.4", "2.4.6", "2.5.8"].sort());
  });
});

describe("runAllChecks", () => {
  it("aggregates findings across all inspectors", () => {
    const parent: FigmaNodeLike = {
      id: "parent",
      name: "parent",
      type: "FRAME",
      width: 300,
      height: 300,
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
    };
    const badContrastText: FigmaNodeLike = {
      id: "t1",
      name: "t1",
      type: "TEXT",
      width: 100,
      height: 20,
      visible: true,
      fontSize: 16,
      fontWeight: 400,
      parent,
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
    };
    const smallButton: FigmaNodeLike = {
      id: "b1",
      name: "Icon Button",
      type: "INSTANCE",
      width: 16,
      height: 16,
      visible: true,
    };
    const unnamedImage: FigmaNodeLike = {
      id: "i1",
      name: "Rectangle 1",
      type: "RECTANGLE",
      width: 100,
      height: 100,
      visible: true,
      fills: [{ type: "IMAGE", visible: true }],
    };
    const findings = runAllChecks([parent, badContrastText, smallButton, unnamedImage]);
    const ruleIds = findings.map((f) => f.rule_id).sort();
    expect(ruleIds).toEqual(["figma-missing-description", "figma-text-contrast", "figma-touch-target-size"]);
  });

  it("returns an empty array for an empty scope", () => {
    expect(runAllChecks([])).toEqual([]);
  });
});
