import { isFigmaAuditPublic } from "@/lib/env.server";
import { requireSession } from "@/lib/supabase/session";
import { getFigmaConnection } from "@/lib/supabase/server";
import { getFile, getNode, extractFileKey } from "@/lib/figma/client";
import { parseFigmaFile, collectFillableNodes, collectTextNodes } from "@/lib/figma/parse";
import { extractColorPairs, checkContrastPairs } from "@/lib/audit/image-contrast";
import { checkImageAlt } from "@/lib/audit/image-alt";

/** Maps a thrown error's message to an HTTP status + user-facing text.
 * Exported for unit testing without mocking the Figma network client. */
export function mapFigmaError(message: string): { status: number; error: string } | null {
  if (message.includes("FIGMA_PAT not configured")) {
    return { status: 503, error: "Figma disabled: add FIGMA_PAT to environment" };
  }
  if (message.includes("Invalid file key") || message.includes("SSRF guard")) {
    return { status: 400, error: message };
  }
  const figmaApiError = message.match(/^Figma API error \((\d+)\)/);
  if (figmaApiError) {
    const status = Number(figmaApiError[1]);
    const friendly =
      status === 404
        ? "Figma file not found — check the file key or share URL."
        : status === 403
          ? "Access denied — you don't have permission to view this Figma file, or the PAT/OAuth token has expired."
          : status === 429
            ? "Figma API rate limit reached — try again shortly."
            : `Figma API error (${status}) — the file may be inaccessible right now.`;
    // 4xx from Figma is a client-fixable problem (bad key, no access), not
    // a server fault — surface it as a 502 (we're a proxy to their API)
    // rather than the misleading 500 this used to fall through to.
    return { status: status >= 500 ? 502 : status, error: friendly };
  }
  return null;
}

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
    const { fileKey: rawFileKey, nodeId, includeContrast = true, includeAlt = true } = body;

    // Accept a raw file key OR a full Figma share URL.
    const fileKey = extractFileKey(rawFileKey ?? "");
    if (!fileKey) {
      return Response.json(
        { error: "fileKey is required — a Figma file key or share URL" },
        { status: 400 }
      );
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
    const mapped = mapFigmaError((e as Error).message);
    if (mapped) {
      return Response.json({ error: mapped.error }, { status: mapped.status });
    }
    console.error("POST /api/audit/figma error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
