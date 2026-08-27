import { getAudit, getFindingsForAudit, createSignedUrl } from "@/lib/supabase/server";
import { Workbench } from "@/components/workbench/workbench";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Workbench — ScanA11y",
};

export default async function WorkbenchPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;

  let audit;
  let findings;
  try {
    audit = await getAudit(auditId);
    findings = await getFindingsForAudit(auditId);
  } catch {
    notFound();
  }

  if (!audit) notFound();

  // Sign evidence URLs (storage paths need short-lived signed URLs to view)
  const sign = async (path: string | null): Promise<string | null> => {
    if (!path) return null;
    try {
      return await createSignedUrl(path.replace(/^.*\/evidence\//, ""));
    } catch {
      return path;
    }
  };

  const signedFindings = await Promise.all(
    (findings || []).map(async (f) => ({
      id: f.id,
      bucket: f.bucket,
      rule_id: f.rule_id,
      rule_title: f.rule_title,
      wcag_criterion: f.wcag_criterion,
      wcag_level: f.wcag_level,
      principle: f.principle,
      severity: f.severity,
      selector: f.selector,
      failure_summary: f.failure_summary,
      screenshot_crop_url: await sign(f.screenshot_crop_url),
      full_screenshot_url: await sign(f.full_screenshot_url),
    }))
  );

  const pdfPath = (audit.config as { pdf?: { pdfPath?: string } } | null)?.pdf?.pdfPath ?? null;
  const pdfPreviewUrl = pdfPath ? await sign(pdfPath) : null;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 min-h-0">
        <Workbench
          auditId={auditId}
          targetUrl={audit.target_url}
          auditStatus={audit.status}
          findings={signedFindings}
          platform={audit.platform}
          pdfPreviewUrl={pdfPreviewUrl}
        />
      </div>
    </div>
  );
}
