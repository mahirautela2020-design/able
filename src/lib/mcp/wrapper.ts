import { insertAudit, getFindingsForAudit } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

export interface McpStartAuditInput {
  url: string;
  config?: Record<string, unknown>;
}

export interface McpStartAuditOutput {
  auditId: string;
  status: "queued";
}

export interface McpFindingOutput {
  id: string;
  ruleId: string;
  ruleTitle: string;
  wcagCriterion: string | null;
  wcagLevel: string | null;
  severity: string;
  confidence: number;
  selector: string | null;
  elementHtml: string | null;
  failureSummary: string;
  sourceEngines: string[];
}

export interface McpExportReportInput {
  auditId: string;
  format?: "json" | "html";
}

export interface McpExportReportOutput {
  auditId: string;
  format: string;
  findings: McpFindingOutput[];
  summary: {
    total: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
}

export async function startAudit(input: McpStartAuditInput): Promise<McpStartAuditOutput> {
  const auditId = await insertAudit(input.url, input.config || {});
  await inngest.send({
    name: "audit/url",
    data: { auditId, url: input.url },
  });
  return { auditId, status: "queued" };
}

export async function getFindings(
  auditId: string
): Promise<{ auditId: string; findings: McpFindingOutput[] }> {
  const rows = await getFindingsForAudit(auditId);
  const findings = (rows || []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    ruleId: r.rule_id as string,
    ruleTitle: r.rule_title as string,
    wcagCriterion: r.wcag_criterion as string | null,
    wcagLevel: r.wcag_level as string | null,
    severity: r.severity as string,
    confidence: r.confidence as number,
    selector: r.selector as string | null,
    elementHtml: r.element_html as string | null,
    failureSummary: r.failure_summary as string,
    sourceEngines: r.source_engines as string[],
  }));
  return { auditId, findings };
}

export async function exportReport(
  input: McpExportReportInput
): Promise<McpExportReportOutput> {
  const rows = await getFindingsForAudit(input.auditId);
  const findings: McpFindingOutput[] = (rows || []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    ruleId: r.rule_id as string,
    ruleTitle: r.rule_title as string,
    wcagCriterion: r.wcag_criterion as string | null,
    wcagLevel: r.wcag_level as string | null,
    severity: r.severity as string,
    confidence: r.confidence as number,
    selector: r.selector as string | null,
    elementHtml: r.element_html as string | null,
    failureSummary: r.failure_summary as string,
    sourceEngines: r.source_engines as string[],
  }));

  const severityCounts: Record<string, number> = {};
  for (const f of findings) {
    severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
  }

  return {
    auditId: input.auditId,
    format: input.format || "json",
    findings,
    summary: {
      total: findings.length,
      critical: severityCounts["critical"] || 0,
      serious: severityCounts["serious"] || 0,
      moderate: severityCounts["moderate"] || 0,
      minor: severityCounts["minor"] || 0,
    },
  };
}
