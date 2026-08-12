import { describe, it, expect } from "vitest";
import { parseFigmaFile, collectTextNodes, collectFillableNodes, getResolvedTextStyle, figmaFillToHex } from "@/lib/figma/parse";
import fixture from "@/lib/figma/__fixtures__/sample-file.json";

describe("figma-parse", () => {
  it("parses sample file into array of top-level frame nodes", () => {
    const nodes = parseFigmaFile(fixture);
    expect(nodes.length).toBe(1);
    expect(nodes[0]!.type).toBe("FRAME");
    expect(nodes[0]!.name).toBe("Hero Section");
  });

  it("extracts text node with characters and style", () => {
    const nodes = parseFigmaFile(fixture);
    const textNodes = collectTextNodes(nodes);
    const title = textNodes.find((n) => n.name === "Title");
    expect(title).toBeDefined();
    expect(title!.characters).toBe("Welcome to ScanA11y");
    expect(title!.style?.fontSize).toBe(32);
    expect(title!.style?.fontWeight).toBe(700);
  });

  it("preserves nested frame children with depth", () => {
    const nodes = parseFigmaFile(fixture);
    const buttonNode = nodes[0]!.children?.find((c) => c.name === "CTA Button");
    expect(buttonNode).toBeDefined();
    expect(buttonNode?.children).toBeDefined();
    expect(buttonNode?.children?.length).toBeGreaterThanOrEqual(1);
    expect(buttonNode?.children?.[0]?.type).toBe("TEXT");
    expect(buttonNode?.children?.[0]?.characters).toBe("Get Started");
  });

  it("handles nodes with missing fields gracefully", () => {
    const nodes = parseFigmaFile(fixture);
    const unstyled = nodes[0]!.children?.find((c) => c.name === "Unstyled text");
    expect(unstyled).toBeDefined();
    expect(unstyled!.characters).toBe("No style block");
    expect(unstyled!.style).toBeUndefined();
  });

  it("collects fillable nodes (with fills or strokes)", () => {
    const nodes = parseFigmaFile(fixture);
    const fillable = collectFillableNodes(nodes);
    expect(fillable.length).toBeGreaterThanOrEqual(4);
    const hasSolids = fillable.some((n) =>
      n.fills?.some((f) => f.type === "SOLID")
    );
    expect(hasSolids).toBe(true);
  });

  it("getResolvedTextStyle falls back to 16px/400 when style missing", () => {
    const nodes = parseFigmaFile(fixture);
    const root = nodes[0];
    expect(root).toBeDefined();
    const unstyled = root.children?.find((c) => c.name === "Unstyled text");
    expect(unstyled).toBeDefined();
    const resolved = getResolvedTextStyle(unstyled!);
    expect(resolved.fontSize).toBe(16);
    expect(resolved.fontWeight).toBe(400);
  });

  it("getResolvedTextStyle returns real values for styled text", () => {
    const nodes = parseFigmaFile(fixture);
    const root = nodes[0];
    expect(root).toBeDefined();
    const title = root.children?.find((c) => c.name === "Title");
    expect(title).toBeDefined();
    const resolved = getResolvedTextStyle(title!);
    expect(resolved.fontSize).toBe(32);
    expect(resolved.fontWeight).toBe(700);
  });

  it("figmaFillToHex converts {r:1,g:1,b:1} to #ffffff", () => {
    const hex = figmaFillToHex({ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } });
    expect(hex).toBe("#ffffff");
  });

  it("figmaFillToHex returns null for gradient fills", () => {
    const hex = figmaFillToHex({ type: "GRADIENT_LINEAR" });
    expect(hex).toBeNull();
  });

  it("figmaFillToHex converts blue to correct hex", () => {
    const hex = figmaFillToHex({ type: "SOLID", color: { r: 0.15, g: 0.35, b: 0.85, a: 1 } });
    expect(hex).toBe("#2659d9");
  });
});
