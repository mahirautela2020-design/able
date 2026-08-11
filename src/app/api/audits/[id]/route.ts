import { getAudit, getFindingsForAudit } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
