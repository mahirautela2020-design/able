import { getAudit, getFindingsForAudit, createSignedUrl } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const audit = await getAudit(id);
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
