import { sanitizeUrl, validateHost } from "@/engine/crawl";
import { insertAudit, getRecentAudits, deleteAudit, countAuditsByIp, getAudit, updateAuditStatus } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { getClientIp } from "@/lib/http";
import { inngest } from "@/inngest/client";

const ANON_DAILY_LIMIT = parseInt(process.env.ANON_DAILY_LIMIT || "5", 10);

export async function POST(request: Request) {
  // Free tier: anonymous users may audit (5/day per IP). Sign-in is only
  // required for Figma connect (its route guards itself) and when the
  // anonymous daily limit is reached.
  const auth = await requireSession(request);
  const ip = getClientIp(request);

  try {
    const { url, modules } = await request.json();
    const moduleIds: string[] | undefined =
      Array.isArray(modules) && modules.every((m) => typeof m === "string")
        ? modules
        : undefined;

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
      ...(moduleIds ? { modules: moduleIds } : {}),
    }, {
      userId: auth.ok ? auth.userId : null,
      ip,
    });

    // insertAudit above already created the row -- if queueing the real
    // scan fails now (e.g. no local Inngest dev server running, or a
    // genuine outage), that row was otherwise left stuck at "queued"
    // forever: never picked up, never self-healed (failStaleRunningAudits
    // only rescues "running", not "queued"), and it silently still counted
    // against the caller's daily anonymous limit for a scan that never
    // started. Mark it failed immediately and say so honestly instead of
    // a bare "Internal server error".
    try {
      await inngest.send({
        name: "audit/url",
        data: moduleIds ? { auditId, url, modules: moduleIds } : { auditId, url },
      });
    } catch (e) {
      console.error("POST /api/audits: failed to queue audit/url", e);
      await updateAuditStatus(auditId, "failed", {
        error_code: "QUEUE_UNAVAILABLE",
        error_detail: e instanceof Error ? e.message : String(e),
      }).catch(() => {
        // best-effort — nothing further to do if this write also fails
      });
      return Response.json(
        { error: "Couldn't start the audit — the background worker is unavailable right now. Try again shortly.", id: auditId },
        { status: 503 }
      );
    }

    // Best-effort fast preview (Lighthouse via Google PSI) -- independent
    // event/function, genuinely never blocks or is blocked by the real
    // audit above: unlike the send above, a failure here must not fail the
    // whole request or leave a real audit un-created over a preview.
    await inngest
      .send({ name: "audit/psi-preview", data: { auditId, url } })
      .catch((e) => {
        console.error("POST /api/audits: failed to queue audit/psi-preview", e);
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

    // Ownership check for BOTH branches, same three-way rule as
    // cancel/route.ts: an owned audit requires an exact created_by match; an
    // anonymous audit (created_by null) falls back to IP, whether or not the
    // caller happens to be signed in now (lets someone cancel/delete an
    // audit they ran before logging in). This used to run only when
    // `!auth.ok` — a signed-in caller (a real, valid Bearer token) skipped
    // it entirely and could delete any OTHER user's audit by id with no
    // ownership check at all, a plain IDOR on a destructive action. Audit
    // ids are UUIDs (not enumerable by guessing), but they do appear in
    // shareable URLs and API responses, so "not guessable" is not the same
    // as "never observed by someone else."
    let row;
    try {
      row = await getAudit(id);
    } catch {
      // getAudit throws when the row doesn't exist — that's a 404, not 500.
      return Response.json({ error: "Audit not found" }, { status: 404 });
    }
    const isOwner = row.created_by
      ? auth.ok && row.created_by === auth.userId
      : !!ip && row.created_ip === ip;
    if (!isOwner) {
      return Response.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
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
