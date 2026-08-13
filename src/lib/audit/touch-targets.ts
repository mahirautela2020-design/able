import type { DetectedElement, DetectionFinding } from "@/lib/audit/detection-types";
import { INTERACTIVE_CLASSES } from "@/lib/audit/detection-types";

/**
 * Deterministic WCAG 2.5.8 (target size minimum) check on detected elements.
 *
 * Pure math — no model calls. Bounding boxes arrive in device pixels; they are
 * converted to CSS pixels via `devicePixelRatio`. A target is a hard violation
 * when either dimension is below the 24 CSS px minimum, and a recommendation
 * (needs_review) when below the 44 CSS px AAA target or too close to a
 * neighbouring target.
 */

const HARD_MIN_PX = 24;
const RECOMMENDED_PX = 44;
const MIN_GAP_PX = 8;

export function checkTouchTargets(
  elements: DetectedElement[],
  devicePixelRatio = 1
): DetectionFinding[] {
  const findings: DetectionFinding[] = [];
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;

  const interactive = elements.filter(
    (el) => INTERACTIVE_CLASSES.has(el.class) && el.confidence >= 0.4
  );

  const css = interactive.map((el) => ({
    el,
    x: el.bbox.x / dpr,
    y: el.bbox.y / dpr,
    w: el.bbox.w / dpr,
    h: el.bbox.h / dpr,
  }));

  for (const item of css) {
    const { el, w, h } = item;
    // Borderline detections (0.4–0.5) are never hard violations.
    const borderline = el.confidence < 0.5;
    const belowHard = w < HARD_MIN_PX || h < HARD_MIN_PX;
    const belowRecommended =
      !belowHard && (w < RECOMMENDED_PX || h < RECOMMENDED_PX);

    if (belowHard) {
      findings.push(
        makeFinding(
          el,
          borderline ? "needs_review" : "violation",
          borderline ? "moderate" : "critical",
          `${el.label || el.class} target is ${round1(w)}×${round1(h)} CSS px — below the 24×24 minimum (WCAG 2.5.8)`,
          { widthCss: round1(w), heightCss: round1(h), thresholdPx: HARD_MIN_PX }
        )
      );
    } else if (belowRecommended) {
      findings.push(
        makeFinding(
          el,
          "needs_review",
          "moderate",
          `${el.label || el.class} target is ${round1(w)}×${round1(h)} CSS px — below the 44×44 recommended size`,
          { widthCss: round1(w), heightCss: round1(h), thresholdPx: RECOMMENDED_PX }
        )
      );
    }
  }

  // Adjacent interactive targets closer than 8 CSS px are hard to hit
  // reliably (overlap risk) → needs_review.
  for (let i = 0; i < css.length; i++) {
    for (let j = i + 1; j < css.length; j++) {
      const gap = rectGap(css[i]!, css[j]!);
      if (gap < MIN_GAP_PX) {
        findings.push(
          makeFinding(
            css[i]!.el,
            "needs_review",
            "moderate",
            `${css[i]!.el.label || css[i]!.el.class} and ${css[j]!.el.label || css[j]!.el.class} are ${round1(gap)} CSS px apart — below the 8px minimum separation`,
            {
              otherLabel: css[j]!.el.label,
              otherClass: css[j]!.el.class,
              gapCss: round1(gap),
            }
          )
        );
      }
    }
  }

  return findings;
}

function makeFinding(
  el: DetectedElement,
  bucket: DetectionFinding["bucket"],
  severity: DetectionFinding["severity"],
  failureSummary: string,
  evidence: Record<string, unknown>
): DetectionFinding {
  return {
    ruleId: "touch-target-2.5.8",
    ruleTitle: "Target Size (Minimum)",
    wcagCriterion: "2.5.8",
    wcagLevel: "AA",
    principle: "Operable",
    severity,
    confidence: el.confidence,
    bucket,
    sourceEngines: ["rule-touch-target"],
    selector: null,
    elementHtml: `<${el.class}>${el.label ?? ""}</${el.class}>`,
    failureSummary,
    bbox: { x: el.bbox.x, y: el.bbox.y, width: el.bbox.w, height: el.bbox.h },
    evidence: { class: el.class, label: el.label, ...evidence },
  };
}

/** Minimum gap between two axis-aligned rectangles (0 when overlapping). */
function rectGap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;

  const xOverlap = Math.min(ax2, bx2) - Math.max(a.x, b.x);
  const yOverlap = Math.min(ay2, by2) - Math.max(a.y, b.y);

  if (xOverlap >= 0 && yOverlap >= 0) return 0;
  if (xOverlap >= 0) return -yOverlap;
  if (yOverlap >= 0) return -xOverlap;
  return Math.hypot(-xOverlap, -yOverlap);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
