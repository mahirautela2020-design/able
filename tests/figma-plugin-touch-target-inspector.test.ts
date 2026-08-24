import { describe, expect, it } from "vitest";
import { checkTouchTargetSize } from "../figma-plugin/src/inspectors/touch-target";
import type { FigmaNodeLike } from "../figma-plugin/src/types";

function instance(overrides: Partial<FigmaNodeLike> & { id: string; name: string }): FigmaNodeLike {
  return { type: "INSTANCE", width: 40, height: 40, visible: true, ...overrides };
}

describe("checkTouchTargetSize", () => {
  it("flags an undersized node with an interactive-looking name", () => {
    const node = instance({ id: "n1", name: "Icon Button", width: 16, height: 16 });
    const findings = checkTouchTargetSize([node]);
    expect(findings).toHaveLength(1);
    expect(findings[0].wcag_criterion).toBe("2.5.8");
    expect(findings[0].selector).toBe("n1");
  });

  it("does not flag a large enough interactive node", () => {
    const node = instance({ id: "n1", name: "Icon Button", width: 32, height: 32 });
    expect(checkTouchTargetSize([node])).toHaveLength(0);
  });

  it("does not flag a small node with a non-interactive name", () => {
    const node = instance({ id: "n1", name: "Avatar", width: 16, height: 16 });
    expect(checkTouchTargetSize([node])).toHaveLength(0);
  });

  it("does not flag non-component/instance/frame node types", () => {
    const node: FigmaNodeLike = { id: "n1", name: "Button", type: "TEXT", width: 10, height: 10, visible: true };
    expect(checkTouchTargetSize([node])).toHaveLength(0);
  });

  it("does not flag invisible nodes", () => {
    const node = instance({ id: "n1", name: "Button", width: 10, height: 10, visible: false });
    expect(checkTouchTargetSize([node])).toHaveLength(0);
  });

  it("matches common interactive-name variants case-insensitively", () => {
    const names = ["Primary Button", "close-icon-button", "Nav Link", "Tab Item", "toggle", "Checkbox"];
    for (const name of names) {
      const node = instance({ id: name, name, width: 10, height: 10 });
      expect(checkTouchTargetSize([node]), name).toHaveLength(1);
    }
  });
});
