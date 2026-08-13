import { contrastRatio } from "@/lib/audit/color-math";

/**
 * Deterministic dynamic checks on the parsed uiautomator hierarchy.
 *
 * GUARDRAILS (ENTERPRISE_SPEC §2): every finding here is MEASURED from the
 * live screen — node bounds, empty name/role/value, and pixel contrast. No
 * LLM is in this path; all finding text is templated from measured values.
 */

export type Bounds = [left: number, top: number, right: number, bottom: number];

export interface UiNode {
  className: string;
  contentDesc: string;
  text: string;
  /** [left, top, right, bottom] in screen pixels (as emitted by uiautomator). */
  bounds: Bounds;
  clickable: boolean;
}

/** Decoded screenshot pixels for contrast sampling (RGB24, row-major). */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface DynamicFinding {
  ruleId: string;
  ruleTitle: string;
  wcagCriterion: string;
  wcagLevel: string;
  principle: string;
  severity: "serious" | "moderate" | "minor";
  confidence: number;
  /** "violation" for engine-proven issues, "needs_review" for heuristic ones. */
  bucket: "violation" | "needs_review";
  sourceEngines: string[];
  selector: string;
  elementHtml: string;
  failureSummary: string;
  bbox: { x: number; y: number; width: number; height: number } | null;
  evidence: Record<string, unknown>;
}

/** Default density (xxhdpi) assumed when the device density can't be read. */
export const DEFAULT_DENSITY_DPI = 420;

/** Convert device-independent px (dp) to raw screen px at a given density. */
export function dpToPx(dp: number, densityDpi: number): number {
  return dp * (densityDpi / 160);
}

/** Convert raw screen px to device-independent px (dp). */
export function pxToDp(px: number, densityDpi: number): number {
  return px / (densityDpi / 160);
}

function nodeSelector(node: UiNode): string {
  return node.className
    ? `//node[@class="${node.className}"]`
    : "//node";
}

function nodeHtml(node: UiNode): string {
  return `<node class="${node.className}" bounds="[${node.bounds[0]},${node.bounds[1]}][${node.bounds[2]},${node.bounds[3]}]">`;
}

function nodeBbox(node: UiNode): { x: number; y: number; width: number; height: number } {
  const [l, t, r, b] = node.bounds;
  return { x: l, y: t, width: r - l, height: b - t };
}

/**
 * 4.1.2 Name, Role, Value — a clickable node with no content-desc AND no text
 * is announced by TalkBack as nothing (or only its class), so the user cannot
 * identify the control. Measured fact → "violation".
 */
export function checkLabels(nodes: UiNode[]): DynamicFinding[] {
  const findings: DynamicFinding[] = [];

  for (const node of nodes) {
    if (!node.clickable) continue;
    if (node.contentDesc.trim() !== "") continue;
    if (node.text.trim() !== "") continue;

    findings.push({
      ruleId: "android-dynamic-label",
      ruleTitle: "Name, Role, Value",
      wcagCriterion: "4.1.2",
      wcagLevel: "A",
      principle: "Robust",
      severity: "serious",
      confidence: 1,
      bucket: "violation",
      sourceEngines: ["dynamic"],
      selector: nodeSelector(node),
      elementHtml: nodeHtml(node),
      failureSummary: `Clickable node has no content-desc and no text — TalkBack will not announce a name/role/value`,
      bbox: nodeBbox(node),
      evidence: { bounds: node.bounds, className: node.className, contentDesc: "", text: "" },
    });
  }

  return findings;
}

/**
 * 2.5.8 Target Size (Minimum) — interactive bounds smaller than 24x24 dp are
 * flagged needs_review (size depends on density conversion; if density is
 * assumed, the exact size is uncertain → never a hard violation).
 */
