import { getFindingsForAudit, getAudit } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { getClientIp } from "@/lib/http";
import { buildVPAT, vpatToCsv, vpatToJson } from "@/lib/vpat/builder";
import type { Finding } from "@/engine/axe-scan";

export async function GET(request: Request) {
  // requireSession only proves *a* session exists. The actual guard is the
  // ownership check below -- without it, any signed-in caller could export
  // full findings (rule ids, selectors, element_html, evidence) for ANY
  // audit on the platform by supplying its id, not just their own.
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;
  const ip = getClientIp(request);

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

    let auditRow;
    try {
      auditRow = await getAudit(auditId);
    } catch {
      return Response.json({ error: "Audit not found" }, { status: 404 });
    }
    const isOwner = auditRow.created_by
      ? auth.ok && auditRow.created_by === auth.userId
      : !!ip && auditRow.created_ip === ip;
    if (!isOwner) {
      return Response.json(
        { error: "You don't have permission to export this audit" },
        { status: 403 }
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
