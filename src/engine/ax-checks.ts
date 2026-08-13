/**
 * P11 — Deterministic checks from the AX tree.
 *
 * Four checks:
 * 1. Empty accessible name on focusable controls → WCAG 4.1.2 (serious)
 * 2. Button/link role vs DOM tag mismatch → WCAG 4.1.2 (serious)
 * 3. Reading-order divergence (AX doc order vs visual bbox y/x sort) → WCAG 1.3.2 (needs_review)
 * 4. Duplicate accessible names for links/buttons in same landmark → WCAG 2.4.4/2.4.7 (needs_review)
 */
import type { AxFlatNode } from "./ax-tree";
import type { Finding } from "./axe-scan";

// Re-export detectEmptyNames from sr-speech to avoid duplication (R2 mitigation)
export { detectEmptyNames } from "./sr-speech";
import { detectEmptyNames } from "./sr-speech";

/**
 * Run all AX-tree deterministic checks and return findings.
 */
export function runAxChecks(nodes: AxFlatNode[]): Finding[] {
  return [
    ...detectEmptyNames(nodes),
    ...detectRoleMismatch(nodes),
    ...detectReadingOrderDivergence(nodes),
    ...detectDuplicateNames(nodes),
  ];
}

/**
 * Check 2: Button/link role vs DOM tag mismatch.
 * An `<a>` with role="button" or a `<button>` with role="link" is suspicious
 * and may confuse screen reader users about expected interaction.
 */
export function detectRoleMismatch(nodes: AxFlatNode[]): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (!node.isVisible || !node.domTag) continue;

    const tag = node.domTag.toLowerCase();
    const role = node.role;

    let mismatch = false;
    if (tag === "a" && role === "button") mismatch = true;
    if (tag === "button" && role === "link") mismatch = true;

    if (!mismatch) continue;

    const key = `${tag}-${role}-${node.name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    findings.push({
      bucket: "automated",
      rule_id: "ax-role-mismatch",
      rule_title: "Element role does not match its DOM tag",
      wcag_criteria: ["wcag412"],
      wcag_criterion: "4.1.2",
      wcag_level: "A",
      principle: "Robust",
      severity: "serious",
      confidence: 0.85,
      source_engines: ["ax"],
      selector: node.domTag,
      element_html: "",
      failure_summary: `A <${tag}> element has role="${role}". Screen readers announce it as a ${role}, but keyboard behavior follows the <${tag}> pattern.`,
      additional_instances: 0,
      bbox: node.rect,
      evidence: { role, domTag: tag, name: node.name },
      engine_version: null,
    });
  }

  return findings;
}

/**
 * Check 3: Reading-order divergence.
 * Compares AX document order vs visual order (bounding-box y/x sort).
 * Only runs when nodes have rects; otherwise emits a single needs_review note.
 */
export function detectReadingOrderDivergence(nodes: AxFlatNode[]): Finding[] {
  const visibleWithContent = nodes.filter(
    (n) => n.isVisible && (n.name || n.focusable) && n.role !== "generic"
  );

  const withRects = visibleWithContent.filter((n) => n.rect !== null);

  // R3 mitigation: if no rects available, skip silently
  if (withRects.length < 2) return [];

  // Visual order: sort by y then x
  const visualOrder = [...withRects].sort((a, b) => {
    const ay = a.rect!.y;
    const by = b.rect!.y;
    // Treat nodes within 10px of each other as same row
    if (Math.abs(ay - by) > 10) return ay - by;
    return a.rect!.x - b.rect!.x;
  });

  // Count inversions between AX order and visual order
  let inversions = 0;
  const axIndices = new Map<AxFlatNode, number>();
  withRects.forEach((n, i) => axIndices.set(n, i));

  for (let i = 0; i < visualOrder.length; i++) {
    for (let j = i + 1; j < Math.min(i + 5, visualOrder.length); j++) {
      const axI = axIndices.get(visualOrder[i])!;
      const axJ = axIndices.get(visualOrder[j])!;
      if (axI > axJ) inversions++;
    }
  }

  // Only flag if significant divergence (>20% of checked pairs)
  const checkedPairs = Math.min(withRects.length * 4, withRects.length * (withRects.length - 1) / 2);
  if (inversions === 0 || checkedPairs === 0) return [];
  if (inversions / checkedPairs < 0.2) return [];

  return [{
    bucket: "needs_review",
    rule_id: "ax-reading-order",
    rule_title: "Reading order may not match visual order",
    wcag_criteria: ["wcag132"],
    wcag_criterion: "1.3.2",
    wcag_level: "A",
    principle: "Perceivable",
    severity: "moderate",
    confidence: 0.6,
    source_engines: ["ax"],
    selector: "",
    element_html: "",
    failure_summary: `The accessibility tree order diverges significantly from the visual layout order (${inversions} inversions detected). Screen reader users may encounter content in a confusing sequence.`,
    additional_instances: 0,
    bbox: null,
    evidence: { inversions, totalNodes: withRects.length },
    engine_version: null,
  }];
}

/**
 * Check 4: Duplicate accessible names for links/buttons.
 * Multiple links or buttons with the same name in a region make navigation
 * ambiguous for SR users.
 */
export function detectDuplicateNames(nodes: AxFlatNode[]): Finding[] {
  const findings: Finding[] = [];
  const nameCounts = new Map<string, number>();

  for (const node of nodes) {
    if (!node.isVisible) continue;
    if (node.role !== "link" && node.role !== "button") continue;
    const name = node.name.trim();
    if (!name) continue;

    const key = `${node.role}:${name}`;
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  const reported = new Set<string>();
  for (const [key, count] of nameCounts) {
    if (count < 2) continue;
    if (reported.has(key)) continue;
    reported.add(key);

    const [role, ...nameParts] = key.split(":");
    const name = nameParts.join(":");

    findings.push({
      bucket: "needs_review",
      rule_id: "ax-duplicate-names",
      rule_title: "Multiple interactive elements share the same accessible name",
      wcag_criteria: ["wcag244", "wcag247"],
      wcag_criterion: "2.4.4",
      wcag_level: "A",
      principle: "Operable",
      severity: "moderate",
      confidence: 0.7,
      source_engines: ["ax"],
      selector: role,
      element_html: "",
      failure_summary: `${count} ${role} elements share the accessible name "${name}". Screen reader users cannot distinguish between them.`,
      additional_instances: count - 1,
      bbox: null,
      evidence: { role, name, count },
      engine_version: null,
    });
  }

  return findings;
}
