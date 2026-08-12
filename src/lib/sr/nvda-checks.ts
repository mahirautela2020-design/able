import type {
  Announcement,
  NvdaCheckResults,
  NvdaSilentElement,
  NvdaSuggestion,
} from "./nvda-types";

/**
 * Deterministic checks on a captured NVDA announcement log.
 *
 * GUARDRAIL (P7 §25-26, §39, ENTERPRISE_SPEC §2): these are pure functions with
 * no LLM involvement, and ONLY provably-silent interactive elements may become
 * findings. Every other observation is emitted as a `needs_review` suggestion
 * because NVDA announcement behaviour varies by version — we never assert exact
 * phrasing, only obvious silence (RISKS §44-45).
 */

/** Roles that MUST announce a non-empty accessible name to be usable. */
export const INTERACTIVE_ROLES = new Set([
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

/** Redact a spoken value (e.g. a typed password) to a mask of equal length. */
export function redactSpokenText(text: string): string {
  if (!text) return "";
  return "\u2605".repeat(text.length);
}

/** Interactive elements that announce nothing — the ONLY finding source. */
export function detectSilentElements(
  announcements: Announcement[]
): NvdaSilentElement[] {
  const silent: NvdaSilentElement[] = [];
  const seen = new Set<string>();

  for (const a of announcements) {
    if (!a.role || !INTERACTIVE_ROLES.has(a.role)) continue;
    const name = (a.name ?? "").trim();
    if (name.length > 0) continue;
    const key = `${a.element}|${a.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    silent.push({ element: a.element, role: a.role });
  }

  return silent;
}

/** Headings that announce without a level — needs_review, never a finding. */
export function checkHeadingLevels(
  announcements: Announcement[]
): { allAnnounced: boolean; missing: NvdaSilentElement[] } {
  const missing: NvdaSilentElement[] = [];
  const headings = announcements.filter((a) => a.role === "heading");

  for (const h of headings) {
    if (h.level === null || h.level === undefined) {
      missing.push({ element: h.element, role: h.role });
    }
  }

  return { allAnnounced: missing.length === 0, missing };
}

/**
 * Compare the announcement focus order against the DOM tab order.
 * `domOrder` is the expected sequence of element identifiers (e.g. from
 * `keyboard.ts` `tabSequence`). Mismatches are needs_review, never findings.
 */
export function checkFocusOrder(
  announcements: Announcement[],
  domOrder: string[]
): { matches: boolean; mismatches: string[] } {
  if (domOrder.length === 0) return { matches: true, mismatches: [] };

  const announcedOrder = announcements
    .filter((a) => a.role && INTERACTIVE_ROLES.has(a.role))
    .map((a) => a.element);

  const mismatches: string[] = [];
  const max = Math.max(announcedOrder.length, domOrder.length);

  for (let i = 0; i < max; i++) {
    const announced = announcedOrder[i];
    const expected = domOrder[i];
    if (announced === undefined || expected === undefined) {
      mismatches.push(`length differs at index ${i}`);
      break;
    }
    if (announced !== expected) {
      mismatches.push(
        `index ${i}: announced "${announced}" but DOM tab order expected "${expected}"`
      );
    }
  }

  return { matches: mismatches.length === 0, mismatches };
}

/** Run all deterministic checks and bucket results per the guardrail. */
export function runNvdaChecks(
  announcements: Announcement[],
  domOrder: string[] = []
): NvdaCheckResults {
  const silentElements = detectSilentElements(announcements);
  const headings = checkHeadingLevels(announcements);
  const focusOrder = checkFocusOrder(announcements, domOrder);

  const suggestions: NvdaSuggestion[] = [];

  for (const h of headings.missing) {
    suggestions.push({
      rule_id: "nvda-heading-level-missing",
      rule_title: "Heading announces without a level",
      detail: `Element ${h.element} is a heading but announces without a level (1-6). NVDA users cannot gauge document structure. Verify the heading level is marked.`,
      wcag_criterion: "1.3.1",
    });
  }

  if (!focusOrder.matches) {
    suggestions.push({
      rule_id: "nvda-focus-order-mismatch",
      rule_title: "Announced focus order differs from DOM tab order",
      detail: focusOrder.mismatches.join("; "),
      wcag_criterion: "2.4.3",
    });
  }

  // No silent headings → also record a note that interactive coverage was checked.
  const interactiveCount = announcements.filter(
    (a) => a.role && INTERACTIVE_ROLES.has(a.role)
  ).length;

  suggestions.push({
    rule_id: "nvda-coverage-summary",
    rule_title: "Screen-reader coverage summary",
    detail: `${interactiveCount} interactive element(s) walked; ${silentElements.length} silent.`,
    wcag_criterion: null,
  });

  return {
    silentElements,
    suggestions,
    headingLevelsAnnounced: headings.allAnnounced,
    headingsMissingLevel: headings.missing,
    focusOrderMatchesDom: focusOrder.matches,
    focusOrderMismatches: focusOrder.mismatches,
  };
}
