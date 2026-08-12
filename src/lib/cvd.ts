// Color-vision-deficiency simulation. Applies the standard protanopia /
// deuteranopia / tritanopia / achromatopsia linear-RGB matrices to a hex color
// and can flag contrast pairs that pass normally but fail under a simulation.
//
// Honest limitation (per P1 risks): these matrices are an approximation, not a
// medical-grade model. The UI must label results "simulated — verify with real
// users" and never emit a WCAG pass/fail verdict from CVD alone.

import { hexToRgb, rgbToHex, contrastRatio } from "./contrast";

export type CvdType =
  | "protanopia"
  | "deuteranopia"
  | "tritanopia"
  | "achromatopsia";

export const CVD_TYPES: CvdType[] = [
  "protanopia",
  "deuteranopia",
  "tritanopia",
  "achromatopsia",
];

export const CVD_LABELS: Record<CvdType, string> = {
  protanopia: "Protanopia (red-blind)",
  deuteranopia: "Deuteranopia (green-blind)",
  tritanopia: "Tritanopia (blue-blind)",
  achromatopsia: "Achromatopsia (no color)",
};

// Approximate viewport overlays (CSS filters). These are visual approximations
// only — the accurate math is in `simulateCvd`. The UI labels them as such.
export const CVD_FILTERS: Record<CvdType, string> = {
  protanopia: "saturate(0.8) hue-rotate(-12deg)",
  deuteranopia: "saturate(0.7)",
  tritanopia: "saturate(0.8) hue-rotate(30deg)",
  achromatopsia: "grayscale(1)",
};

type Matrix = [number, number, number][];

const MATRICES: Record<CvdType, Matrix> = {
  protanopia: [
    [0.5667, 0.4333, 0],
    [0.5583, 0.4417, 0],
    [0, 0.2417, 0.7583],
  ],
  deuteranopia: [
    [0.625, 0.375, 0],
    [0.7, 0.3, 0],
    [0, 0.3, 0.7],
  ],
  tritanopia: [
    [0.95, 0.05, 0],
    [0, 0.4333, 0.5667],
    [0, 0.475, 0.525],
  ],
  achromatopsia: [
    [0.299, 0.587, 0.114],
    [0.299, 0.587, 0.114],
    [0.299, 0.587, 0.114],
  ],
};

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function simulateCvd(hex: string, type: CvdType): string {
  const { r, g, b } = hexToRgb(hex);
  const lin = [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
  const m = MATRICES[type];

  const out = [0, 1, 2].map((i) => {
    const v =
      m[i][0] * lin[0] + m[i][1] * lin[1] + m[i][2] * lin[2];
    return linearToSrgb(Math.min(1, Math.max(0, v)));
  });

  return rgbToHex({
    r: out[0] * 255,
    g: out[1] * 255,
    b: out[2] * 255,
  });
}

export interface ContrastPair {
  fg: string;
  bg: string;
}

export interface CvdFlag {
  fg: string;
  bg: string;
  type: CvdType;
  normalRatio: number;
  cvdRatio: number;
}

// Flags pairs whose contrast passes normally (>= threshold) but fails under the
// given CVD simulation. Used for WCAG 1.4.1 (Use of Color) human review — never
// a hard 1.4.3 verdict.
export function flagCvdFailures(
  pairs: ContrastPair[],
  type: CvdType,
  threshold = 4.5
): CvdFlag[] {
  const flags: CvdFlag[] = [];
  for (const { fg, bg } of pairs) {
    const normalRatio = contrastRatio(fg, bg);
    if (normalRatio < threshold) continue;
    const cvdRatio = contrastRatio(simulateCvd(fg, type), simulateCvd(bg, type));
    if (cvdRatio < threshold) {
      flags.push({ fg, bg, type, normalRatio, cvdRatio });
    }
  }
  return flags;
}
