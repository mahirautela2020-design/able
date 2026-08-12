// Map an inspected element to the WCAG success criteria it plausibly violates.
// Pure and unit-testable — the inspector panel renders chips from these ids.
// This is a heuristic surface, never a hard verdict: the criteria are for human
// review; the LLM never "creates" a finding.

import type { InspectedElement } from "./types";

const NAME_REQUIRED_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "combobox",
  "checkbox",
  "radio",
  "switch",
]);

const MIN_TARGET = 24; // WCAG 2.5.8 (Minimum)

export function mapElementToScs(el: InspectedElement): string[] {
  const scs = new Set<string>();
  const name = (el.name ?? "").trim();

  if (!name) {
    if (el.role === "img") {
      scs.add("1.1.1");
    }
    if (NAME_REQUIRED_ROLES.has(el.role)) {
      scs.add("4.1.2");
      scs.add("1.3.1");
    }
  }

  if (el.touchTarget.width < MIN_TARGET || el.touchTarget.height < MIN_TARGET) {
    scs.add("2.5.8");
  }

  return Array.from(scs);
}
