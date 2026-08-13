import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { checkIconContrast } from "@/lib/audit/icon-contrast";
import type { DetectedElement } from "@/lib/audit/detection-types";

/**
 * Renders a 100×100 PNG: solid background with a solid icon rectangle.
 * The element bbox is aligned to the rectangle so `checkIconContrast` samples
 * the icon border (inner ring) against the adjacent background (outer ring).
 */
async function makeIconImage(
  bgHex: string,
  iconHex: string,
  box: { x: number; y: number; w: number; h: number }
): Promise<Buffer> {
  const svg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="${bgHex}"/>
  <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${iconHex}"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function iconEl(conf = 0.9): DetectedElement {
  return {
    label: "icon",
    confidence: conf,
    bbox: { x: 40, y: 40, w: 20, h: 20 },
    class: "icon",
  };
}

describe("checkIconContrast (WCAG 1.4.11)", () => {
  it("emits a serious violation for icon contrast below 3:1", async () => {
    const buffer = await makeIconImage("#ffffff", "#999999", { x: 40, y: 40, w: 20, h: 20 });
    const findings = await checkIconContrast([iconEl()], buffer);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      bucket: "violation",
      severity: "serious",
      wcagCriterion: "1.4.11",
      ruleId: "non-text-contrast-1.4.11",
    });
    expect(findings[0]!.evidence.contrastRatio).toBeLessThan(3);
  });

  it("flags 3:1–4.5:1 icon contrast as needs_review", async () => {
    // #949494 on white ≈ 3.03:1 (borderline, rounds to 3.0 → needs_review).
    const buffer = await makeIconImage("#ffffff", "#949494", { x: 40, y: 40, w: 20, h: 20 });
    const findings = await checkIconContrast([iconEl()], buffer);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.bucket).toBe("needs_review");
  });

  it("flags 4.4:1 icon contrast as needs_review (below 4.5 recommendation)", async () => {
    // #7a7a7a on white ≈ 4.29:1.
    const buffer = await makeIconImage("#ffffff", "#7a7a7a", { x: 40, y: 40, w: 20, h: 20 });
    const findings = await checkIconContrast([iconEl()], buffer);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.bucket).toBe("needs_review");
  });

  it("emits no finding for high-contrast icons", async () => {
    const buffer = await makeIconImage("#ffffff", "#000000", { x: 40, y: 40, w: 20, h: 20 });
    const findings = await checkIconContrast([iconEl()], buffer);
    expect(findings).toHaveLength(0);
  });

  it("downgrades borderline-confidence icons to needs_review", async () => {
    const buffer = await makeIconImage("#ffffff", "#999999", { x: 40, y: 40, w: 20, h: 20 });
    const findings = await checkIconContrast([iconEl(0.45)], buffer);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.bucket).toBe("needs_review");
  });

  it("ignores non-icon elements", async () => {
    const buffer = await makeIconImage("#ffffff", "#999999", { x: 40, y: 40, w: 20, h: 20 });
    const findings = await checkIconContrast(
      [{ ...iconEl(), class: "button" }],
      buffer
    );
    expect(findings).toHaveLength(0);
  });

  it("returns no findings for an undecodable buffer", async () => {
    const findings = await checkIconContrast([iconEl()], Buffer.from("not-an-image"));
    expect(findings).toHaveLength(0);
  });
});
