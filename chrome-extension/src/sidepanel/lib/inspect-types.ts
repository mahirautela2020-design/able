export interface InspectedElement {
  role: string;
  name: string;
  tag: string;
  selector: string;
  aria: Record<string, string>;
  fontSize: string;
  touchTarget: { width: number; height: number };
  tabIndex: number | null;
  bbox: { x: number; y: number; width: number; height: number };
  computed: { color: string; backgroundColor: string };
  hasText: boolean;
}

export interface FocusableStep {
  selector: string;
  label: string;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface ContrastPairSample {
  fg: string;
  bg: string;
  selector: string;
  label: string;
}

export interface OutlineNode {
  kind: "heading" | "landmark";
  level: number | null;
  role: string;
  label: string;
  selector: string;
}
