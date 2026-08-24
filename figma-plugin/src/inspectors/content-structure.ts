import { extractPrinciple, type Finding } from "@/engine/finding-mapping";
import { collectNodes } from "../node-helpers";
import type { FigmaNodeLike } from "../types";

const DEFAULT_NAME_PATTERN = /^(rectangle|ellipse|vector|image|frame|group|component|instance|polygon|star|line)\s*\d*$/i;
const IMAGE_LIKE_TYPES = new Set(["RECTANGLE", "ELLIPSE", "VECTOR", "POLYGON", "STAR", "LINE", "BOOLEAN_OPERATION"]);

/** WCAG 1.1.1: a node carrying an image fill (or an inherently graphical
 * node type) that still has Figma's auto-generated default name is likely
 * missing the descriptive name developers use as alt text at handoff. */
export function checkMissingDescriptions(roots: FigmaNodeLike[]): Finding[] {
  const findings: Finding[] = [];
  for (const node of collectNodes(roots)) {
    if (node.visible === false) continue;
    const hasImageFill =
      Array.isArray(node.fills) && node.fills.some((f) => f.type === "IMAGE" && f.visible !== false);
    if (!hasImageFill && !IMAGE_LIKE_TYPES.has(node.type)) continue;
    if (!DEFAULT_NAME_PATTERN.test(node.name.trim())) continue;

    findings.push({
      bucket: "needs_review",
      rule_id: "figma-missing-description",
      rule_title: "Image/graphic still has Figma's default auto-generated name",
      wcag_criteria: ["1.1.1"],
      wcag_criterion: "1.1.1",
      wcag_level: "A",
      principle: extractPrinciple("1.1.1"),
      severity: "moderate",
      confidence: 0.5,
      source_engines: ["figma-plugin"],
      selector: node.id,
      element_html: node.name,
      failure_summary: `"${node.name}" has no descriptive layer name -- this is usually what developers use as alt text at handoff, and a default name like this means it likely hasn't been given one.`,
      additional_instances: 0,
      bbox: null,
      evidence: {},
      engine_version: null,
    });
  }
  return findings;
}

const MIN_FLAGGED_LENGTH = 40;

/** WCAG 1.4.4: a fixed-size (not auto-resize) text box holding a
 * substantial amount of text is at risk of clipping if the content is
 * translated or the user scales text up. Short fixed-size labels (buttons,
 * badges) are excluded via a length floor -- otherwise nearly every button
 * in the file would get flagged. */
export function checkFixedResizeText(roots: FigmaNodeLike[]): Finding[] {
  const findings: Finding[] = [];
  for (const node of collectNodes(roots)) {
    if (node.type !== "TEXT" || node.visible === false) continue;
    if (node.textAutoResize !== "NONE") continue;
    const text = node.characters ?? "";
    if (text.length < MIN_FLAGGED_LENGTH) continue;

    findings.push({
      bucket: "needs_review",
      rule_id: "figma-fixed-resize-text",
      rule_title: "Text box has a fixed size instead of auto-resize",
      wcag_criteria: ["1.4.4"],
      wcag_criterion: "1.4.4",
      wcag_level: "AA",
      principle: extractPrinciple("1.4.4"),
      severity: "minor",
      confidence: 0.4,
      source_engines: ["figma-plugin"],
      selector: node.id,
      element_html: node.name,
      failure_summary: `"${node.name}" is a fixed-size text box with ${text.length} characters -- if this is translated or text-scaled, it may clip. Switch to auto-height or auto-width.`,
      additional_instances: 0,
      bbox: null,
      evidence: { characters: text.length },
      engine_version: null,
    });
  }
  return findings;
}

// Word-bounded for the "h1".."h6" alternative (`^h[1-6]$`, fully anchored to
// the whole trimmed name -- matches layer names like "H1" or "h2" only).
//
// The bare `heading` alternative is deliberately left unanchored/without \b,
// unlike INTERACTIVE_NAME_PATTERN in touch-target.ts. That's a considered
// choice, not an oversight: touch-target's \b was needed because "tab" and
// "link" are common English words that appear as substrings inside
// unrelated words ("Establish", "Blinking"), so an unanchored match produced
// real false positives on non-interactive layers. Here, adding \b around
// "heading" would actually break the case we most want to catch: a layer
// named "Subheading" (no space/hyphen before "heading") has no word boundary
// between "Sub" and "heading", so \bheading\b would fail to match it -- and
// "Subheading" flagged as heading-like is correct, not a false positive.
// The only way an unanchored "heading" fires on something that ISN'T a
// heading is via an unrelated word that happens to contain "heading" as a
// substring -- e.g. "spearheading" or "beheading" both literally contain
// "heading". Both are real English words, but neither is remotely plausible
// as a Figma layer name in a UI file (unlike "tab"/"link", which are
// everyday UI vocabulary), so the practical false-positive risk is judged
// negligible and the pattern is left unanchored to keep matching
// "Subheading", "Heading/Title", "Page Heading", etc.
const HEADING_NAME_PATTERN = /^h[1-6]$|heading/i;

/** WCAG 2.4.6 (and, by extension, 1.3.1's "conveyed through presentation"
 * requirement): every layer named like a heading rendering at the exact
 * same font size means there's no visible hierarchy for a reader (or a
 * developer building the semantic markup) to go on. Only fires when there
 * are 2+ heading-named layers to compare -- a single heading has nothing
 * to be inconsistent with. */
export function checkHeadingStructure(roots: FigmaNodeLike[]): Finding[] {
  const headings = collectNodes(roots).filter(
    (n) => n.type === "TEXT" && n.visible !== false && HEADING_NAME_PATTERN.test(n.name.trim())
  );
  if (headings.length < 2) return [];

  const sizes = new Set(
    headings.map((n) => (typeof n.fontSize === "number" ? n.fontSize : null)).filter((s): s is number => s !== null)
  );
  if (sizes.size !== 1) return [];

  return headings.map((node) => ({
    bucket: "needs_review" as const,
    rule_id: "figma-heading-hierarchy",
    rule_title: "Headings have no visible size/weight hierarchy",
    wcag_criteria: ["2.4.6"],
    wcag_criterion: "2.4.6",
    wcag_level: "AA",
    principle: extractPrinciple("2.4.6"),
    severity: "minor" as const,
    confidence: 0.4,
    source_engines: ["figma-plugin"],
    selector: node.id,
    element_html: node.name,
    failure_summary: `All ${headings.length} layers named like headings on this screen render at the same size -- give each heading level a visually distinct size/weight so the structure survives handoff.`,
    additional_instances: 0,
    bbox: null,
    evidence: { headingCount: headings.length },
    engine_version: null,
  }));
}
