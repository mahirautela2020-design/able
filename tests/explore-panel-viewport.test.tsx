import { describe, it, expect, vi } from "vitest";
import { measureIframeViewport } from "@/components/workbench/explore/explore-panel";

describe("measureIframeViewport (regression: ContrastFix's viewport prop was never wired from a real caller)", () => {
  it("returns the iframe's rendered box size, rounded", () => {
    const iframe = document.createElement("iframe");
    vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue({
      width: 899.6,
      height: 611.2,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 899.6,
      bottom: 611.2,
      toJSON: () => ({}),
    });

    expect(measureIframeViewport(iframe)).toEqual({ width: 900, height: 611 });
  });

  it("returns null for a null iframe ref", () => {
    expect(measureIframeViewport(null)).toBeNull();
  });

  it("returns null when the iframe hasn't been laid out yet (zero size)", () => {
    const iframe = document.createElement("iframe");
    vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue({
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON: () => ({}),
    });

    expect(measureIframeViewport(iframe)).toBeNull();
  });
});
