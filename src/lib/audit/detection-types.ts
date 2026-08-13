/**
 * Shared types for deterministic UI element detection (P8).
 *
 * `DetectedElement` is the shape emitted by `scripts/detect-elements.py`;
 * `DetectionFinding` is the bucket-carrying finding shape produced by the
 * deterministic checks (touch-target 2.5.8, icon non-text contrast 1.4.11).
 */

export interface DetectedElement {
  label: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  class: string;
}

export interface DetectionFinding {
  ruleId: string;
  ruleTitle: string;
  wcagCriterion: string;
  wcagLevel: string;
  principle: string;
  severity: "critical" | "serious" | "moderate" | "minor";
  confidence: number;
  /** "violation" for measured (deterministic) failures, "needs_review" otherwise. */
  bucket: "violation" | "needs_review";
  sourceEngines: string[];
  selector: string | null;
  elementHtml: string | null;
  failureSummary: string;
  bbox: { x: number; y: number; width: number; height: number } | null;
  evidence: Record<string, unknown>;
}

/** Element classes that can receive pointer interaction (for 2.5.8). */
export const INTERACTIVE_CLASSES = new Set([
  "button",
  "input",
  "checkbox",
  "radio",
  "link",
]);
