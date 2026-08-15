import type { AriaNode } from "./snapshot";

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

function nodeToSpeech(role: string, name: string, level?: number): string {
  if (role === "heading") {
    const lvl = level ? `heading level ${level}` : "heading";
    return name ? `${lvl}, ${name}` : lvl;
  }
  if (FOCUSABLE_INTERACTIVE_ROLES.has(role)) {
    return name ? `${name}, ${role}` : role;
  }
  if (name) return name;
  return "";
}

/**
 * Client- and server-safe transcript builder for the Playwright-CDP
 * accessibility snapshot returned by /api/explore/ax-snapshot — used as a
 * live fallback when the audit's own stored transcript (captured once,
 * during the scan, at `evidence/sr/{id}/0/ax-transcript.json`) is missing
 * or empty, and for the on-demand "test live" screen-reader walkthrough.
 */
export function ariaTreeToTranscript(root: AriaNode | null): string[] {
  if (!root) return [];
  const lines: string[] = [];
  const visit = (node: AriaNode) => {
    if (node.role !== "generic" || node.name) {
      const speech = nodeToSpeech(node.role, node.name, node.level);
      if (speech) lines.push(speech);
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return lines;
}
