import { rgbToHex } from "@/lib/contrast";
import type { FigmaColor, FigmaFillLike, FigmaNodeLike } from "./types";

export function figmaColorToHex(color: FigmaColor): string {
  return rgbToHex({ r: color.r * 255, g: color.g * 255, b: color.b * 255 });
}

/** First visible SOLID fill, as hex -- or null if there isn't one (mixed
 * fills, no fills, or only non-solid fills like IMAGE/GRADIENT). Returning
 * null (not a guessed default) lets callers decide whether "no evaluable
 * fill" means "skip this node" rather than silently reporting a false pass. */
export function resolveFillColor(fills: FigmaFillLike[] | symbol | undefined): string | null {
  if (!fills || typeof fills === "symbol") return null;
  for (const fill of fills) {
    if (fill.type === "SOLID" && fill.visible !== false && fill.color) {
      return figmaColorToHex(fill.color);
    }
  }
  return null;
}

/** Walks the parent chain looking for the nearest solid fill, same
 * "resolve effective background" approach the website/extension use for
 * DOM elements (src/lib/widget's resolveBg). Defaults to white -- Figma
 * frames commonly have no fill at all and inherit the canvas's white. */
export function resolveBackgroundColor(node: FigmaNodeLike): string {
  let current: FigmaNodeLike | null | undefined = node.parent;
  while (current) {
    const color = resolveFillColor(current.fills);
    if (color) return color;
    current = current.parent;
  }
  return "#ffffff";
}

/** WCAG's large-text threshold: 18px+ at any weight, or 14px+ bold. */
export function isLargeText(
  fontSize: number | symbol | undefined,
  fontWeight: number | symbol | undefined
): boolean {
  if (typeof fontSize !== "number") return false;
  const bold = typeof fontWeight === "number" && fontWeight >= 700;
  return fontSize >= 18 || (fontSize >= 14 && bold);
}

/** Flattens a node tree (depth-first, roots then children) into a flat list. */
export function collectNodes(roots: FigmaNodeLike[]): FigmaNodeLike[] {
  const out: FigmaNodeLike[] = [];
  const visit = (n: FigmaNodeLike) => {
    out.push(n);
    for (const child of n.children ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  return out;
}
