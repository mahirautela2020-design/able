import { describe, it, expect } from "vitest";
import { simulateCvd, flagCvdFailures, CVD_TYPES, CVD_LABELS, CVD_FILTERS } from "@/lib/cvd";
import { contrastRatio } from "@/lib/contrast";

describe("cvd", () => {
  it("simulates colors to valid hex", () => {
    for (const t of CVD_TYPES) {
      expect(simulateCvd("#ff0000", t)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("achromatopsia collapses any color to grayscale (r === g === b)", () => {
    const out = simulateCvd("#ff0000", "achromatopsia");
    expect(out[1] + out[2]).toBe(out[3] + out[4]);
    expect(out[3] + out[4]).toBe(out[5] + out[6]);
  });

  it("deuteranopia of pure green moves toward gray", () => {
    // Green's red/green separation collapses under deuteranopia.
    const out = simulateCvd("#009900", "deuteranopia");
    expect(out).not.toBe("#009900");
  });

  it("flags a pair that passes normal AA but fails under deuteranopia", () => {
    // Black text on saturated green: ~5.56:1 normally, ~3.01:1 to a deuteranope.
    const normal = contrastRatio("#000000", "#009900");
    expect(normal).toBeGreaterThanOrEqual(4.5);

    const flags = flagCvdFailures([{ fg: "#000000", bg: "#009900" }], "deuteranopia");
    expect(flags).toHaveLength(1);
    expect(flags[0].cvdRatio).toBeLessThan(4.5);
    expect(flags[0].normalRatio).toBeGreaterThanOrEqual(4.5);
  });

  it("does not flag pairs that stay passing under simulation", () => {
    const flags = flagCvdFailures([{ fg: "#000000", bg: "#ffffff" }], "deuteranopia");
    expect(flags).toHaveLength(0);
  });

  it("exposes labels and viewport filters for every type", () => {
    for (const t of CVD_TYPES) {
      expect(typeof CVD_LABELS[t]).toBe("string");
      expect(typeof CVD_FILTERS[t]).toBe("string");
    }
  });
});
