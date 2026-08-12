import { isFigmaAuditPublic } from "@/lib/env.server";
import { getFile, getNode } from "@/lib/figma/client";
import { parseFigmaFile, collectFillableNodes, collectTextNodes } from "@/lib/figma/parse";
import { extractColorPairs, checkContrastPairs } from "@/lib/audit/image-contrast";
import { checkImageAlt } from "@/lib/audit/image-alt";

export async function POST(request: Request) {
  if (!isFigmaAuditPublic()) {
    return Response.json(
      { error: "Figma audit is disabled: set FIGMA_AUDIT_PUBLIC=true or add RBAC" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { fileKey, nodeId, includeContrast = true, includeAlt = true } = body;

    if (!fileKey || typeof fileKey !== "string") {
      return Response.json({ error: "fileKey is required" }, { status: 400 });
    }

    const file = await getFile(fileKey);

    let nodeData: unknown;
    if (nodeId) {
      const node = await getNode(fileKey, nodeId);
      if (!node) {
        return Response.json({ error: `Node ${nodeId} not found` }, { status: 404 });
      }
      nodeData = { document: node.document };
    } else {
      nodeData = file;
    }

    const nodeTree = parseFigmaFile(nodeData);

    let contrastFindings: unknown[] = [];
    if (includeContrast) {
      const fillableNodes = collectFillableNodes(nodeTree);
      const pairs = extractColorPairs(fillableNodes, nodeTree);
      contrastFindings = checkContrastPairs(pairs, nodeTree);
    }

    let altFindings: unknown[] = [];
    if (includeAlt) {
      const altResult = checkImageAlt(nodeTree);
      altFindings = altResult.findings;
    }

    const textCount = collectTextNodes(nodeTree).length;
    const allFindings = [...contrastFindings, ...altFindings];

    return Response.json({
      fileKey,
      nodeId: nodeId ?? null,
      nodes: nodeTree,
      findings: allFindings,
      summary: {
        textNodes: textCount,
        contrastFindings: contrastFindings.length,
        altFindings: altFindings.length,
      },
    });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes("FIGMA_PAT not configured")) {
      return Response.json(
        { error: "Figma disabled: add FIGMA_PAT to environment" },
        { status: 503 }
      );
    }
    if (message.includes("Invalid file key") || message.includes("SSRF guard")) {
      return Response.json({ error: message }, { status: 400 });
    }
    console.error("POST /api/audit/figma error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
