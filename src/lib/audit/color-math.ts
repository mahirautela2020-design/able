import Color from "colorjs.io";

/**
 * Shared WCAG color math (relative luminance + contrast ratio).
 * Extracted from image-contrast.ts so deterministic screenshot checks
 * (icon non-text contrast 1.4.11) reuse the exact same formula.
 */

export function relativeLuminance(color: Color): number {
  const coords = color.to("srgb").coords.map((c) => {
    const v = c ?? 0;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * coords[0]! + 0.7152 * coords[1]! + 0.0722 * coords[2]!;
}

export function contrastRatio(color1: string, color2: string): number {
  const c1 = new Color(color1);
  const c2 = new Color(color2);
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
