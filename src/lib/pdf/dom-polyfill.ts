/**
 * Minimal `DOMMatrix` / `Path2D` polyfill for Node runtimes that lack them.
 *
 * WHY THIS EXISTS: pdf.js evaluates `new DOMMatrix()` at module top level. In
 * Node it polyfills that global from `@napi-rs/canvas` — an *optional*
 * dependency reached through `createRequire`, which static bundlers cannot
 * see. When the bundle omits it (as Vercel's tracing did), importing pdf.js
 * throws "DOMMatrix is not defined" and every request 500s, even though the
 * package is present in local development. next.config.ts now traces it
 * explicitly; this module is the belt to that braces, so a tracing regression
 * degrades nothing rather than taking the endpoint down.
 *
 * SCOPE: this codebase reads PDF *structure* only — tag tree, text, operator
 * list, annotations, metadata. It never calls `page.render()`, so no
 * rasterization path is exercised. The matrix math below is nonetheless a
 * correct 2D affine implementation rather than a stub, so that if pdf.js ever
 * does consult it the answers are right instead of silently wrong. `Path2D`
 * genuinely is a no-op shell: it exists purely to satisfy construction, and
 * only rendering ever reads back from it.
 */

/** Correct 2D affine matrix: [a c e; b d f; 0 0 1]. */
class DOMMatrixPolyfill {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: number[] | string | DOMMatrixPolyfill) {
    if (Array.isArray(init)) {
      // A 6-element array is the affine form; anything shorter is ignored and
      // leaves the identity, matching how the DOM constructor treats a
      // malformed sequence rather than half-applying it.
      if (init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init as [
          number, number, number, number, number, number,
        ];
      }
    } else if (init && typeof init === "object") {
      this.a = init.a;
      this.b = init.b;
      this.c = init.c;
      this.d = init.d;
      this.e = init.e;
      this.f = init.f;
    }
  }

  get isIdentity(): boolean {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
  }

  private set(a: number, b: number, c: number, d: number, e: number, f: number): this {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }

  /** `this = this × other` (other applied first, as the DOM spec defines). */
  multiplySelf(other: DOMMatrixPolyfill): this {
    return this.set(
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.e + this.c * other.f + this.e,
      this.b * other.e + this.d * other.f + this.f
    );
  }

  /** `this = other × this`. */
  preMultiplySelf(other: DOMMatrixPolyfill): this {
    return this.set(
      other.a * this.a + other.c * this.b,
      other.b * this.a + other.d * this.b,
      other.a * this.c + other.c * this.d,
      other.b * this.c + other.d * this.d,
      other.a * this.e + other.c * this.f + other.e,
      other.b * this.e + other.d * this.f + other.f
    );
  }

  multiply(other: DOMMatrixPolyfill): DOMMatrixPolyfill {
    return new DOMMatrixPolyfill(this).multiplySelf(other);
  }

  translateSelf(tx = 0, ty = 0): this {
    this.e += this.a * tx + this.c * ty;
    this.f += this.b * tx + this.d * ty;
    return this;
  }

  translate(tx = 0, ty = 0): DOMMatrixPolyfill {
    return new DOMMatrixPolyfill(this).translateSelf(tx, ty);
  }

  scaleSelf(sx = 1, sy?: number): this {
    const scaleY = sy ?? sx;
    this.a *= sx;
    this.b *= sx;
    this.c *= scaleY;
    this.d *= scaleY;
    return this;
  }

  scale(sx = 1, sy?: number): DOMMatrixPolyfill {
    return new DOMMatrixPolyfill(this).scaleSelf(sx, sy);
  }

  invertSelf(): this {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) {
      // The spec marks a non-invertible matrix by setting every component to
      // NaN, rather than throwing.
      return this.set(NaN, NaN, NaN, NaN, NaN, NaN);
    }
    return this.set(
      this.d / det,
      -this.b / det,
      -this.c / det,
      this.a / det,
      (this.c * this.f - this.d * this.e) / det,
      (this.b * this.e - this.a * this.f) / det
    );
  }

  inverse(): DOMMatrixPolyfill {
    return new DOMMatrixPolyfill(this).invertSelf();
  }

  transformPoint(point: { x?: number; y?: number } = {}): { x: number; y: number; z: number; w: number } {
    const x = point.x ?? 0;
    const y = point.y ?? 0;
    return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 };
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }
}

/** Rendering-only surface. Nothing in this codebase reads back from it. */
class Path2DPolyfill {
  addPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  arc(): void {}
  arcTo(): void {}
  ellipse(): void {}
  rect(): void {}
  roundRect(): void {}
}

/**
 * Install the polyfills, but only where the runtime (or @napi-rs/canvas)
 * hasn't already provided a real implementation. Safe to call repeatedly.
 */
export function ensurePdfDomGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  if (!g.DOMMatrix) g.DOMMatrix = DOMMatrixPolyfill;
  if (!g.Path2D) g.Path2D = Path2DPolyfill;
}

export { DOMMatrixPolyfill, Path2DPolyfill };
