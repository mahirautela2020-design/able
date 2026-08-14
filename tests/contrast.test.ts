import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  contrastVerdict,
  normalizeColor,
  suggestFix,
  hexToRgb,
  rgbToHex,
  requiredContrastRatio,
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

  it("requiredContrastRatio returns the four WCAG thresholds", () => {
    expect(requiredContrastRatio("AA", false)).toBe(4.5);
    expect(requiredContrastRatio("AA", true)).toBe(3.0);
    expect(requiredContrastRatio("AAA", false)).toBe(7.0);
    expect(requiredContrastRatio("AAA", true)).toBe(4.5);
  });

  it("regression: requiredContrastRatio returns the flat 3:1 non-text floor when hasText is false, ignoring level/largeText", () => {
    // WCAG 1.4.11 (non-text/UI-component contrast) has no AA/AAA tier and
    // no large-text variant — it's always 3:1. Before this fix, a non-text
    // element was held to the TEXT thresholds (e.g. 4.5:1 at AA-normal),
    // which reported a real 1.4.11 pass (e.g. 3.8:1) as a fabricated
    // failure whenever the default AA/normal-text target was active.
    expect(requiredContrastRatio("AA", false, false)).toBe(3.0);
    expect(requiredContrastRatio("AAA", false, false)).toBe(3.0);
    expect(requiredContrastRatio("AA", true, false)).toBe(3.0);
    expect(requiredContrastRatio("AAA", true, false)).toBe(3.0);
  });

  it("requiredContrastRatio defaults hasText to true (pre-existing text-threshold behavior for callers that don't pass it)", () => {
    expect(requiredContrastRatio("AA", false)).toBe(requiredContrastRatio("AA", false, true));
  });

  it("suggestFix reaches AAA (7:1) when given the AAA target", () => {
    const fix = suggestFix("#7a7a7a", "#ffffff", requiredContrastRatio("AAA", false));
    expect(fix.ratio).toBeGreaterThanOrEqual(7.0);
  });

  it("suggestFix reaches AA-large (3:1) when given the large-text target — a smaller shift than AA-normal", () => {
    const normalFix = suggestFix("#a0a0a0", "#ffffff", requiredContrastRatio("AA", false));
    const largeFix = suggestFix("#a0a0a0", "#ffffff", requiredContrastRatio("AA", true));
    expect(largeFix.ratio).toBeGreaterThanOrEqual(3.0);
    expect(normalFix.ratio).toBeGreaterThanOrEqual(4.5);
    // Large-text target is easier to hit, so it needs less darkening —
    // the resulting foreground should be lighter (higher luminance).
    expect(hexToRgb(largeFix.fg).r).toBeGreaterThan(hexToRgb(normalFix.fg).r);
  });
});
