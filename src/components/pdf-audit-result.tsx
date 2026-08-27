"use client";

import type { PdfFinding } from "@/lib/pdf/checks";
import type { PdfChecklistItem } from "@/lib/pdf/guided-checklist";

export interface PdfAuditSummary {
  fileName: string;
  pageCount: number;
  pagesAnalyzed: number;
  tagged: boolean;
  language: string | null;
  title: string | null;
  pdfVersion: string | null;
  pdfUaPart: string | null;
  encrypted: boolean;
  hasAcroForm: boolean;
  hasXfa: boolean;
  outlineCount: number;
  violations: number;
  needsReview: number;
  structure: Record<string, number>;
  truncated: boolean;
}

export interface PdfAuditResultProps {
  summary: PdfAuditSummary;
  findings: PdfFinding[];
  guidedChecklist: PdfChecklistItem[];
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="font-medium text-foreground w-32 shrink-0">{label}</dt>
      <dd className={bad ? "text-destructive font-medium" : ""}>{value}</dd>
    </div>
  );
}

/**
 * Renders a PDF accessibility audit.
 *
 * The split shown here is the honest one: machine-decided findings first
 * (each citing the WCAG criterion, Matterhorn checkpoint, and W3C technique it
 * comes from), then the manual checklist for the roughly one-third of PDF/UA
 * failure conditions no tool can decide.
 */
export function PdfAuditResult({ summary, findings, guidedChecklist }: PdfAuditResultProps) {
  const violations = findings.filter((f) => f.severity === "violation");
  const review = findings.filter((f) => f.severity === "needs_review");

  return (
    <div className="mt-4 space-y-3" data-testid="pdf-audit-result">
      {/* Document facts */}
      <div className="rounded-md border p-3">
        <p className="text-sm font-medium mb-1.5">Document</p>
        <dl className="text-xs space-y-1 text-muted-foreground">
          <Stat label="File" value={summary.fileName} />
          <Stat
            label="Pages"
            value={
              summary.truncated
                ? `${summary.pageCount} (first ${summary.pagesAnalyzed} analysed)`
                : String(summary.pageCount)
            }
          />
          <Stat
            label="Tagged"
            value={summary.tagged ? "Yes" : "No — no structure for assistive tech"}
            bad={!summary.tagged}
          />
          <Stat
            label="Language"
            value={summary.language ?? "Not declared"}
            bad={!summary.language}
          />
          <Stat label="Title" value={summary.title ?? "Not set"} bad={!summary.title} />
          <Stat label="PDF/UA claim" value={summary.pdfUaPart ? `Part ${summary.pdfUaPart}` : "None"} />
          <Stat label="Bookmarks" value={String(summary.outlineCount)} />
          <Stat
            label="Form"
            value={summary.hasXfa ? "XFA (unsupported)" : summary.hasAcroForm ? "AcroForm" : "None"}
            bad={summary.hasXfa}
          />
        </dl>
        {summary.truncated && (
          <p className="text-xs text-amber-600 mt-1.5">
            Only the first {summary.pagesAnalyzed} pages were inspected — findings below say
            nothing about the remaining {summary.pageCount - summary.pagesAnalyzed}.
          </p>
        )}
      </div>

      {/* Findings */}
      <div>
        <p className="text-sm font-medium mb-1.5">
          {violations.length} violation{violations.length === 1 ? "" : "s"} · {review.length} to
          review
        </p>
        <p className="text-xs text-muted-foreground mb-2">
          Checked against PDF/UA-1 (ISO 14289-1) via the Matterhorn Protocol and the W3C PDF
          Techniques. Every finding below is read directly from the file&apos;s own structure — no
          AI model is involved in this audit.
        </p>

        {findings.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No machine-checkable failures found. The manual checklist below still applies.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {findings.map((f, i) => (
              <li
                key={`${f.ruleId}-${i}`}
                className={`text-xs rounded-md p-2 border-l-2 ${
                  f.severity === "violation"
                    ? "bg-destructive/5 border-l-destructive"
                    : "bg-muted/50 border-l-amber-500"
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono font-medium">WCAG {f.criterion}</span>
                  {f.technique && (
                    <span className="font-mono text-muted-foreground">{f.technique}</span>
                  )}
                  {f.matterhorn && (
                    <span className="font-mono text-muted-foreground">
                      Matterhorn {f.matterhorn}
                    </span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      f.severity === "violation"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {f.severity === "violation" ? "violation" : "needs review"}
                  </span>
                </div>
                <p className="mt-1">{f.message}</p>
                <p className="text-muted-foreground mt-1">
                  <span className="font-medium text-foreground">Fix: </span>
                  {f.remediation}
                </p>
                <p className="text-muted-foreground mt-0.5 font-mono text-[10px]">{f.element}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Manual half */}
      <div className="rounded-md border border-dashed p-3">
        <p className="text-sm font-medium mb-1">Manual checks ({guidedChecklist.length})</p>
        <p className="text-xs text-muted-foreground mb-2">
          Of the Matterhorn Protocol&apos;s 136 failure conditions, roughly a third need human
          judgement — no tool can decide whether alt text is <em>accurate</em> or whether the
          reading order is <em>correct</em>. These are steps to perform, not results.
        </p>
        <ol className="list-decimal list-inside space-y-1.5">
          {guidedChecklist.map((step) => (
            <li key={step.id} className="text-xs">
              <span className="font-mono text-muted-foreground">{step.wcagSc}</span>{" "}
              {step.instruction}
              <span className="block ml-4 text-muted-foreground text-[11px] mt-0.5">
                Why manual: {step.whyManual}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
