import { sanitizeUrl, validateHost } from "@/engine/crawl";
import { insertAudit, getRecentAudits, deleteAudit, countAuditsByIp, getAudit } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { inngest } from "@/inngest/client";

const ANON_DAILY_LIMIT = parseInt(process.env.ANON_DAILY_LIMIT || "5", 10);

export async function POST(request: Request) {
  // Free tier: anonymous users may audit (5/day per IP). Sign-in is only
  // required for Figma connect (its route guards itself) and when the
  // anonymous daily limit is reached.
  const auth = await requireSession(request);
  const ip = getClientIp(request);

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

    // Anonymous rate limit: 5 audits/day per IP, then ask to sign up.
    if (!auth.ok && ip) {
      const used = await countAuditsByIp(ip);
      if (used >= ANON_DAILY_LIMIT) {
        return Response.json(
          {
            error: `You've used your ${ANON_DAILY_LIMIT} free audits for today. Create a free account to keep auditing.`,
            code: "ANON_LIMIT_REACHED",
            redirectTo: "/auth",
          },
          { status: 429 }
        );
      }
    }

    const auditId = await insertAudit(url, {
      maxPages: parseInt(process.env.MAX_PAGES || "5", 10),
    }, {
      userId: auth.ok ? auth.userId : null,
      ip,
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

export async function GET(request: Request) {
  try {
    // Owner-scoped listing: signed-in users see only their audits; the
    // anonymous path falls back to IP matching (see getRecentAudits).
    const auth = await requireSession(request);
    let scope: { userId: string | null; ip: string | null } | undefined;
    if (auth.ok) {
      scope = { userId: auth.userId, ip: getClientIp(request) };
    } else {
      scope = { userId: null, ip: getClientIp(request) };
    }

    const audits = await getRecentAudits(10, scope);
    return Response.json(Array.isArray(audits) ? audits : []);
  } catch {
    // Graceful degradation: DB not configured yet (e.g. local dev before
    // Supabase setup) — the UI must render an empty list, not crash.
    return Response.json([]);
  }
}

/** Best-effort client IP from Vercel/Next headers. */
function getClientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? null;
}

export async function DELETE(request: Request) {
  // Destructive but owner-scoped: signed-in users delete their own audits;
  // anonymous users may delete audits their IP created (the same rule the
  // list + report use) — otherwise free-tier users couldn't manage theirs.
  const auth = await requireSession(request);
  const ip = getClientIp(request);

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ error: "id query parameter is required" }, { status: 400 });
    }

    if (!auth.ok) {
      // Anonymous path: verify the audit belongs to this IP first.
      let row;
      try {
        row = await getAudit(id);
      } catch {
        // getAudit throws when the row doesn't exist — that's a 404, not 500.
        return Response.json({ error: "Audit not found" }, { status: 404 });
      }
      if (!ip || row.created_ip !== ip) {
        return Response.json(
          { error: "Missing or invalid authorization header" },
          { status: 401 }
        );
      }
    }

    const deleted = await deleteAudit(id);
    if (!deleted) {
      return Response.json({ error: "Audit not found" }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/audits error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
