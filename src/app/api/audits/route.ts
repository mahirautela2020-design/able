import { sanitizeUrl, validateHost } from "@/engine/crawl";
import { insertAudit, getRecentAudits } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return Response.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    const sanitized = sanitizeUrl(url);
    if (!sanitized) {
      return Response.json(
        { error: "Invalid URL. Must be http:// or https://" },
        { status: 400 }
      );
    }

    try {
      await validateHost(sanitized.hostname);
    } catch (e) {
      return Response.json(
        { error: `URL rejected: ${(e as Error).message}` },
        { status: 400 }
      );
    }

    const auditId = await insertAudit(url, {
      maxPages: parseInt(process.env.MAX_PAGES || "5", 10),
    });

    await inngest.send({
      name: "audit/url",
      data: { auditId, url },
    });

    return Response.json({ id: auditId }, { status: 201 });
  } catch (e) {
    console.error("POST /api/audits error:", e);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const audits = await getRecentAudits(10);
    return Response.json(Array.isArray(audits) ? audits : []);
  } catch {
    // Graceful degradation: DB not configured yet (e.g. local dev before
    // Supabase setup) — the UI must render an empty list, not crash.
    return Response.json([]);
  }
}
