// tests/figma-plugin-node-helpers.test.ts
import { describe, expect, it } from "vitest";
import {
  collectNodes,
  figmaColorToHex,
  isLargeText,
  resolveBackgroundColor,
  resolveFillColor,
} from "../figma-plugin/src/node-helpers";
import type { FigmaNodeLike } from "../figma-plugin/src/types";

function node(overrides: Partial<FigmaNodeLike> & { id: string }): FigmaNodeLike {
  return {
    name: overrides.id,
    type: "FRAME",
    width: 100,
    height: 100,
    visible: true,
    ...overrides,
  };
}

describe("figmaColorToHex", () => {
  it("converts a 0-1 float RGB color to hex", () => {
    expect(figmaColorToHex({ r: 1, g: 1, b: 1 })).toBe("#ffffff");
    expect(figmaColorToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
    expect(figmaColorToHex({ r: 1, g: 0, b: 0 })).toBe("#ff0000");
  });
});

describe("resolveFillColor", () => {
  it("returns the first visible SOLID fill as hex", () => {
    const fills = [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }];
    expect(resolveFillColor(fills)).toBe("#000000");
  });

  it("skips invisible fills", () => {
    const fills = [
      { type: "SOLID", visible: false, color: { r: 1, g: 0, b: 0 } },
      { type: "SOLID", visible: true, color: { r: 0, g: 1, b: 0 } },
    ];
    expect(resolveFillColor(fills)).toBe("#00ff00");
  });

  it("returns null for mixed fills (a Symbol)", () => {
    expect(resolveFillColor(Symbol("mixed"))).toBeNull();
  });

  it("returns null when there are no solid fills", () => {
    expect(resolveFillColor([{ type: "IMAGE", visible: true }])).toBeNull();
  });

  it("returns null for undefined fills", () => {
    expect(resolveFillColor(undefined)).toBeNull();
  });
});

describe("resolveBackgroundColor", () => {
  it("walks up the parent chain to find the nearest solid fill", () => {
    const grandparent = node({
      id: "gp",
      fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 1 } }],
    });
    const parent = node({ id: "p", parent: grandparent, fills: [] });
    const child = node({ id: "c", parent, fills: [] });
    expect(resolveBackgroundColor(child)).toBe("#0000ff");
  });

  it("defaults to white when no ancestor has a solid fill", () => {
    const parent = node({ id: "p", fills: [] });
    const child = node({ id: "c", parent, fills: [] });
    expect(resolveBackgroundColor(child)).toBe("#ffffff");
  });
});

describe("isLargeText", () => {
  it("treats 18px+ as large regardless of weight", () => {
    expect(isLargeText(18, 400)).toBe(true);
    expect(isLargeText(24, 400)).toBe(true);
  });

  it("treats 14px+ bold as large", () => {
    expect(isLargeText(14, 700)).toBe(true);
    expect(isLargeText(14, 400)).toBe(false);
  });

  it("treats anything smaller as not large", () => {
    expect(isLargeText(13, 700)).toBe(false);
  });

  it("returns false when fontSize is mixed (a Symbol)", () => {
    expect(isLargeText(Symbol("mixed"), 400)).toBe(false);
  });
});

describe("collectNodes", () => {
  it("flattens a tree depth-first", () => {
    const leaf1 = node({ id: "leaf1" });
    const leaf2 = node({ id: "leaf2" });
    const branch = node({ id: "branch", children: [leaf1, leaf2] });
    const root = node({ id: "root", children: [branch] });
    expect(collectNodes([root]).map((n) => n.id)).toEqual(["root", "branch", "leaf1", "leaf2"]);
  });

  it("handles multiple roots and nodes with no children", () => {
    const a = node({ id: "a" });
    const b = node({ id: "b" });
    expect(collectNodes([a, b]).map((n) => n.id)).toEqual(["a", "b"]);
  });
});
