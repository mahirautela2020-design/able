import { getAudit, getFindingsForAudit, createSignedUrl } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { getClientIp } from "@/lib/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Isolation: reports are private. Signed-in owners may read; anonymous
    // requesters may read only when their IP matches the audit's creator IP
    // (the same rule the audits list uses), so a free-tier user can view
    // their own result without an account. Owner-scoped, not just
    // "any valid session" — matches the check in
    // /api/audits/[id]/contrast-finding: a missing audit and an audit that
    // exists but isn't yours get the SAME 401 so a caller can't enumerate
    // valid audit ids by probing for 404 vs 401.
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
    const isOwner = auth.ok
      ? auditRow.created_by
        ? auditRow.created_by === auth.userId
        : !!reqIp && auditRow.created_ip === reqIp
      : !!reqIp && auditRow.created_ip === reqIp;
    if (!isOwner) {
      return Response.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const audit = auditRow;
    const findings = await getFindingsForAudit(id);

    const signedFindings = await Promise.all(
      findings.map(async (f) => {
        let cropUrl = null;
        let fullUrl = null;
        if (f.screenshot_crop_url) {
          try {
            cropUrl = await createSignedUrl(
              f.screenshot_crop_url.replace(/^.*\/evidence\//, "")
            );
          } catch {
            cropUrl = f.screenshot_crop_url;
          }
        }
        if (f.full_screenshot_url) {
          try {
            fullUrl = await createSignedUrl(
              f.full_screenshot_url.replace(/^.*\/evidence\//, "")
            );
          } catch {
            fullUrl = f.full_screenshot_url;
          }
        }
        return { ...f, screenshot_crop_url: cropUrl, full_screenshot_url: fullUrl };
      })
    );

    let reportUrl = null;
    if (audit.report_path) {
      try {
        reportUrl = await createSignedUrl(
          audit.report_path.replace(/^.*\/evidence\//, "")
        );
      } catch {
        // Report not available
      }
    }

    return Response.json({
      audit,
      findings: signedFindings,
      reportUrl,
    });
  } catch {
    return Response.json(
      { error: "Report not found" },
      { status: 404 }
    );
  }
}
