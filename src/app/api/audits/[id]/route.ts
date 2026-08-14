import { getAudit, getFindingsForAudit, failStaleRunningAudits } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Recover a "running" audit whose execution was silently lost (worker
    // crash/restart, or a hung network call that never timed out) so the
    // workbench sees a real "failed" state instead of polling forever.
    await failStaleRunningAudits({ auditId: id }).catch(() => {});
    const audit = await getAudit(id);
    const findings = await getFindingsForAudit(id);

    return Response.json({ ...audit, findingsCount: findings.length });
  } catch {
    return Response.json(
      { error: "Audit not found" },
      { status: 404 }
    );
  }
}
