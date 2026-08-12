import {
  supabase,
  uploadEvidence,
} from "@/lib/supabase/server";
import { computeComplianceMatrix } from "@/engine/normalize";

export async function buildAndStoreReport(
  auditId: string
): Promise<void> {
  const html = await buildReportHtml(auditId);

  const reportPath = `${auditId}/report-${auditId}.html`;
  await uploadEvidence(
    Buffer.from(html, "utf-8"),
    reportPath,
    "text/html"
  );

  const { error } = await supabase
    .from("audits")
    .update({ report_path: reportPath })
    .eq("id", auditId);

  if (error) throw error;
}

/** Fetch audit + findings and build the full report HTML string. */
export async function buildReportHtml(auditId: string): Promise<string> {
  const { data: audit } = await supabase
    .from("audits")
    .select("*")
    .eq("id", auditId)
    .single();

  const { data: findings } = await supabase
    .from("findings")
    .select("*")
    .eq("audit_id", auditId);

  if (!audit) return "<html><body><h1>Audit not found</h1></body></html>";

  const matrix = computeComplianceMatrix(findings || []);

  const automated = (findings || []).filter(
    (f) => f.bucket === "automated"
  );
  const needsReview = (findings || []).filter(
    (f) => f.bucket === "needs_review"
  );
  const behavior = (findings || []).filter(
    (f) => f.bucket === "behavior"
  );
  const bestPractice = (findings || []).filter(
    (f) => f.bucket === "best-practice"
  );

  const severityCounts = {
    critical: automated.filter((f) => f.severity === "critical").length,
    serious: automated.filter((f) => f.severity === "serious").length,
    moderate: automated.filter((f) => f.severity === "moderate").length,
    minor: automated.filter((f) => f.severity === "minor").length,
  };

  const rows: string[] = [];
  for (const sc of matrix.sc) {
    const statusIcon: Record<string, string> = {
      "automated-pass": "✅",
      fail: "❌",
      "needs-review": "👁️",
      manual: "🖐️",
      "not-applicable": "N/A",
    };
    rows.push(
      `<tr>
        <td>${sc.id}</td>
        <td>${sc.name}</td>
        <td>${sc.level}</td>
        <td>${sc.principle}</td>
        <td>${statusIcon[sc.status] || sc.status}</td>
        <td>${sc.findingsCount}</td>
      </tr>`
    );
  }

  const findingsRows: string[] = [];
  for (const f of findings || []) {
    findingsRows.push(
      `<tr>
        <td>${f.severity}</td>
        <td>${f.wcag_criterion || "best-practice"}</td>
        <td>${f.rule_title}</td>
        <td>${f.failure_summary}</td>
        <td>${f.bucket}</td>
      </tr>`
    );
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ScanA11y Audit Report — ${escapeHtml(audit.target_url)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 960px; margin: 0 auto; padding: 2rem; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.25rem; margin-top: 2rem; border-bottom: 2px solid #e5e5e5; padding-bottom: 0.5rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.875rem; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #e5e5e5; }
    th { background: #f9f9f9; font-weight: 600; }
    .score { font-size: 3rem; font-weight: 700; }
    .meta { color: #666; font-size: 0.875rem; }
    .critical { color: #dc2626; }
    .serious { color: #ea580c; }
    .moderate { color: #ca8a04; }
    .minor { color: #2563eb; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e5e5e5; font-size: 0.75rem; color: #999; }
  </style>
</head>
<body>
  <h1>Accessibility Audit Report</h1>
  <p class="meta">
    URL: ${escapeHtml(audit.target_url)}<br>
    Date: ${new Date(audit.created_at).toISOString().split("T")[0]}<br>
    Standard: WCAG 2.2 | Status: ${audit.status}
  </p>

  <h2>Executive Summary</h2>
  <p class="score">${matrix.wcagScore}%</p>
  <p>
    ${severityCounts.critical > 0 ? `<span class="critical">${severityCounts.critical} critical</span>, ` : ""}
    ${severityCounts.serious > 0 ? `<span class="serious">${severityCounts.serious} serious</span>, ` : ""}
    ${severityCounts.moderate > 0 ? `<span class="moderate">${severityCounts.moderate} moderate</span>, ` : ""}
    ${severityCounts.minor > 0 ? `<span class="minor">${severityCounts.minor} minor</span>` : ""}
    ${automated.length === 0 ? "No automated issues found." : ""}
  </p>
  <p>
    ${needsReview.length} needs review · ${behavior.length} keyboard findings · ${bestPractice.length} best-practice
  </p>

  <h2>WCAG 2.2 Compliance Matrix</h2>
  <table>
    <thead><tr><th>SC</th><th>Name</th><th>Level</th><th>Principle</th><th>Status</th><th>Findings</th></tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>

  <h2>Findings</h2>
  <table>
    <thead><tr><th>Severity</th><th>WCAG</th><th>Rule</th><th>Summary</th><th>Bucket</th></tr></thead>
    <tbody>${findingsRows.join("")}</tbody>
  </table>

  <p class="footer">
    Audited with ScanA11y 0.1 — Chromium headless. Fonts and rendering may differ from real browsers.
    Evidence is retained for 30 days. This report is for informational purposes and does not
    constitute legal advice.
  </p>
</body>
</html>`;

  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
