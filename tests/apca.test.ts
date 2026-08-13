import { describe, it, expect } from "vitest";
import { apcaContrast, apcaBand } from "@/lib/apca";

describe("apcaContrast", () => {
  it("is zero for identical foreground/background", () => {
    expect(apcaContrast("#808080", "#808080")).toBe(0);
    expect(apcaContrast("#ffffff", "#ffffff")).toBe(0);
  });

  it("black text on white background is strongly positive (normal polarity)", () => {
    const lc = apcaContrast("#000000", "#ffffff");
    expect(lc).toBeGreaterThan(90);
    expect(lc).toBeLessThanOrEqual(108);
  });

  it("white text on black background is strongly negative (reverse polarity)", () => {
    const lc = apcaContrast("#ffffff", "#000000");
    expect(lc).toBeLessThan(-90);
    expect(lc).toBeGreaterThanOrEqual(-108);
  });

  it("polarity flips sign but not (roughly) magnitude for a pure black/white swap", () => {
    const bow = apcaContrast("#000000", "#ffffff");
    const wob = apcaContrast("#ffffff", "#000000");
    expect(Math.sign(bow)).not.toBe(Math.sign(wob));
    expect(Math.abs(Math.abs(bow) - Math.abs(wob))).toBeLessThan(15);
  });

  it("contrast magnitude shrinks monotonically as text approaches the background", () => {
    const far = Math.abs(apcaContrast("#000000", "#ffffff"));
    const mid = Math.abs(apcaContrast("#767676", "#ffffff"));
    const near = Math.abs(apcaContrast("#e5e5e5", "#ffffff"));
    expect(far).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(near);
  });

  it("is deterministic (same inputs, same output)", () => {
    const a = apcaContrast("#333333", "#f5f5f5");
    const b = apcaContrast("#333333", "#f5f5f5");
    expect(a).toBe(b);
  });
});

describe("apcaBand", () => {
  it("bands a strong pair as high", () => {
    expect(apcaBand(apcaContrast("#000000", "#ffffff"))).toBe("high");
  });

  it("bands a near-invisible pair as insufficient", () => {
    expect(apcaBand(apcaContrast("#fafafa", "#ffffff"))).toBe("insufficient");
  });

  it("banding is symmetric in sign (magnitude-based)", () => {
    expect(apcaBand(apcaContrast("#ffffff", "#000000"))).toBe(
      apcaBand(apcaContrast("#000000", "#ffffff"))
    );
  });
});
