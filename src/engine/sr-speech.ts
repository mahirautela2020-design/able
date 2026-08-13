/**
 * P11 — Convert a normalized AX node into the speech string a screen reader
 * would emit (following ARIA Authoring Practices / NVDA conventions).
 */
import type { AxFlatNode } from "./ax-tree";
import type { Finding } from "./axe-scan";

/** Roles that MUST have a non-empty accessible name to be usable. */
const FOCUSABLE_INTERACTIVE_ROLES = new Set([
  "link",
  "button",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "option",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "switch",
  "tab",
  "slider",
  "spinbutton",
]);

/**
 * Convert a single AX node into the speech string an SR would announce.
 *
 * Convention follows NVDA patterns:
 * - button/link: "name, button" / "name, link"
 * - headings: "heading level N, name"
 * - checked states: "name, checkbox, checked" / "not checked"
 * - combo/expand: "name, combo box, collapsed/expanded"
 * - focusable with empty accessible name → returns empty string (finding generated separately)
 */
export function nodeToSpeech(node: AxFlatNode): string {
  const { role, name, level, checked, expanded } = node;

  // Heading
  if (role === "heading") {
    const lvl = level ? `heading level ${level}` : "heading";
    return name ? `${lvl}, ${name}` : lvl;
  }

  // Checkbox / switch / radio with state
  if (role === "checkbox" || role === "switch" || role === "radio") {
    const state = checked === true ? "checked" : checked === false ? "not checked" : "";
    const parts = [name, role, state].filter(Boolean);
    return parts.join(", ");
  }

  // Combobox / listbox with expanded state
  if (role === "combobox" || role === "listbox") {
    const state = expanded === true ? "expanded" : expanded === false ? "collapsed" : "";
    const parts = [name, role === "combobox" ? "combo box" : "list box", state].filter(Boolean);
    return parts.join(", ");
  }

  // Menu items with checked state
  if (role === "menuitemcheckbox" || role === "menuitemradio") {
    const state = checked === true ? "checked" : checked === false ? "not checked" : "";
    const parts = [name, "menu item", state].filter(Boolean);
    return parts.join(", ");
  }

  // Generic interactive (button, link, textbox, etc.)
  if (FOCUSABLE_INTERACTIVE_ROLES.has(role)) {
    return name ? `${name}, ${role}` : role;
  }

  // Landmarks, regions, etc. — just the name or role
  if (name) return name;
  return "";
}

/**
 * Convert an entire AX flat-node list into an ordered speech transcript.
 * Only includes nodes that would actually be announced (visible, non-generic
 * roles, or has a name).
 */
export function axTreeToTranscript(nodes: AxFlatNode[]): string[] {
  const lines: string[] = [];
  for (const node of nodes) {
    if (!node.isVisible) continue;
    // Skip generic containers unless they have an explicit name
    if (node.role === "generic" && !node.name) continue;
    // Skip certain structural roles with no name
    if (
      !node.name &&
      !["heading", "checkbox", "radio", "switch", "separator", "img"].includes(node.role) &&
      !FOCUSABLE_INTERACTIVE_ROLES.has(node.role)
    ) {
      continue;
    }

    const speech = nodeToSpeech(node);
    if (speech) lines.push(speech);
  }
  return lines;
}

/**
 * Detect focusable nodes with empty accessible names → potential 4.1.2 findings.
 */
export function detectEmptyNames(nodes: AxFlatNode[]): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (!node.isVisible || !node.focusable) continue;
    if (!FOCUSABLE_INTERACTIVE_ROLES.has(node.role)) continue;
    if (node.name.trim()) continue;

    const key = `${node.role}-${node.domTag ?? "unknown"}`;
    if (seen.has(key)) continue;
    seen.add(key);

    findings.push({
      bucket: "automated",
      rule_id: "ax-empty-accessible-name",
      rule_title: "Focusable control has empty accessible name",
      wcag_criteria: ["wcag412"],
      wcag_criterion: "4.1.2",
      wcag_level: "A",
      principle: "Robust",
      severity: "serious",
      confidence: 0.9,
      source_engines: ["ax"],
      selector: node.domTag ?? node.role,
      element_html: "",
      failure_summary: `A focusable ${node.role} element has no accessible name. Screen reader users cannot identify its purpose.`,
      additional_instances: 0,
      bbox: node.rect,
      evidence: { role: node.role, name: node.name },
      engine_version: null,
    });
  }

  return findings;
}
