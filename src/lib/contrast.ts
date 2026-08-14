// WCAG 2.2 contrast math. Pure functions, no I/O — unit-testable in jsdom.
// Relative luminance and contrast ratio follow the WCAG 2.x definition.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface ContrastVerdict {
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
  requiredAA: number;
  requiredAAA: number;
  level: "AAA" | "AA" | "fail";
}

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;
const AAA_NORMAL = 7.0;
const AAA_LARGE = 4.5;
const NON_TEXT_MINIMUM = 3.0;

/** The WCAG-required ratio for a given level + text size — the four
 * constants above, exposed so callers (e.g. the Contrast Lab's AA/AAA +
 * normal/large target selector) don't have to duplicate the threshold
 * table.
 *
 * `hasText` defaults to true (the common case: 1.4.3/1.4.6 text contrast).
 * WCAG 1.4.11 (non-text/UI-component contrast) has a single flat 3:1
 * requirement with no AA/AAA tier and no large-text variant — passing
 * `hasText: false` returns that flat floor regardless of `level`/`largeText`,
 * so a non-text element isn't held to the stricter text thresholds (which
 * would report a real 1.4.11 pass as a fabricated failure). */
export function requiredContrastRatio(
  level: "AA" | "AAA",
  largeText: boolean,
  hasText = true
): number {
  if (!hasText) return NON_TEXT_MINIMUM;
  if (level === "AAA") return largeText ? AAA_LARGE : AAA_NORMAL;
  return largeText ? AA_LARGE : AA_NORMAL;
}

export function hexToRgb(hex: string): Rgb {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Normalize any CSS color string (hex, rgb(), rgba()) into a canonical
// 6-digit lowercase hex. Throws on unparseable input.
export function normalizeColor(input: string): string {
  const s = input.trim().toLowerCase();
  if (s.startsWith("#")) {
    return rgbToHex(hexToRgb(s));
  }
  const m = s.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*[\d.]+\s*)?\)$/);
  if (m) {
    return rgbToHex({
      r: Math.round(parseFloat(m[1])),
      g: Math.round(parseFloat(m[2])),
      b: Math.round(parseFloat(m[3])),
    });
  }
  throw new Error(`Invalid color: ${input}`);
}

export function rgbToHex(rgb: Rgb): string {
  const clamp = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  const to2 = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`;
}

export function relativeLuminance(rgb: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(rgb.r) +
    0.7152 * channel(rgb.g) +
    0.0722 * channel(rgb.b)
  );
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(hexToRgb(normalizeColor(fg)));
  const l2 = relativeLuminance(hexToRgb(normalizeColor(bg)));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastVerdict(
  ratio: number,
  largeText = false
): ContrastVerdict {
  const requiredAA = largeText ? AA_LARGE : AA_NORMAL;
  const requiredAAA = largeText ? AAA_LARGE : AAA_NORMAL;
  const passesAA = ratio >= requiredAA;
  const passesAAA = ratio >= requiredAAA;
  const level: ContrastVerdict["level"] = passesAAA
    ? "AAA"
    : passesAA
      ? "AA"
      : "fail";
  return { ratio, passesAA, passesAAA, requiredAA, requiredAAA, level };
}

// Suggest a foreground color that meets `target` (default AA 4.5:1) against
// `bg`, moving the foreground AWAY from the background in luminance only.
// Returns the new hex and the resulting ratio. Deterministic binary search.
export function suggestFix(
  fg: string,
  bg: string,
  target = AA_NORMAL
): { fg: string; bg: string; ratio: number } {
  const fgHex = normalizeColor(fg);
  const bgHex = normalizeColor(bg);
  const fgRgb = hexToRgb(fgHex);
  // Move the foreground AWAY from the background in luminance: if the text is
  // darker than its background, darken it further (toward black); otherwise
  // lighten it (toward white).
  const darken = relativeLuminance(fgRgb) < relativeLuminance(hexToRgb(bgHex));
  const anchor = darken ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const candidate = lerpRgb(fgRgb, anchor, mid);
    const ratio = contrastRatio(rgbToHex(candidate), bgHex);
    if (ratio < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const fixed = lerpRgb(fgRgb, anchor, hi);
  const fixedHex = rgbToHex(fixed);
  return { fg: fixedHex, bg: bgHex, ratio: contrastRatio(fixedHex, bgHex) };
}

function lerpRgb(from: Rgb, to: Rgb, t: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  };
}
