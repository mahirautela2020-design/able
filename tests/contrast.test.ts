import { describe, it, expect } from "vitest";
import {
  AA_LARGE,
  AA_NORMAL,
  AAA_LARGE,
  AAA_NORMAL,
  contrastRatio,
  contrastVerdict,
  normalizeColor,
  suggestFix,
  hexToRgb,
  rgbToHex,
} from "@/lib/contrast";

describe("contrast", () => {
  it("computes known ratios", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#767676")).toBeCloseTo(4.5, 0);
    expect(contrastRatio("#ffffff", "#949494")).toBeCloseTo(3.0, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 0);
  });

  it("normalizes rgb()/rgba()/#rgb into canonical hex", () => {
    expect(normalizeColor("rgb(122, 122, 122)")).toBe("#7a7a7a");
    expect(normalizeColor("rgba(0, 0, 0, 1)")).toBe("#000000");
    expect(normalizeColor("#fff")).toBe("#ffffff");
    expect(normalizeColor("#FFFFFF")).toBe("#ffffff");
  });

  it("accepts rgb() strings directly in contrastRatio", () => {
    expect(contrastRatio("rgb(122, 122, 122)", "rgb(255, 255, 255)")).toBeCloseTo(
      contrastRatio("#7a7a7a", "#ffffff"),
      10
    );
  });

  it("hexToRgb / rgbToHex round-trip", () => {
    expect(rgbToHex(hexToRgb("#7a7a7a"))).toBe("#7a7a7a");
    expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe("#ffffff");
  });

  it("flags the demo button (#7a7a7a on white) as failing AA", () => {
    const ratio = contrastRatio("#7a7a7a", "#ffffff");
    expect(ratio).toBeLessThan(4.5);
    const verdict = contrastVerdict(ratio);
    expect(verdict.passesAA).toBe(false);
    expect(verdict.passesAAA).toBe(false);
    expect(verdict.level).toBe("fail");
    expect(verdict.requiredAA).toBe(4.5);
  });

  it("black on white passes AAA", () => {
    const verdict = contrastVerdict(contrastRatio("#000000", "#ffffff"));
    expect(verdict.passesAA).toBe(true);
    expect(verdict.passesAAA).toBe(true);
    expect(verdict.level).toBe("AAA");
  });

  it("large-text threshold is 3:1 for AA", () => {
    const verdict = contrastVerdict(contrastRatio("#ffffff", "#767676"), true);
    expect(verdict.requiredAA).toBe(3.0);
    expect(verdict.passesAA).toBe(true);
  });

  it("suggestFix darkens light text to reach AA (4.5:1)", () => {
    const fix = suggestFix("#7a7a7a", "#ffffff");
    expect(fix.ratio).toBeGreaterThanOrEqual(4.5);
    expect(fix.fg).toMatch(/^#[0-9a-f]{6}$/);
    expect(fix.bg).toBe("#ffffff");
  });

  it("suggestFix respects an explicit AAA normal-text target (7:1)", () => {
    const fix = suggestFix("#7a7a7a", "#ffffff", AAA_NORMAL);
    expect(fix.ratio).toBeGreaterThanOrEqual(AAA_NORMAL);
  });

  it("suggestFix respects an explicit AA large-text target (3:1) — needs less darkening than normal text", () => {
    const large = suggestFix("#a0a0a0", "#ffffff", AA_LARGE);
    const normal = suggestFix("#a0a0a0", "#ffffff", AA_NORMAL);
    expect(large.ratio).toBeGreaterThanOrEqual(AA_LARGE);
    expect(normal.ratio).toBeGreaterThanOrEqual(AA_NORMAL);
    // Meeting a lower ratio needs a less extreme (lighter) foreground.
    expect(hexToRgb(large.fg).r).toBeGreaterThanOrEqual(hexToRgb(normal.fg).r);
  });

  it("suggestFix respects an explicit AAA large-text target (4.5:1)", () => {
    const fix = suggestFix("#a0a0a0", "#ffffff", AAA_LARGE);
    expect(fix.ratio).toBeGreaterThanOrEqual(AAA_LARGE);
  });
});
