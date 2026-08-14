import { describe, it, expect } from "vitest";
import { apcaContrast, apcaVerdict } from "@/lib/apca";

describe("apcaContrast — APCA-W3 perceptual contrast (Lc)", () => {
  it("black text on white background is strongly positive and near the ceiling", () => {
    const lc = apcaContrast("#000000", "#ffffff");
    expect(lc).toBeGreaterThan(95);
    expect(lc).toBeLessThanOrEqual(108);
  });

  it("white text on black background is strongly negative and near the floor", () => {
    const lc = apcaContrast("#ffffff", "#000000");
    expect(lc).toBeLessThan(-95);
    expect(lc).toBeGreaterThanOrEqual(-108);
  });

  it("identical foreground/background yields ~0 Lc", () => {
    expect(Math.abs(apcaContrast("#808080", "#808080"))).toBeLessThan(1);
  });

  it("sign encodes polarity: dark-on-light is positive, light-on-dark is negative", () => {
    expect(apcaContrast("#333333", "#eeeeee")).toBeGreaterThan(0);
    expect(apcaContrast("#eeeeee", "#333333")).toBeLessThan(0);
  });

  it("is monotonic: moving the foreground further from the background increases |Lc|", () => {
    const bg = "#ffffff";
    const near = Math.abs(apcaContrast("#cccccc", bg));
    const mid = Math.abs(apcaContrast("#888888", bg));
    const far = Math.abs(apcaContrast("#000000", bg));
    expect(mid).toBeGreaterThan(near);
    expect(far).toBeGreaterThan(mid);
  });

  it("is deterministic — same colors always produce the same Lc", () => {
    expect(apcaContrast("#123456", "#abcdef")).toBe(apcaContrast("#123456", "#abcdef"));
  });
});

describe("apcaVerdict — informational only, never a hard WCAG gate", () => {
  it("labels a strong pair as high-contrast informationally", () => {
    const v = apcaVerdict("#000000", "#ffffff");
    expect(v.lc).toBeGreaterThan(95);
    expect(v.absLc).toBe(Math.abs(v.lc));
    expect(v.label).toMatch(/high|strong/i);
  });

  it("labels a near-invisible pair as very low contrast", () => {
    const v = apcaVerdict("#808080", "#828282");
    expect(v.absLc).toBeLessThan(15);
    expect(v.label).toMatch(/low|fail|insufficient/i);
  });
});
