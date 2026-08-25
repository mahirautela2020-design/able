// A structural subset of Figma's SceneNode -- deliberately NOT importing
// @figma/plugin-typings here, so this whole directory (and its tests) can
// run outside a Figma runtime. Real SceneNode objects satisfy this
// interface structurally; code.ts passes them straight through.
export interface FigmaColor {
  r: number;
  g: number;
  b: number;
}

export interface FigmaFillLike {
  type: string;
  visible?: boolean;
  color?: FigmaColor;
}

export interface FigmaNodeLike {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  visible?: boolean;
  fills?: FigmaFillLike[] | symbol; // Figma uses a Symbol to represent "mixed" fills
  characters?: string; // TEXT nodes only
  textAutoResize?: string; // TEXT nodes only: "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE"
  fontSize?: number | symbol; // TEXT nodes only; Symbol when mixed across characters
  fontWeight?: number | symbol;
  parent?: FigmaNodeLike | null;
  children?: readonly FigmaNodeLike[];
}
