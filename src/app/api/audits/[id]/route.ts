import { getAudit, getFindingsForAudit, failStaleRunningAudits } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { getClientIp } from "@/lib/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Recover a "running" audit whose execution was silently lost (worker
    // crash/restart, or a hung network call that never timed out) so the
    // workbench sees a real "failed" state instead of polling forever.
    await failStaleRunningAudits({ auditId: id }).catch(() => {});
    const audit = await getAudit(id);

    // Every sibling route (report, sr-preview, pdf, cancel, contrast-finding)
    // owner-scopes itself; this one — target_url, status, config, progress —
    // was the one place that convention was skipped, readable by anyone
    // with the id. Same three-way rule as the others.
    const auth = await requireSession(request);
    const ip = getClientIp(request);
    const isOwner = audit.created_by
      ? auth.ok && audit.created_by === auth.userId
      : !!ip && audit.created_ip === ip;
    if (!isOwner) {
      return Response.json(
        { error: "You don't have permission to view this audit" },
        { status: 403 }
      );
    }

    const findings = await getFindingsForAudit(id);

    return Response.json({ ...audit, findingsCount: findings.length });
  } catch {
    return Response.json(
      { error: "Audit not found" },
      { status: 404 }
    );
  }
}
