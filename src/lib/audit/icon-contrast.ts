import sharp from "sharp";
import { contrastRatio } from "@/lib/audit/color-math";
import type { DetectedElement, DetectionFinding } from "@/lib/audit/detection-types";

/**
 * Deterministic WCAG 1.4.11 (non-text contrast) check on detected icon boxes.
 *
 * Samples the icon's border pixels against the immediately adjacent background
 * (3×3-style median, not a single pixel) to survive JPEG/WebP compression
 * noise, then applies the WCAG ratio. Contrast < 3:1 is a hard violation;
 * 3:1–4.5:1 is flagged needs_review (recommended enhanced contrast).
 */

const MIN_NON_TEXT_RATIO = 3.0;
const RECOMMENDED_NON_TEXT_RATIO = 4.5;

export async function checkIconContrast(
  elements: DetectedElement[],
  screenshotBuffer: Buffer
): Promise<DetectionFinding[]> {
  const icons = elements.filter(
    (el) => el.class === "icon" && el.confidence >= 0.4
  );
  if (icons.length === 0) return [];

  let data: Buffer;
  let width: number;
  let height: number;
  try {
    const decoded = await sharp(screenshotBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    data = decoded.data;
    width = decoded.info.width;
    height = decoded.info.height;
  } catch {
    // Undecodable buffer → no deterministic icon findings (never crash).
    return [];
  }

  const findings: DetectionFinding[] = [];

  for (const el of icons) {
    const bbox = el.bbox;
    const iconColor = medianRegion(data, width, height, bbox, "inner");
    const bgColor = medianRegion(data, width, height, bbox, "outer");
    if (!iconColor || !bgColor) continue;

    const iconHex = rgbToHex(iconColor);
    const bgHex = rgbToHex(bgColor);
    const ratio = contrastRatio(iconHex, bgHex);
    // Round to 1 decimal before thresholding so borderline ratios don't
    // flip a violation on compression noise.
    const rounded = Math.round(ratio * 10) / 10;

    let bucket: DetectionFinding["bucket"];
    let severity: DetectionFinding["severity"];
    let failureSummary: string;

    // Borderline detections (0.4–0.5) are never hard violations.
    const borderline = el.confidence < 0.5;

    if (rounded < MIN_NON_TEXT_RATIO) {
      bucket = borderline ? "needs_review" : "violation";
      severity = borderline ? "moderate" : "serious";
      failureSummary = `${el.label || "icon"} (${iconHex}) has ${rounded.toFixed(1)}:1 contrast against its background (${bgHex}) — below the 3:1 non-text minimum (WCAG 1.4.11)`;
    } else if (rounded < RECOMMENDED_NON_TEXT_RATIO) {
      bucket = "needs_review";
      severity = "moderate";
      failureSummary = `${el.label || "icon"} (${iconHex}) has ${rounded.toFixed(1)}:1 contrast against its background (${bgHex}) — below the 4.5:1 recommended non-text contrast`;
    } else {
      continue;
    }

    findings.push({
      ruleId: "non-text-contrast-1.4.11",
      ruleTitle: "Non-text Contrast",
      wcagCriterion: "1.4.11",
      wcagLevel: "AA",
      principle: "Perceivable",
      severity,
      confidence: el.confidence,
      bucket,
      sourceEngines: ["rule-icon-contrast"],
      selector: null,
      elementHtml: `<icon>${el.label ?? ""}</icon>`,
      failureSummary,
      bbox: { x: bbox.x, y: bbox.y, width: bbox.w, height: bbox.h },
      evidence: {
        class: el.class,
        label: el.label,
        contrastRatio: rounded,
        iconHex,
        bgHex,
      },
    });
  }

  return findings;
}

type Pixel = [number, number, number];

function medianRegion(
  data: Buffer,
  width: number,
  height: number,
  bbox: { x: number; y: number; w: number; h: number },
  mode: "inner" | "outer"
): Pixel | null {
  const samples: Pixel[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = (y * width + x) * 4;
    samples.push([data[idx]!, data[idx + 1]!, data[idx + 2]!]);
  };

  if (mode === "inner") {
    // 1px border ring inside the bbox.
    const x0 = Math.max(0, Math.floor(bbox.x));
    const y0 = Math.max(0, Math.floor(bbox.y));
    const x1 = Math.min(width - 1, Math.ceil(bbox.x + bbox.w) - 1);
    const y1 = Math.min(height - 1, Math.ceil(bbox.y + bbox.h) - 1);
    for (let x = x0; x <= x1; x++) {
      push(x, y0);
      push(x, y1);
    }
    for (let y = y0; y <= y1; y++) {
      push(x0, y);
      push(x1, y);
    }
  } else {
    // 2px ring immediately outside the bbox (background).
    const x0 = Math.floor(bbox.x) - 2;
    const y0 = Math.floor(bbox.y) - 2;
    const x1 = Math.ceil(bbox.x + bbox.w) + 1;
    const y1 = Math.ceil(bbox.y + bbox.h) + 1;
    const bx0 = Math.floor(bbox.x);
    const by0 = Math.floor(bbox.y);
    const bx1 = Math.ceil(bbox.x + bbox.w) - 1;
    const by1 = Math.ceil(bbox.y + bbox.h) - 1;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (x >= bx0 && x <= bx1 && y >= by0 && y <= by1) continue;
        push(x, y);
      }
    }
  }

  if (samples.length === 0) return null;
  return medianColor(samples);
}

function medianColor(samples: Pixel[]): Pixel {
  const r = samples.map((s) => s[0]).sort((a, b) => a - b);
  const g = samples.map((s) => s[1]).sort((a, b) => a - b);
  const b = samples.map((s) => s[2]).sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return [r[mid]!, g[mid]!, b[mid]!];
}

function rgbToHex([r, g, b]: Pixel): string {
  const to = (v: number) => v.toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
