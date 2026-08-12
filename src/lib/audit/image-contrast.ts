import type { FigmaNode } from "@/lib/figma/parse";
import { figmaFillToHex, getResolvedTextStyle } from "@/lib/figma/parse";
import { contrastRatio } from "@/lib/audit/color-math";

export interface ContrastPair {
  fgNodeId: string;
  bgNodeId: string;
  fgHex: string;
  bgHex: string;
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
  isLargeText: boolean;
}

export interface ContrastFinding {
  ruleId: string;
  ruleTitle: string;
  wcagCriterion: string;
  wcagLevel: string;
  principle: string;
  severity: "critical" | "serious" | "moderate" | "minor";
  confidence: number;
  sourceEngines: string[];
  selector: string;
  elementHtml: string;
  failureSummary: string;
  bbox: { x: number; y: number; width: number; height: number } | null;
  evidence: { pair: ContrastPair };
}

/** WCAG 2.x contrast ratio between two colors — shared implementation lives
 * in color-math.ts (imported above); reused by Figma + Android + vision. */
function isGradientFill(fill: { type: string }): boolean {
  return fill.type.startsWith("GRADIENT_");
}

function isImageFill(fill: { type: string }): boolean {
  return fill.type === "IMAGE";
}

function findBackgroundColor(
  node: FigmaNode,
  rootNodes: FigmaNode[]
): string | null {
  let current: FigmaNode | undefined = node;
  while (current) {
    if (current.fills) {
      for (const fill of current.fills) {
        const hex = figmaFillToHex(fill);
        if (hex) return hex;
      }
    }
    current = undefined;
  }
  for (const rNode of rootNodes) {
    if (rNode.fills) {
      for (const fill of rNode.fills) {
        const hex = figmaFillToHex(fill);
        if (hex) return hex;
      }
    }
  }
  return "#FFFFFF";
}

function isInheritedOrMissingFontSize(node: FigmaNode): boolean {
  return !node.style || node.style.fontSize === undefined;
}

export function extractColorPairs(
  nodeTree: FigmaNode[],
  rootNodes: FigmaNode[]
): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  const bgHex = findBackgroundColor({ id: "", name: "", type: "" }, rootNodes) ?? "#FFFFFF";

  for (const node of nodeTree) {
    if (!node.fills) continue;

    for (const fill of node.fills) {
      if (isGradientFill(fill)) {
        pairs.push({
          fgNodeId: node.id,
          bgNodeId: "root",
          fgHex: "gradient",
          bgHex: bgHex,
          ratio: 0,
          passesAA: false,
          passesAAA: false,
          isLargeText: isLarge(node),
        });
        continue;
      }
      if (isImageFill(fill)) {
        pairs.push({
          fgNodeId: node.id,
          bgNodeId: "root",
          fgHex: "image",
          bgHex: bgHex,
          ratio: 0,
          passesAA: false,
          passesAAA: false,
          isLargeText: false,
        });
        continue;
      }

      const fg = figmaFillToHex(fill);
      if (!fg) continue;

      if (node.strokes) {
        for (const strokeFill of node.strokes) {
          const strokeHex = figmaFillToHex(strokeFill);
          if (strokeHex) {
            const ratio = contrastRatio(strokeHex, fg);
            pairs.push({
              fgNodeId: node.id,
              bgNodeId: node.id,
              fgHex: strokeHex,
              bgHex: fg,
              ratio,
              passesAA: passesAA(ratio, false),
              passesAAA: passesAAA(ratio, false),
              isLargeText: false,
            });
          }
        }
      }

      for (const child of findTextChildren(node)) {
        const textColor = getTextFillHex(child);
        if (textColor) {
          const ratio = contrastRatio(textColor, fg);
          const large = isLarge(child);
          pairs.push({
            fgNodeId: child.id,
            bgNodeId: node.id,
            fgHex: textColor,
            bgHex: fg,
            ratio,
            passesAA: passesAA(ratio, large),
            passesAAA: passesAAA(ratio, large),
            isLargeText: large,
          });
        }
      }
    }
  }

  return pairs;
}

function findTextChildren(node: FigmaNode): FigmaNode[] {
  if (!node.children) return [];
  return node.children.filter((c) => c.type === "TEXT");
}

function getTextFillHex(node: FigmaNode): string | null {
  const fills = node.style?.fills ?? node.fills;
  if (!fills) return null;
  for (const fill of fills) {
    const hex = figmaFillToHex(fill);
    if (hex) return hex;
  }
  return null;
}

function isLarge(node: FigmaNode): boolean {
  if (node.type !== "TEXT") return false;
  const { fontSize, fontWeight } = getResolvedTextStyle(node);
  if (isInheritedOrMissingFontSize(node)) return false;
  return fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
}

function passesAA(ratio: number, isLargeText: boolean): boolean {
  return isLargeText ? ratio >= 3.0 : ratio >= 4.5;
}

function passesAAA(ratio: number, isLargeText: boolean): boolean {
  return isLargeText ? ratio >= 4.5 : ratio >= 7.0;
}

export function checkContrastPairs(
  pairs: ContrastPair[],
  nodeTree: FigmaNode[]
): ContrastFinding[] {
  const findings: ContrastFinding[] = [];

  for (const pair of pairs) {
    if (pair.passesAA) continue;

    const node = nodeTree.find((n) => n.id === pair.fgNodeId);
    const elementHtml = node
      ? `<${node.type} id="${node.id}" name="${node.name}">${node.characters ?? ""}</${node.type}>`
      : "";

    let wcagLevel: string;
    let wcagCriterion: string;
    let severity: ContrastFinding["severity"];

    if (pair.ratio === 0 && (pair.fgHex === "gradient" || pair.fgHex === "image")) {
      wcagLevel = "AA";
      wcagCriterion = "1.4.3";
      severity = "minor";
    } else if (!pair.passesAA) {
      wcagLevel = "AA";
      wcagCriterion = "1.4.3";
      severity = "serious";
    } else {
      wcagLevel = "AAA";
      wcagCriterion = "1.4.6";
      severity = "moderate";
    }

    const summary =
      pair.ratio === 0 && pair.fgHex === "gradient"
        ? `Gradient fill on ${pair.fgNodeId} — contrast cannot be measured automatically`
        : pair.ratio === 0 && pair.fgHex === "image"
          ? `Image fill on ${pair.fgNodeId} — contrast cannot be measured automatically`
          : `Contrast ratio ${pair.ratio.toFixed(1)}:1 between ${pair.fgHex} and ${pair.bgHex} (${pair.fgNodeId}/${pair.bgNodeId}) — fails WCAG ${wcagLevel}`;

    findings.push({
      ruleId: `contrast-${pair.fgNodeId}`,
      ruleTitle: "Color Contrast",
      wcagCriterion,
      wcagLevel,
      principle: "Perceivable",
      severity,
      confidence: 1,
      sourceEngines: ["rule-contrast"],
      selector: `[data-figma-id="${pair.fgNodeId}"]`,
      elementHtml,
      failureSummary: summary,
      bbox: node?.absoluteBoundingBox
        ? { x: node.absoluteBoundingBox.x, y: node.absoluteBoundingBox.y, width: node.absoluteBoundingBox.width, height: node.absoluteBoundingBox.height }
        : null,
      evidence: { pair },
    });
  }

  return findings;
}
