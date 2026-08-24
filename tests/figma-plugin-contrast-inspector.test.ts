import { describe, expect, it } from "vitest";
import { checkTextContrast } from "../figma-plugin/src/inspectors/contrast";
import type { FigmaNodeLike } from "../figma-plugin/src/types";

function textNode(overrides: Partial<FigmaNodeLike> & { id: string }): FigmaNodeLike {
  return {
    name: overrides.id,
    type: "TEXT",
    width: 100,
    height: 20,
    visible: true,
    fontSize: 16,
    fontWeight: 400,
    ...overrides,
  };
}

describe("checkTextContrast", () => {
  it("flags white text on a white background", () => {
    const parent: FigmaNodeLike = {
      id: "parent",
      name: "parent",
      type: "FRAME",
      width: 200,
      height: 200,
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
    };
    const text = textNode({
      id: "t1",
      parent,
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
    });
    const findings = checkTextContrast([text]);
    expect(findings).toHaveLength(1);
    expect(findings[0].wcag_criterion).toBe("1.4.3");
    expect(findings[0].selector).toBe("t1");
  });

  it("does not flag black text on a white background", () => {
    const parent: FigmaNodeLike = {
      id: "parent",
      name: "parent",
      type: "FRAME",
      width: 200,
      height: 200,
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
    };
    const text = textNode({
      id: "t1",
      parent,
      fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }],
    });
    expect(checkTextContrast([text])).toHaveLength(0);
  });

  it("uses the large-text threshold for 24px+ text", () => {
    // #999999 on white is ~2.85:1 -- fails both normal (4.5) and large
    // (3.0) thresholds, so use a ratio that only clears the LARGE
    // threshold to prove the size branch is actually used: #767676 on
    // white is ~4.54:1 (passes normal AND large). Use #8a8a8a (~3.5:1)
    // instead -- passes large-text 3:1 but fails normal-text 4.5:1.
    const parent: FigmaNodeLike = {
      id: "parent",
      name: "parent",
      type: "FRAME",
      width: 200,
      height: 200,
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
    };
    const largeText = textNode({
      id: "t1",
      parent,
      fontSize: 24,
      fills: [{ type: "SOLID", visible: true, color: { r: 0.541, g: 0.541, b: 0.541 } }],
    });
    const normalText = textNode({
      id: "t2",
      parent,
      fontSize: 16,
      fills: [{ type: "SOLID", visible: true, color: { r: 0.541, g: 0.541, b: 0.541 } }],
    });
    expect(checkTextContrast([largeText])).toHaveLength(0); // passes large-text 3:1
    expect(checkTextContrast([normalText])).toHaveLength(1); // fails normal-text 4.5:1
  });

  it("skips non-TEXT nodes", () => {
    const frame: FigmaNodeLike = { id: "f1", name: "f1", type: "FRAME", width: 10, height: 10 };
    expect(checkTextContrast([frame])).toHaveLength(0);
  });

  it("skips invisible text", () => {
    const text = textNode({ id: "t1", visible: false, fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }] });
    expect(checkTextContrast([text])).toHaveLength(0);
  });

  it("skips text with no evaluable fill (mixed or none)", () => {
    const text = textNode({ id: "t1", fills: Symbol("mixed") as unknown as undefined });
    expect(checkTextContrast([text])).toHaveLength(0);
  });
});
