/**
 * Shared types for the P7 NVDA screen-reader automation layer.
 *
 * Deliberately free of runtime imports so `nvda-checks.ts` (pure, deterministic,
 * tested in CI without NVDA) never pulls in node builtins or Playwright.
 */

/** One captured screen-reader announcement for a focused element. */
export interface Announcement {
  /** Timestamp (ms) when the element was focused / announced. */
  at: number;
  /** Element identifier (selector or description) in the audited page. */
  element: string;
  /** Accessible role, e.g. "link", "button", "heading". */
  role: string | null;
  /** Accessible name — empty means the element announces nothing. */
  name: string | null;
  /** Heading level (1-6) when role is "heading". */
  level: number | null;
  /** The text NVDA announces (accessible name + role/level, redacted for passwords). */
  spoken: string;
}

/** Result of an availability probe for the local NVDA install. */
export interface NvdaAvailability {
  available: boolean;
  path: string | null;
  reason: string | null;
}

/** A single silent interactive element — the ONLY thing that may become a finding. */
export interface NvdaSilentElement {
  element: string;
  role: string | null;
}

/** A human-review suggestion. These are NEVER findings (needs_review only). */
export interface NvdaSuggestion {
  rule_id: string;
  rule_title: string;
  detail: string;
  wcag_criterion: string | null;
}

/** Aggregated result of the deterministic NVDA checks. */
export interface NvdaCheckResults {
  /** Interactive elements that announce nothing → findings (guardrail: this is the only path). */
  silentElements: NvdaSilentElement[];
  /** Everything else → needs_review, never a finding. */
  suggestions: NvdaSuggestion[];
  /** True when every heading announcement carries a level. */
  headingLevelsAnnounced: boolean;
  /** Headings that announce without a level (needs_review, not a finding). */
  headingsMissingLevel: NvdaSilentElement[];
  /** True when announcement focus order matches the DOM tab order. */
  focusOrderMatchesDom: boolean;
  /** Element sequences that diverge from the DOM tab order (needs_review). */
  focusOrderMismatches: string[];
}
