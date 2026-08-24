import { extractPrinciple, type Finding } from "@/engine/finding-mapping";
import { collectNodes } from "../node-helpers";
import type { FigmaNodeLike } from "../types";

const MIN_TOUCH_TARGET = 24;
// Word-bounded so each alternative only matches a whole word/token (real layer
// names are space- or hyphen-separated, e.g. "Icon Button", "close-icon-button",
// "Nav Link"). Without \b these substrings match inside unrelated words --
// "tab" inside "Establish"/"Notable", "link" inside "Blinking" -- producing
// false-positive touch-target findings on non-interactive layers.
// "icon.?button" was dropped: anything it matches also contains "button",
// which the standalone \bbutton\b alternative already catches (verified
// against "close-icon-button" below), so it never fired independently.
const INTERACTIVE_NAME_PATTERN = /\b(button|btn|link|tab|toggle|switch|checkbox|radio|menu.?item)\b/i;
// FRAME is intentionally included alongside INSTANCE/COMPONENT: many design
// files -- especially earlier-stage ones, which are exactly the files most in
// need of an accessibility pass -- build interactive elements (buttons, nav
// links, tabs) as plain auto-layout frames without ever componentizing them.
// Excluding FRAME would silently miss those, a false-negative risk judged
// worse than the false-positive risk, because the name-pattern gate above
// already does the real filtering: an undersized FRAME only gets flagged if
// its name also looks interactive, so generic layout frames ("Card",
// "Section", "Container", ...) are unaffected regardless of FRAME being in
// this set.
const INTERACTIVE_NODE_TYPES = new Set(["INSTANCE", "COMPONENT", "FRAME"]);

/** WCAG 2.5.8: minimum 24x24px target size. There's no reliable way to
 * detect "this is interactive" from a static Figma file other than the
 * layer's name -- the same heuristic a human reviewer uses when scanning a
 * file. confidence is deliberately lower (0.6) than the contrast check's
 * 1.0 to reflect that this is a name-pattern heuristic, not deterministic
 * math.
 *
 * Severity mirrors the established convention in
 * src/lib/audit/touch-targets.ts (the runtime/DOM touch-target check):
 * a target below the 24px hard minimum is "critical" unless the detection
 * itself is borderline-confidence (< 0.5), in which case it's downgraded
 * to "moderate" since the finding itself is uncertain, not just the size.
 * This inspector's confidence is a fixed 0.6 (>= 0.5, never borderline in
 * that sense), so severity is always "critical" here -- there's no
 * equivalent of the runtime check's 44px "recommended" tier or adjacent-gap
 * check, since neither is knowable from name + geometry alone. */
export function checkTouchTargetSize(roots: FigmaNodeLike[]): Finding[] {
  const findings: Finding[] = [];
  for (const node of collectNodes(roots)) {
    if (node.visible === false) continue;
    if (!INTERACTIVE_NODE_TYPES.has(node.type)) continue;
    if (!INTERACTIVE_NAME_PATTERN.test(node.name)) continue;

    const min = Math.min(node.width, node.height);
    if (min <= 0 || min >= MIN_TOUCH_TARGET) continue;

    findings.push({
      bucket: "automated",
      rule_id: "figma-touch-target-size",
      rule_title: "Interactive element is smaller than the minimum touch target size",
      wcag_criteria: ["2.5.8"],
      wcag_criterion: "2.5.8",
      wcag_level: "AA",
      principle: extractPrinciple("2.5.8"),
      severity: "critical",
      confidence: 0.6,
      source_engines: ["figma-plugin"],
      selector: node.id,
      element_html: node.name,
      failure_summary: `"${node.name}" is ${Math.round(node.width)}×${Math.round(node.height)}px; WCAG 2.5.8 requires at least 24×24px. Enlarge the hit area even if the visible icon stays smaller.`,
      additional_instances: 0,
      bbox: null,
      evidence: { width: node.width, height: node.height, thresholdPx: MIN_TOUCH_TARGET },
      engine_version: null,
    });
  }
  return findings;
}
