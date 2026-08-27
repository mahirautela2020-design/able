import { describe, it, expect } from "vitest";
import { DOMMatrixPolyfill, ensurePdfDomGlobals } from "@/lib/pdf/dom-polyfill";

/**
 * The polyfill only stands in for a real DOMMatrix when the runtime has none,
 * so it has to be *correct*, not merely constructible — a silently wrong
 * matrix would be worse than a crash.
 */

const components = (m: DOMMatrixPolyfill) => [m.a, m.b, m.c, m.d, m.e, m.f];

describe("DOMMatrixPolyfill", () => {
  it("defaults to the identity matrix", () => {
    const m = new DOMMatrixPolyfill();
    expect(components(m)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(m.isIdentity).toBe(true);
  });

  it("constructs from a 6-element array", () => {
    expect(components(new DOMMatrixPolyfill([2, 3, 4, 5, 6, 7]))).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("copies from another matrix without aliasing it", () => {
    const source = new DOMMatrixPolyfill([2, 0, 0, 2, 5, 5]);
    const copy = new DOMMatrixPolyfill(source);
    copy.translateSelf(10, 10);
    expect(components(source)).toEqual([2, 0, 0, 2, 5, 5]);
  });

  it("multiplies in the spec's order (argument applied first)", () => {
    // Scale by 2, then translate by (10, 20): the translation is scaled.
    const scale = new DOMMatrixPolyfill([2, 0, 0, 2, 0, 0]);
    const translate = new DOMMatrixPolyfill([1, 0, 0, 1, 10, 20]);
    expect(components(scale.multiply(translate))).toEqual([2, 0, 0, 2, 20, 40]);
  });

  it("preMultiplySelf applies the argument last", () => {
    const m = new DOMMatrixPolyfill([2, 0, 0, 2, 0, 0]);
    m.preMultiplySelf(new DOMMatrixPolyfill([1, 0, 0, 1, 10, 20]));
    // Translation is applied after scaling, so it is not scaled.
    expect(components(m)).toEqual([2, 0, 0, 2, 10, 20]);
  });

  it("translates and scales relative to the current basis", () => {
    expect(components(new DOMMatrixPolyfill([2, 0, 0, 2, 0, 0]).translate(3, 4))).toEqual([
      2, 0, 0, 2, 6, 8,
    ]);
    expect(components(new DOMMatrixPolyfill().scale(3, 4))).toEqual([3, 0, 0, 4, 0, 0]);
    // A single argument scales both axes.
    expect(components(new DOMMatrixPolyfill().scale(3))).toEqual([3, 0, 0, 3, 0, 0]);
  });

  it("inverts such that m × m⁻¹ is the identity", () => {
    const m = new DOMMatrixPolyfill([2, 1, 1, 3, 5, 7]);
    const product = m.multiply(m.inverse());
    for (const [actual, expected] of [
      [product.a, 1], [product.b, 0], [product.c, 0],
      [product.d, 1], [product.e, 0], [product.f, 0],
    ]) {
      expect(actual).toBeCloseTo(expected, 10);
    }
  });

  it("marks a singular matrix as NaN rather than throwing", () => {
    const singular = new DOMMatrixPolyfill([1, 2, 2, 4, 0, 0]).inverse();
    expect(components(singular).every(Number.isNaN)).toBe(true);
  });

  it("transforms a point through the full affine transform", () => {
    const point = new DOMMatrixPolyfill([2, 0, 0, 3, 10, 20]).transformPoint({ x: 1, y: 1 });
    expect([point.x, point.y]).toEqual([12, 23]);
  });
});

describe("ensurePdfDomGlobals", () => {
  it("installs the globals pdf.js needs and is idempotent", () => {
    ensurePdfDomGlobals();
    const g = globalThis as Record<string, unknown>;
    expect(typeof g.DOMMatrix).toBe("function");
    expect(typeof g.Path2D).toBe("function");

    const first = g.DOMMatrix;
    ensurePdfDomGlobals();
    // A real implementation already present must never be replaced.
    expect(g.DOMMatrix).toBe(first);
  });
});
