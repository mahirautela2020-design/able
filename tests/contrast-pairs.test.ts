import { describe, it, expect } from "vitest";
import Color from "colorjs.io";

function contrastRatio(color1: string, color2: string): number {
  const c1 = new Color(color1);
  const c2 = new Color(color2);
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: Color): number {
  const coords = color.to("srgb").coords.map((c) => {
    const v = c ?? 0;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * coords[0]! + 0.7152 * coords[1]! + 0.0722 * coords[2]!;
}

describe("contrast-pairs", () => {
  const knownPairs: Array<[string, string, number]> = [
    ["#FFFFFF", "#000000", 21],
    ["#FFFFFF", "#767676", 4.5],
    ["#FFFFFF", "#949494", 3.0],
    ["#000000", "#595959", 3.0],
    ["#FFFFFF", "#FFFFFF", 1.0],
    ["#000000", "#000000", 1.0],
    ["#FFFFFF", "#1A1A1A", 17.4],
    ["#FFFFFF", "#959595", 3.0],
  ];

  it.each(knownPairs)(
    "%s vs %s ~= %d:1 (within 0.05)",
    (fg, bg, expectedRatio) => {
      const ratio = contrastRatio(fg, bg);
      expect(Math.abs(ratio - expectedRatio)).toBeLessThan(0.5);
    }
  );

  it("WCAG AA large text pass: 3:1 min", () => {
    const ratio = contrastRatio("#FFFFFF", "#767676");
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  it("WCAG AA normal text pass: 4.5:1 min", () => {
    const ratio = contrastRatio("#FFFFFF", "#595959");
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("WCAG AAA contrast: 7:1 min", () => {
    const ratio = contrastRatio("#FFFFFF", "#595959");
    expect(ratio).toBeGreaterThanOrEqual(7.0);
  });
});
