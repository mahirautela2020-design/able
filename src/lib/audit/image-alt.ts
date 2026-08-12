import type { FigmaNode } from "@/lib/figma/parse";

export interface AltFinding {
  ruleId: string;
  ruleTitle: string;
  wcagCriterion: string;
  wcagLevel: string;
  principle: string;
  severity: "serious" | "moderate" | "minor";
  confidence: number;
  /** "violation" for engine-proven issues, "needs_review" for heuristic ones. */
  bucket: "violation" | "needs_review";
  sourceEngines: string[];
  selector: string;
  elementHtml: string;
  failureSummary: string;
  bbox: { x: number; y: number; width: number; height: number } | null;
  evidence: Record<string, unknown>;
}

export function checkAltText(nodes: FigmaNode[]): AltFinding[] {
  const findings: AltFinding[] = [];

  function walk(node: FigmaNode): void {
    if (node.fills && node.fills.some((f) => f.type === "IMAGE")) {
      const adjacentText = findAdjacentText();
      const hasAlt = adjacentText.length > 0;

      if (!hasAlt) {
        findings.push({
          ruleId: `figma-alt-${node.id}`,
          ruleTitle: "Non-text Content Alternative",
          wcagCriterion: "1.1.1",
          wcagLevel: "A",
          principle: "Perceivable",
          severity: "serious",
          confidence: 0.7,
          bucket: "needs_review",
          sourceEngines: ["rule-alt-text"],
          selector: `[data-figma-id="${node.id}"]`,
          elementHtml: `<IMAGE id="${node.id}" name="${node.name}">`,
          failureSummary: `Image "${node.name}" (${node.id}) has no adjacent text label`,
          bbox: node.absoluteBoundingBox
            ? { x: node.absoluteBoundingBox.x, y: node.absoluteBoundingBox.y, width: node.absoluteBoundingBox.width, height: node.absoluteBoundingBox.height }
            : null,
          evidence: {},
        });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  for (const node of nodes) {
    walk(node);
  }

  return findings;
}

function findAdjacentText(): FigmaNode[] {
  return [];
}

export function checkImageAltPresence(nodes: FigmaNode[]): AltFinding[] {
  const findings: AltFinding[] = [];

  function walk(node: FigmaNode): void {
    const hasImageFill = node.fills?.some((f) => f.type === "IMAGE") ?? false;
    if (hasImageFill) {
      const textChildren = node.children?.filter((c) => c.type === "TEXT") ?? [];
      const hasLabel = textChildren.some(
        (t) => (t.characters ?? "").trim().length > 0
      );

      if (!hasLabel) {
        findings.push({
          ruleId: `figma-alt-${node.id}`,
          ruleTitle: "Non-text Content Alternative",
          wcagCriterion: "1.1.1",
          wcagLevel: "A",
          principle: "Perceivable",
          severity: "serious",
          confidence: 0.7,
          bucket: "needs_review",
          sourceEngines: ["rule-alt-text"],
          selector: `[data-figma-id="${node.id}"]`,
          elementHtml: `<IMAGE id="${node.id}" name="${node.name}">`,
          failureSummary: `Image "${node.name}" (${node.id}) has no adjacent text or label`,
          bbox: node.absoluteBoundingBox
            ? { x: node.absoluteBoundingBox.x, y: node.absoluteBoundingBox.y, width: node.absoluteBoundingBox.width, height: node.absoluteBoundingBox.height }
            : null,
          evidence: { hasChildren: (node.children?.length ?? 0) > 0 },
        });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  for (const node of nodes) {
    walk(node);
  }

  return findings;
}

export function checkImageAlt(
  nodes: FigmaNode[]
): { imageNodes: number; missingAlt: number; findings: AltFinding[] } {
  const imageNodes = nodes.filter(
    (n) => n.fills?.some((f) => f.type === "IMAGE") ?? false
  );
  const findings = checkImageAltPresence(nodes);
  return {
    imageNodes: imageNodes.length,
    missingAlt: findings.length,
    findings,
  };
}
