// APCA-W3 (Accessible Perceptual Contrast Algorithm) — hand-rolled from the
// public APCA-W3 0.1.9 "Bridge" formula. No external dependency (OSS-only /
// zero-paid-API rule). Informational only: WCAG 2.x contrastVerdict
// (src/lib/contrast.ts) remains the enforced pass/fail criterion — APCA is
// not a normative WCAG 2.2 requirement, so this never becomes a hard finding
// gate on its own.
import { hexToRgb, normalizeColor, type Rgb } from "./contrast";

const BLACK_THRESHOLD = 0.022;
const BLACK_CLAMP_EXP = 1.414;
const LOW_CLIP = 0.1;
const DELTA_Y_MIN = 0.0005;

// Normal polarity (dark text on light background).
const NORMAL_BG_EXP = 0.56;
const NORMAL_TEXT_EXP = 0.57;
const NORMAL_SCALE = 1.14;
const NORMAL_OFFSET = 0.027;

// Reverse polarity (light text on dark background).
const REVERSE_BG_EXP = 0.65;
const REVERSE_TEXT_EXP = 0.62;
const REVERSE_SCALE = 1.14;
const REVERSE_OFFSET = 0.027;

/** APCA luminance (Y) — same sRGB->linear transform as WCAG relative
 * luminance, but with APCA's own coefficient precision; deliberately kept
 * separate from contrast.ts's relativeLuminance rather than shared, since
 * the two algorithms are not interchangeable. */
function apcaLuminance(rgb: Rgb): number {
  const channel = (v: number) => (v / 255) ** 2.4;
  return (
    0.2126729 * channel(rgb.r) +
    0.7151522 * channel(rgb.g) +
    0.072175 * channel(rgb.b)
  );
}

function softBlackClamp(y: number): number {
  return y > BLACK_THRESHOLD ? y : y + (BLACK_THRESHOLD - y) ** BLACK_CLAMP_EXP;
}

/**
 * Signed APCA contrast (Lc), range roughly -108..107.
 * Positive = dark text on a lighter background; negative = light text on a
 * darker background. Magnitude, not sign, indicates strength — callers that
 * only care about "how much contrast" should compare |Lc|.
 */
export function apcaContrast(textHex: string, bgHex: string): number {
  const textY = softBlackClamp(apcaLuminance(hexToRgb(normalizeColor(textHex))));
  const bgY = softBlackClamp(apcaLuminance(hexToRgb(normalizeColor(bgHex))));

  if (Math.abs(bgY - textY) < DELTA_Y_MIN) return 0;

  let sapc: number;
  let output: number;

  if (bgY > textY) {
    sapc = (bgY ** NORMAL_BG_EXP - textY ** NORMAL_TEXT_EXP) * NORMAL_SCALE;
    output = sapc < LOW_CLIP ? 0 : sapc - NORMAL_OFFSET;
  } else {
    sapc = (bgY ** REVERSE_BG_EXP - textY ** REVERSE_TEXT_EXP) * REVERSE_SCALE;
    output = sapc > -LOW_CLIP ? 0 : sapc + REVERSE_OFFSET;
  }

  return output * 100;
}

export interface ApcaVerdict {
  lc: number;
  absLc: number;
  label: string;
}

/** Human-readable, informational-only bucketing of an Lc value. Not a
 * pass/fail gate — see the module-level note above. */
export function apcaVerdict(textHex: string, bgHex: string): ApcaVerdict {
  const lc = apcaContrast(textHex, bgHex);
  const absLc = Math.abs(lc);

  let label: string;
  if (absLc >= 90) label = "High contrast";
  else if (absLc >= 60) label = "Strong contrast";
  else if (absLc >= 45) label = "Moderate contrast";
  else if (absLc >= 15) label = "Low contrast";
  else label = "Insufficient contrast";

  return { lc, absLc, label };
}
