import { getAudit, getFindingsForAudit } from "@/lib/supabase/server";
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

  return (
    <div className="h-[calc(100vh-4rem)]">
      <Workbench
        auditId={auditId}
        targetUrl={audit.target_url}
        auditStatus={audit.status}
        findings={(findings || []).map((f) => ({
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
          screenshot_crop_url: f.screenshot_crop_url,
        }))}
      />
    </div>
  );
}
