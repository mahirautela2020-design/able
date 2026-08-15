import {
  supabase,
  uploadEvidence,
} from "@/lib/supabase/server";
import { computeComplianceMatrix } from "@/engine/normalize";
import { resolveModuleIds, getModuleWcagCoverage } from "@/lib/audit-modules";

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

  // Same module set the scan actually ran with — an audit's report must not
  // claim a module-gated SC "passed" when that module was never enabled.
  const configuredModules = (audit.config as { modules?: string[] } | null)?.modules;
  const moduleIds = resolveModuleIds(configuredModules);
  const coveredScIds = getModuleWcagCoverage(moduleIds);
  const matrix = computeComplianceMatrix(findings || [], coveredScIds);

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
    const statusBadge: Record<string, { label: string; cls: string }> = {
      "automated-pass": { label: "Pass", cls: "badge-pass" },
      fail: { label: "Fail", cls: "badge-fail" },
      "needs-review": { label: "Needs review", cls: "badge-review" },
      manual: { label: "Manual check", cls: "badge-manual" },
      "not-applicable": { label: "N/A", cls: "badge-na" },
    };
    const badge = statusBadge[sc.status];
    rows.push(
      `<tr>
        <td>${sc.id}</td>
        <td>${sc.name}</td>
        <td>${sc.level}</td>
        <td>${sc.principle}</td>
        <td>${badge ? `<span class="badge ${badge.cls}">${badge.label}</span>` : sc.status}</td>
        <td>${sc.findingsCount}</td>
      </tr>`
    );
  }

  // Findings + evidence, merged into one entry per finding — a finding and
  // its screenshot are one fact, not two ("here's what's wrong" and "here's
  // proof" belong together, not in separate sections a reader has to cross-
  // reference by WCAG number). Entries with a screenshot get their own 16:9
  // print page; entries without one (most needs-review/keyboard findings —
  // there's nothing to crop a screenshot of) render as a compact row.
  // screenshot_crop_url/full_screenshot_url are emitted as the RAW stored
  // path (not a signed URL) — the PDF route's resolveSignedUrls() does a
  // string substitution pass over this same HTML afterward, replacing each
  // raw path with a short-lived signed URL so the image actually loads.
  function findingEntryHtml(f: NonNullable<typeof findings>[number]): string {
    const imgUrl = f.screenshot_crop_url || f.full_screenshot_url;
    return `<div class="finding-entry${imgUrl ? " has-evidence" : ""}">
        <h3>
          <span class="badge badge-severity-${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span>
          ${escapeHtml(f.rule_title)}
          <span class="evidence-sc">${escapeHtml(f.wcag_criterion || "best-practice")}</span>
        </h3>
        <p class="meta">${escapeHtml(f.selector || "")} · ${escapeHtml(f.bucket)}</p>
        <p>${escapeHtml(f.failure_summary || "")}</p>
        ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="Screenshot evidence for ${escapeHtml(f.rule_title)}" class="evidence-img">` : `<p class="meta">No screenshot captured for this finding.</p>`}
      </div>`;
  }

  // Grouped by severity (worst first) so a reader triages critical issues
  // before scrolling past dozens of minor ones — DB insertion order has no
  // relationship to importance.
  const SEVERITY_ORDER = ["critical", "serious", "moderate", "minor"] as const;
  const SEVERITY_LABEL: Record<string, string> = {
    critical: "Critical",
    serious: "Serious",
    moderate: "Moderate",
    minor: "Minor",
  };
  const findingsBySeverity = new Map<string, NonNullable<typeof findings>>();
  for (const f of findings || []) {
    const key = f.severity || "other";
    if (!findingsBySeverity.has(key)) findingsBySeverity.set(key, []);
    findingsBySeverity.get(key)!.push(f);
  }
  const severityKeysInOrder = [
    ...SEVERITY_ORDER.filter((s) => findingsBySeverity.has(s)),
    ...[...findingsBySeverity.keys()].filter((s) => !(SEVERITY_ORDER as readonly string[]).includes(s)),
  ];

  const findingsGroups: string[] = [];
  for (const key of severityKeysInOrder) {
    const group = findingsBySeverity.get(key)!;
    const anchor = `findings-${key}`;
    findingsGroups.push(
      `<h3 id="${anchor}" class="findings-group-heading">${escapeHtml(SEVERITY_LABEL[key] || key)} (${group.length})</h3>` +
        group.map(findingEntryHtml).join("")
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
    .finding-entry { padding: 1rem 0; border-bottom: 1px solid #e5e5e5; }
    .finding-entry.has-evidence { page-break-before: always; padding-top: 1rem; border-bottom: none; }
    .finding-entry h3 { font-size: 1.1rem; margin-bottom: 0.25rem; font-weight: 600; }
    .evidence-sc { font-family: monospace; font-weight: 400; color: #666; font-size: 0.85rem; }
    .evidence-img { max-width: 100%; max-height: 480px; object-fit: contain; border: 1px solid #e5e5e5; border-radius: 4px; margin-top: 0.5rem; }
    .badge { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
    .badge-pass { background: #dcfce7; color: #15803d; }
    .badge-fail { background: #fee2e2; color: #b91c1c; }
    .badge-review { background: #fef9c3; color: #a16207; }
    .badge-manual { background: #e0e7ff; color: #4338ca; }
    .badge-na { background: #f3f4f6; color: #6b7280; }
    .badge-severity-critical { background: #fee2e2; color: #b91c1c; }
    .badge-severity-serious { background: #ffedd5; color: #c2410c; }
    .badge-severity-moderate { background: #fef9c3; color: #a16207; }
    .badge-severity-minor { background: #dbeafe; color: #1d4ed8; }
    .findings-group-heading { font-size: 1rem; font-weight: 700; margin-top: 1.5rem; color: #374151; }
    .toc { margin: 1.5rem 0; padding: 1rem 1.25rem; background: #f9f9f9; border-radius: 6px; page-break-after: always; }
    .toc h2 { margin-top: 0; border-bottom: none; padding-bottom: 0; }
    .toc ul { margin: 0; padding-left: 1.25rem; }
    .toc li { margin: 0.25rem 0; }
    .toc a { color: #2563eb; text-decoration: none; }
    .toc a:hover { text-decoration: underline; }
    .toc .toc-sub { padding-left: 1.25rem; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1>Accessibility Audit Report</h1>
  <p class="meta">
    URL: ${escapeHtml(audit.target_url)}<br>
    Date: ${new Date(audit.created_at).toISOString().split("T")[0]}<br>
    Standard: WCAG 2.2 | Status: ${audit.status}
  </p>

  <nav class="toc">
    <h2>Contents</h2>
    <ul>
      <li><a href="#summary">Executive Summary</a></li>
      <li><a href="#findings">Findings (${(findings || []).length})</a>
        ${severityKeysInOrder.length > 0 ? `<ul class="toc-sub">${severityKeysInOrder
          .map(
            (key) =>
              `<li><a href="#findings-${key}">${escapeHtml(SEVERITY_LABEL[key] || key)} (${findingsBySeverity.get(key)!.length})</a></li>`
          )
          .join("")}</ul>` : ""}
      </li>
      <li><a href="#matrix">WCAG 2.2 Compliance Matrix</a></li>
    </ul>
  </nav>

  <h2 id="summary">Executive Summary</h2>
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

  <h2 id="findings">Findings</h2>
  ${findingsGroups.length > 0 ? findingsGroups.join("") : "<p>No findings recorded for this audit.</p>"}

  <h2 id="matrix">WCAG 2.2 Compliance Matrix</h2>
  <table>
    <thead><tr><th>Success Criterion</th><th>Name</th><th>Level</th><th>Principle</th><th>Status</th><th>Findings</th></tr></thead>
    <tbody>${rows.join("")}</tbody>
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
