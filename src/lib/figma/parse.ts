export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  characters?: string;
  style?: FigmaStyle | null;
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
}

interface FigmaStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  fills?: FigmaPaint[];
}

interface FigmaPaint {
  blendMode?: string;
  type: string;
  color?: { r: number; g: number; b: number; a: number };
  imageRef?: string;
  scaleMode?: string;
}

interface FigmaDocument {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  fills?: FigmaPaint[];
}

interface FigmaFileResponse {
  document: FigmaDocument;
  name: string;
  lastModified: string;
  thumbnailUrl?: string;
  version?: string;
}

export function parseFigmaFile(raw: unknown): FigmaNode[] {
  const file = raw as FigmaFileResponse;
  if (!file || !file.document || !Array.isArray(file.document.children)) {
    return [];
  }
  return file.document.children.flatMap((page) => {
    if (!page.children || !Array.isArray(page.children)) return [];
    return page.children.map((node) => normalizeNode(node));
  });
}

function normalizeNode(raw: FigmaNode): FigmaNode {
  const node: FigmaNode = {
    id: raw.id ?? "",
    name: raw.name ?? "",
    type: raw.type ?? "",
  };

  if (raw.fills && raw.fills.length > 0) {
    node.fills = raw.fills;
  }
  if (raw.strokes && raw.strokes.length > 0) {
    node.strokes = raw.strokes;
  }
  if (raw.strokeWeight !== undefined) {
    node.strokeWeight = raw.strokeWeight;
  }
  if (raw.cornerRadius !== undefined) {
    node.cornerRadius = raw.cornerRadius;
  }
  if (raw.characters !== undefined) {
    node.characters = raw.characters;
  }
  if (raw.style) {
    node.style = {
      fontFamily: raw.style.fontFamily,
      fontWeight: raw.style.fontWeight,
      fontSize: raw.style.fontSize ?? 16,
      lineHeightPx: raw.style.lineHeightPx,
      letterSpacing: raw.style.letterSpacing,
      fills: raw.style.fills,
    };
  }
  if (raw.absoluteBoundingBox) {
    node.absoluteBoundingBox = raw.absoluteBoundingBox;
  }
  if (raw.children && Array.isArray(raw.children)) {
    node.children = raw.children.map((child) => normalizeNode(child));
  }

  return node;
}

export function collectTextNodes(nodes: FigmaNode[]): FigmaNode[] {
  const result: FigmaNode[] = [];
  for (const node of nodes) {
    if (node.type === "TEXT") {
      result.push(node);
    }
    if (node.children && node.children.length > 0) {
      result.push(...collectTextNodes(node.children));
    }
  }
  return result;
}

export function collectFillableNodes(nodes: FigmaNode[]): FigmaNode[] {
  const result: FigmaNode[] = [];
  for (const node of nodes) {
    if (node.fills && node.fills.length > 0) {
      result.push(node);
    }
    if (node.strokes && node.strokes.length > 0) {
      result.push(node);
    }
    if (node.children && node.children.length > 0) {
      result.push(...collectFillableNodes(node.children));
    }
  }
  return result;
}

export function getResolvedTextStyle(node: FigmaNode): { fontSize: number; fontWeight: number } {
  let current: FigmaNode | undefined = node;
  while (current) {
    if (current.style && current.style.fontSize !== undefined) {
      return { fontSize: current.style.fontSize, fontWeight: current.style.fontWeight ?? 400 };
    }
    current = undefined;
  }
  if (node.style?.fontWeight) {
    return { fontSize: 16, fontWeight: node.style.fontWeight };
  }
  return { fontSize: 16, fontWeight: 400 };
}

function figmaColorToHex(color: { r: number; g: number; b: number; a: number }): string {
  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export function figmaFillToHex(fill: FigmaPaint): string | null {
  if (fill.type === "SOLID" && fill.color) {
    return figmaColorToHex(fill.color);
  }
  return null;
}