export function checkTouchTargets(
  nodes: UiNode[],
  densityDpi: number
): DynamicFinding[] {
  const findings: DynamicFinding[] = [];
  const dpi = densityDpi > 0 ? densityDpi : DEFAULT_DENSITY_DPI;

  for (const node of nodes) {
    if (!node.clickable) continue;

    const [l, t, r, b] = node.bounds;
    const widthDp = pxToDp(r - l, dpi);
    const heightDp = pxToDp(b - t, dpi);

    if (widthDp >= 24 && heightDp >= 24) continue;

    findings.push({
      ruleId: "android-dynamic-touch-target",
      ruleTitle: "Target Size (Minimum)",
      wcagCriterion: "2.5.8",
      wcagLevel: "AA",
      principle: "Operable",
      severity: "moderate",
      confidence: 0.8,
      bucket: "needs_review",
      sourceEngines: ["dynamic"],
      selector: nodeSelector(node),
      elementHtml: nodeHtml(node),
      failureSummary: `Interactive target is ${widthDp.toFixed(1)}x${heightDp.toFixed(1)}dp — below the 24x24dp minimum (bounds ${l},${t}-${r},${b}px @${dpi}dpi)`,
      bbox: nodeBbox(node),
      evidence: {
        bounds: node.bounds,
        densityDpi: dpi,
        widthDp: Number(widthDp.toFixed(1)),
        heightDp: Number(heightDp.toFixed(1)),
      },
    });
  }

  return findings;
}

/** Read one RGB pixel at (x, y), clamped into bounds. Returns null on empty input. */
function pixelAt(pixels: Pixels, x: number, y: number): [number, number, number] | null {
  const cx = Math.max(0, Math.min(pixels.width - 1, x));
  const cy = Math.max(0, Math.min(pixels.height - 1, y));
  const idx = (cy * pixels.width + cx) * 3;
  return [pixels.data[idx]!, pixels.data[idx + 1]!, pixels.data[idx + 2]!];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Sample the foreground (center of the node bounds) vs background (just above
 * the top edge, falling back below / to the corner) and return the WCAG
 * contrast ratio, or null when sampling is not possible.
 */
export function sampleRegionContrast(
  pixels: Pixels,
  bounds: Bounds
): number | null {
  if (!pixels || pixels.width < 1 || pixels.height < 1 || pixels.data.length === 0) {
    return null;
  }

  const [l, t, r, b] = bounds;
  const cx = Math.floor((l + r) / 2);
  const cy = Math.floor((t + b) / 2);

  const fg = pixelAt(pixels, cx, cy);
  if (!fg) return null;

  // Prefer a sample just outside the top edge; fall back to below, then corner.
  let by = t - 2;
  if (by < 0) by = b + 2;
  if (by >= pixels.height) by = pixels.height - 1;
  const bg = pixelAt(pixels, cx, by);
  if (!bg) return null;

  return contrastRatio(rgbToHex(fg), rgbToHex(bg));
}

/**
 * 1.4.3 Contrast (Minimum) — sample text-node pixels from the live screenshot.
 * Screenshot contrast is HEURISTIC (no exact text/background mask), so every
 * result lands in needs_review — never a hard violation. Severity reflects the
 * measured ratio.
 */
export function checkContrast(
  nodes: UiNode[],
  screenshot: Pixels | null
): DynamicFinding[] {
  const findings: DynamicFinding[] = [];
  if (!screenshot) return findings;

  for (const node of nodes) {
    // Only text-bearing nodes carry a measurable foreground.
    if (node.text.trim() === "") continue;

    const ratio = sampleRegionContrast(screenshot, node.bounds);
    if (ratio === null) continue;
    if (ratio >= 7) continue; // passes AA + AAA; nothing to report

    const severity: DynamicFinding["severity"] = ratio < 4.5 ? "serious" : "moderate";

    findings.push({
      ruleId: "android-dynamic-contrast",
      ruleTitle: "Contrast (Minimum)",
      wcagCriterion: "1.4.3",
      wcagLevel: "AA",
      principle: "Perceivable",
      severity,
      confidence: 0.6,
      bucket: "needs_review",
      sourceEngines: ["dynamic"],
      selector: nodeSelector(node),
      elementHtml: nodeHtml(node),
      failureSummary: `Measured contrast ratio ${ratio.toFixed(2)}:1 for text "${node.text.slice(0, 40)}" — below the ${ratio < 4.5 ? "4.5:1 AA minimum" : "7:1 AAA level"} (screenshot sample; needs manual review)`,
      bbox: nodeBbox(node),
      evidence: { ratio: Number(ratio.toFixed(2)), bounds: node.bounds, text: node.text.slice(0, 40) },
    });
  }

  return findings;
}
