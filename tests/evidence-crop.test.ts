import { describe, it, expect } from "vitest";
import { cropRectFor, CROP_PADDING_PX } from "@/engine/evidence-crop";

const IMG_W = 1440;
// A capture that hit the hard cap: the document was taller than this.
const IMG_H = 16_383;

describe("cropRectFor", () => {
  it("pads the finding's box on every side", () => {
    const crop = cropRectFor({ x: 500, y: 800, width: 100, height: 40 }, IMG_W, IMG_H);
    expect(crop).toEqual({
      left: 500 - CROP_PADDING_PX,
      top: 800 - CROP_PADDING_PX,
      width: 100 + CROP_PADDING_PX * 2,
      height: 40 + CROP_PADDING_PX * 2,
    });
  });

  it("rounds float CSS-pixel boxes to integers sharp.extract accepts", () => {
    const crop = cropRectFor(
      { x: 100.4, y: 200.6, width: 50.5, height: 20.2 },
      IMG_W,
      IMG_H
    );
    expect(crop).not.toBeNull();
    for (const v of Object.values(crop!)) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("clamps a box that starts inside the image but runs past its edges", () => {
    const crop = cropRectFor(
      { x: 1400, y: IMG_H - 10, width: 200, height: 400 },
      IMG_W,
      IMG_H
    )!;
    expect(crop.left + crop.width).toBeLessThanOrEqual(IMG_W);
    expect(crop.top + crop.height).toBeLessThanOrEqual(IMG_H);
  });

  it("never produces a negative origin for a box at the very top-left", () => {
    const crop = cropRectFor({ x: 0, y: 0, width: 10, height: 10 }, IMG_W, IMG_H)!;
    expect(crop.left).toBe(0);
    expect(crop.top).toBe(0);
  });

  // The regression this module exists for. Chromium wraps a full-page capture
  // around past ~16384px, so a finding below the cut has NO pixels in the
  // image. The old pipeline clamped it to the last row and cropped anyway,
  // producing a crop of the page's opening content that read as real evidence.
  it("returns null for a finding below the captured region", () => {
    const belowCut = { x: 200, y: 18_313, width: 300, height: 24 };
    expect(cropRectFor(belowCut, IMG_W, IMG_H)).toBeNull();
  });

  it("returns null for a finding to the right of the captured region", () => {
    expect(cropRectFor({ x: 2000, y: 100, width: 50, height: 50 }, IMG_W, IMG_H)).toBeNull();
  });

  it("returns null for a finding scrolled entirely above the image origin", () => {
    expect(cropRectFor({ x: 10, y: -400, width: 50, height: 50 }, IMG_W, IMG_H)).toBeNull();
  });

  it("still crops a finding that straddles the bottom cut", () => {
    const straddling = { x: 10, y: IMG_H - 5, width: 100, height: 60 };
    expect(cropRectFor(straddling, IMG_W, IMG_H)).not.toBeNull();
  });

  it("returns null for a zero-area element", () => {
    expect(cropRectFor({ x: 10, y: 10, width: 0, height: 20 }, IMG_W, IMG_H)).toBeNull();
    expect(cropRectFor({ x: 10, y: 10, width: 20, height: 0 }, IMG_W, IMG_H)).toBeNull();
  });

  it("returns null when the image itself has no area", () => {
    expect(cropRectFor({ x: 0, y: 0, width: 10, height: 10 }, 0, 0)).toBeNull();
  });

  it("does not let padding alone drag an off-image finding into range", () => {
    // 20px past the bottom edge — inside the padding radius, outside the image.
    const justPast = { x: 10, y: IMG_H + 20, width: 40, height: 40 };
    expect(cropRectFor(justPast, IMG_W, IMG_H)).toBeNull();
  });
});
