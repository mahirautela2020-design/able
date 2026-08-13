// APCA (Accessible Perceptual Contrast Algorithm) — an alternative, more
// perceptually-accurate contrast model than the WCAG 2.x ratio in contrast.ts.
// It is the contrast metric proposed for WCAG 3.0 but is NOT a WCAG 2.2
// requirement today. This implementation follows the published APCA-W3
// "bridge" formula (polarity-aware, soft black-clamp, low-contrast smoothing).
//
// Honest limitation (same posture as cvd.ts): treat the output as an
// INFORMATIONAL perceptual-contrast estimate, not a certified score. WCAG 2.x
// `contrastVerdict` (contrast.ts) remains the enforced AA/AAA pass/fail line
// for findings — APCA is presented alongside it, never in place of it.

import { hexToRgb, normalizeColor } from "./contrast";

// Published APCA-W3 constants (0.1.9 / "0.98G" bridge formula).
const MAIN_TRC = 2.4;
const S_RCO = 0.2126729;
const S_GCO = 0.7151522;
const S_BCO = 0.072175;

const NORM_BG = 0.56;
const NORM_TXT = 0.57;
const REV_TXT = 0.62;
const REV_BG = 0.65;

const BLK_THRS = 0.022;
const BLK_CLMP = 1.414;
const SCALE_BOW = 1.14;
const SCALE_WOB = 1.14;
const LO_BOW_OFFSET = 0.027;
const LO_WOB_OFFSET = 0.027;
const LO_CLIP = 0.001;
const DELTA_Y_MIN = 0.0005;

function srgbToY(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const chan = (v: number) => Math.pow(v / 255, MAIN_TRC);
  return S_RCO * chan(r) + S_GCO * chan(g) + S_BCO * chan(b);
}

function clampBlack(y: number): number {
  return y > BLK_THRS ? y : y + Math.pow(BLK_THRS - y, BLK_CLMP);
}

/**
 * Signed APCA lightness contrast (Lc), roughly -108..107.
 * Positive Lc = dark text on a light background ("normal polarity").
 * Negative Lc = light text on a dark background ("reverse polarity").
 * Magnitude is what matters for readability; sign only encodes polarity.
 */
export function apcaContrast(textHex: string, bgHex: string): number {
  const yTxt = clampBlack(srgbToY(normalizeColor(textHex)));
  const yBg = clampBlack(srgbToY(normalizeColor(bgHex)));

  if (Math.abs(yBg - yTxt) < DELTA_Y_MIN) return 0;

  let sapc: number;
  if (yBg > yTxt) {
    // Normal polarity: dark text on light background.
    sapc = (Math.pow(yBg, NORM_BG) - Math.pow(yTxt, NORM_TXT)) * SCALE_BOW;
    if (sapc < LO_CLIP) return 0;
    return (sapc - LO_BOW_OFFSET) * 100;
  }
  // Reverse polarity: light text on dark background.
  sapc = (Math.pow(yBg, REV_BG) - Math.pow(yTxt, REV_TXT)) * SCALE_WOB;
  if (sapc > -LO_CLIP) return 0;
  return (sapc + LO_WOB_OFFSET) * 100;
}

export type ApcaBand = "high" | "medium" | "low" | "insufficient";

/**
 * Informational banding only — APCA has no single official pass/fail line
 * comparable to WCAG 2.x's 4.5:1 (its recommended minimums vary by font
 * size/weight). These bands are a rough, conservative reading aid, not a
 * certified threshold.
 */
export function apcaBand(lc: number): ApcaBand {
  const mag = Math.abs(lc);
  if (mag >= 75) return "high";
  if (mag >= 60) return "medium";
  if (mag >= 30) return "low";
  return "insufficient";
}
