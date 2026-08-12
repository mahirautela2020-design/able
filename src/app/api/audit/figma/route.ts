import { isFigmaAuditPublic } from "@/lib/env.server";
import { requireSession } from "@/lib/supabase/session";
import { getFigmaConnection } from "@/lib/supabase/server";
import { getFile, getNode } from "@/lib/figma/client";
import { parseFigmaFile, collectFillableNodes, collectTextNodes } from "@/lib/figma/parse";
import { extractColorPairs, checkContrastPairs } from "@/lib/audit/image-contrast";
import { checkImageAlt } from "@/lib/audit/image-alt";

export async function POST(request: Request) {
  // Authenticate: the caller must be a logged-in user (their OAuth token is
  // used to fetch THEIR Figma files). FIGMA_AUDIT_PUBLIC=true keeps the
  // anonymous/demo path working with the global PAT.
  let userId: string | null = null;
  if (!isFigmaAuditPublic()) {
    const auth = await requireSession(request);
    if (!auth.ok) return auth.response;
    userId = auth.userId;
  }

  try {
    const body = await request.json();
    const { fileKey, nodeId, includeContrast = true, includeAlt = true } = body;

    if (!fileKey || typeof fileKey !== "string") {
      return Response.json({ error: "fileKey is required" }, { status: 400 });
    }

    // Per-user OAuth token when authenticated (their files), else PAT fallback.
    let token: string | null = null;
    if (userId) {
      const conn = await getFigmaConnection(userId);
      token = conn?.access_token ?? null;
      if (!token) {
        return Response.json(
          { error: "Connect your Figma account first (Connect Figma button)" },
          { status: 401 }
        );
      }
    }

    const file = await getFile(fileKey, token);

    let nodeData: unknown;
    if (nodeId) {
      const node = await getNode(fileKey, nodeId, token);
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
