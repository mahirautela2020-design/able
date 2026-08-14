// Shared types for the Explore workbench. The fixture page exposes a
// `__ableInspect` bridge that returns these shapes; the React components are
// pure displays driven by these props so they stay unit-testable.

export interface Bbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InspectedElement {
  role: string;
  name: string;
  tag: string;
  selector: string;
  aria: Record<string, string>;
  fontSize: string;
  touchTarget: { width: number; height: number };
  tabIndex: number | null;
  ancestors: string[];
  bbox: Bbox;
  computed: { color: string; backgroundColor: string };
  /** Real visible textContent, not the accessible name — an icon button
   * with only an aria-label has no visible text, so it's 1.4.11 (non-text
   * contrast), not 1.4.3, even though its accessible `name` is non-empty. */
  hasText: boolean;
}

export interface ContrastPairSample {
  fg: string;
  bg: string;
  selector: string;
  label: string;
}

export interface FocusableItem {
  selector: string;
  label: string;
  bbox: Bbox | null;
}

export interface KeyboardStep {
  selector: string;
  label: string;
  bbox: Bbox | null;
}
