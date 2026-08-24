import { contrastRatio, contrastVerdict } from "@/lib/contrast";
import { extractPrinciple, type Finding } from "@/engine/finding-mapping";
import { collectNodes, isLargeText, resolveBackgroundColor, resolveFillColor } from "../node-helpers";
import type { FigmaNodeLike } from "../types";

/** WCAG 1.4.3: text-vs-background contrast, using the exact same threshold
 * math (src/lib/contrast.ts) the website and Chrome extension use. Skips
 * text with no evaluable solid fill (mixed fills, gradients, or none) --
 * that's "can't evaluate", not a pass. */
export function checkTextContrast(roots: FigmaNodeLike[]): Finding[] {
  const findings: Finding[] = [];
  for (const node of collectNodes(roots)) {
    if (node.type !== "TEXT" || node.visible === false) continue;
    const fg = resolveFillColor(node.fills);
    if (!fg) continue;
    const bg = resolveBackgroundColor(node);
    const large = isLargeText(node.fontSize, node.fontWeight);
    const ratio = contrastRatio(fg, bg);
    const verdict = contrastVerdict(ratio, large);
    if (verdict.level !== "fail") continue;

    // Mirrors severityFromRatio in src/lib/audit/contrast-finding.ts: a fixed
    // absolute floor, not a threshold relative to the required ratio, so the
    // two independently-evolving contrast inspectors stay in agreement --
    // well below the AA floor is "serious", borderline-below is "moderate".
    const severity = verdict.ratio < 3.0 ? "serious" : "moderate";

    findings.push({
      bucket: "automated",
      rule_id: "figma-text-contrast",
      rule_title: "Text has insufficient contrast against its background",
      wcag_criteria: ["1.4.3"],
      wcag_criterion: "1.4.3",
      wcag_level: "AA",
      principle: extractPrinciple("1.4.3"),
      severity,
      // Deterministic color math against a WCAG threshold, not a heuristic
      // guess -- same convention as the other contrast checks (see
      // src/lib/audit/contrast-finding.ts and src/lib/audit/image-contrast.ts).
      confidence: 1,
      source_engines: ["figma-plugin"],
      selector: node.id,
      element_html: node.name,
      failure_summary: `Contrast is ${verdict.ratio.toFixed(2)}:1 against a ${verdict.requiredAA}:1 minimum for ${large ? "large" : "normal-size"} text. Darken the text or lighten the background (or vice versa) until it clears ${verdict.requiredAA}:1.`,
      additional_instances: 0,
      bbox: null,
      evidence: { fg, bg, large, ratio: verdict.ratio, requiredAA: verdict.requiredAA },
      engine_version: null,
    });
  }
  return findings;
}
