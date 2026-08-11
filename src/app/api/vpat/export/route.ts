import { getFindingsForAudit } from "@/lib/supabase/server";
import { buildVPAT, vpatToCsv, vpatToJson } from "@/lib/vpat/builder";
import type { Finding } from "@/engine/axe-scan";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const auditId = searchParams.get("auditId");
    const format = searchParams.get("format") || "json";

    if (!auditId) {
      return Response.json(
        { error: "auditId query parameter is required" },
        { status: 400 }
      );
    }

    let findings: Finding[] = [];
    try {
      const rows = await getFindingsForAudit(auditId);
      findings = (rows || []).map(
        (r: Record<string, unknown>) =>
          ({
            bucket: r.bucket,
            rule_id: r.rule_id,
            rule_title: r.rule_title,
            wcag_criteria: r.wcag_criteria,
            wcag_criterion: r.wcag_criterion,
            wcag_level: r.wcag_level,
            principle: r.principle,
            severity: r.severity,
            confidence: r.confidence,
            source_engines: r.source_engines,
            selector: r.selector,
            element_html: r.element_html,
            failure_summary: r.failure_summary,
            additional_instances: r.additional_instances,
            bbox: null,
            evidence: r.evidence,
            engine_version: r.engine_version,
          }) as Finding
      );
    } catch {
      return Response.json(
        { error: "Audit not found or database unavailable" },
        { status: 404 }
      );
    }

    const vpat = buildVPAT({ findings, maturity: null });

    if (format === "csv") {
      const csv = vpatToCsv(vpat);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="vpat-${auditId}.csv"`,
        },
      });
    }

    return Response.json(vpatToJson(vpat));
  } catch {
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
