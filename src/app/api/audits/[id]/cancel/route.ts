import { getAudit, updateAuditStatus } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { getClientIp } from "@/lib/http";

/**
 * Stop a queued/running audit. Owner-scoped (same ownership check as the
 * report / sr-preview / contrast-finding routes). We mark the row
 * status="failed" with error_code="CANCELLED" — reusing the existing failed
 * status (no schema/enum change) while letting the UI and the scan pipeline
 * distinguish a user stop from a real failure via the error_code. The
 * running Inngest function polls the audit status between pages and bails
 * out once it sees the audit is no longer "running", so it stops scanning
 * and never overwrites this with "complete".
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let auditRow: Awaited<ReturnType<typeof getAudit>> | null = null;
    try {
      auditRow = await getAudit(id);
    } catch {
      auditRow = null;
    }
    if (!auditRow) {
      return Response.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const auth = await requireSession(request);
    const reqIp = getClientIp(request);
    // Branch on the ROW first, not on whether the caller is authenticated.
    // The previous `auth.ok ? (...) : ip-match` shape fell straight to an
    // IP match whenever the caller sent no/an invalid token -- even for an
    // audit that IS owned (created_by set). An unauthenticated request from
    // a matching IP (shared office/VPN/CGNAT network, or a spoofable
    // X-Forwarded-For) could act on a signed-in stranger's audit with zero
    // authentication. An owned audit now always requires an authenticated,
    // exact created_by match; only a genuinely anonymous audit falls back
    // to IP, regardless of the caller's current auth state.
    const isOwner = auditRow.created_by
      ? auth.ok && auditRow.created_by === auth.userId
      : !!reqIp && auditRow.created_ip === reqIp;
    if (!isOwner) {
      return Response.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    // Only an in-flight audit can be stopped.
    if (auditRow.status !== "queued" && auditRow.status !== "running") {
      return Response.json(
        { ok: false, status: auditRow.status, error: "Audit is not running" },
        { status: 409 }
      );
    }

    await updateAuditStatus(id, "failed", {
      error_code: "CANCELLED",
      error_detail: "Stopped by user",
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, status: "failed", error_code: "CANCELLED" });
  } catch {
    return Response.json({ error: "Cancel failed" }, { status: 500 });
  }
}
