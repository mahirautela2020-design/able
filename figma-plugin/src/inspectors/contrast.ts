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

    findings.push({
      bucket: "automated",
      rule_id: "figma-text-contrast",
      rule_title: "Text has insufficient contrast against its background",
      wcag_criteria: ["1.4.3"],
      wcag_criterion: "1.4.3",
      wcag_level: "AA",
      principle: extractPrinciple("1.4.3"),
      severity: verdict.ratio < verdict.requiredAA * 0.7 ? "serious" : "moderate",
      confidence: 0.9,
      source_engines: ["figma-plugin"],
      selector: node.id,
      element_html: node.name,
      failure_summary: `Contrast is ${verdict.ratio.toFixed(2)}:1 against a ${verdict.requiredAA}:1 minimum for ${large ? "large" : "normal-size"} text. Darken the text or lighten the background (or vice versa) until it clears ${verdict.requiredAA}:1.`,
      additional_instances: 0,
      bbox: null,
      evidence: { fg, bg, large, ratio: verdict.ratio },
      engine_version: null,
    });
  }
  return findings;
}
