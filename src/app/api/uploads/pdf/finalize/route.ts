import { parsePdf, PdfParseError } from "@/lib/pdf/parse";
import { runPdfChecks, type PdfFinding } from "@/lib/pdf/checks";
import {
  getAudit,
  downloadEvidence,
  insertFindings,
  updateAuditStatus,
} from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { getClientIp } from "@/lib/http";

/**
 * POST /api/uploads/pdf/finalize — step 3 of 3 for a PDF audit.
 *
 * The browser has already uploaded the file directly to Supabase Storage
 * (step 2, bypassing this app's routes entirely — see init/route.ts). This
 * route downloads it server-side, runs the deterministic PDF/UA + WCAG
 * checks, persists findings into the same `findings` table URL audits use
 * (so the workbench renders them with zero special-casing), and marks the
 * audit complete.
 *
 * Every finding is deterministic — no LLM in this path at all, matching the
 * upload route this replaces.
 */

/** Every rule's WCAG SC maps into a matrix badge computed from `bucket`.
 * "violation" is proven by the file's own structure (equivalent to an
 * automated axe failure); "needs_review" mirrors the vision-model bucket
 * used elsewhere — confidence requires human judgement, never fabricated. */
function bucketFor(severity: PdfFinding["severity"]): string {
  return severity === "violation" ? "automated" : "needs_review";
}

function severityFor(severity: PdfFinding["severity"]): string {
  return severity === "violation" ? "serious" : "moderate";
}

/** Short human title from a rule id, e.g. "pdf-figure-missing-alt" →
 * "Figure missing alt". Findings don't carry a separate title field. */
function titleFromRuleId(ruleId: string): string {
  return ruleId
    .replace(/^pdf-/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function POST(request: Request) {
  const auth = await requireSession(request);
  const ip = getClientIp(request);

  try {
    const { auditId } = await request.json();
    if (!auditId || typeof auditId !== "string") {
      return Response.json({ error: "auditId is required" }, { status: 400 });
    }

    let audit;
    try {
      audit = await getAudit(auditId);
    } catch {
      return Response.json({ error: "Audit not found" }, { status: 404 });
    }
    if (audit.platform !== "pdf") {
      return Response.json({ error: "Not a PDF audit" }, { status: 400 });
    }

    const isOwner = auth.ok
      ? audit.created_by
        ? audit.created_by === auth.userId
        : !!ip && audit.created_ip === ip
      : !!ip && audit.created_ip === ip;
    if (!isOwner) {
      return Response.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    // Idempotent: a retried/duplicated finalize call for an already-complete
    // audit just reports the existing state instead of re-analyzing.
    if (audit.status !== "queued") {
      return Response.json({ auditId, status: audit.status });
    }

    const uploadPath = `${auditId}/uploads/source.pdf`;
    const buffer = await downloadEvidence(uploadPath);
    if (!buffer) {
      await updateAuditStatus(auditId, "failed", {
        error_code: "UPLOAD_MISSING",
        error_detail: "The uploaded file could not be found in storage.",
        completed_at: new Date().toISOString(),
      });
      return Response.json({ error: "Uploaded file not found" }, { status: 404 });
    }

    let document;
    try {
      document = await parsePdf(buffer);
    } catch (e) {
      const message = e instanceof PdfParseError ? e.message : "Could not read this PDF.";
      await updateAuditStatus(auditId, "failed", {
        error_code: "PDF_PARSE_FAILED",
        error_detail: message,
        completed_at: new Date().toISOString(),
      });
      return Response.json({ error: message }, { status: 400 });
    }

    const findings = runPdfChecks(document);

    if (findings.length > 0) {
      await insertFindings(
        findings.map((f) => ({
          audit_id: auditId,
          page_id: null,
          bucket: bucketFor(f.severity),
          rule_id: f.ruleId,
          rule_title: titleFromRuleId(f.ruleId),
          wcag_criteria: [f.criterion],
          wcag_criterion: f.criterion,
          wcag_level: null,
          principle: null,
          severity: severityFor(f.severity),
          confidence: f.severity === "violation" ? 1 : 0.6,
          source_engines: ["pdf-static"],
          selector: f.element,
          element_html: null,
          failure_summary: f.message,
          additional_instances: 0,
          screenshot_crop_url: null,
          full_screenshot_url: null,
          recommendation: f.remediation,
          // Matterhorn checkpoint + W3C technique aren't their own DB columns
          // — kept alongside the rule's own evidence so the report/workbench
          // can still cite them without a schema change.
          evidence: { ...f.evidence, matterhorn: f.matterhorn, technique: f.technique },
          engine_version: "pdfjs-dist",
        }))
      );
    }

    const violations = findings.filter((f) => f.severity === "violation").length;

    await updateAuditStatus(auditId, "complete", {
      completed_at: new Date().toISOString(),
      config: {
        pdf: {
          fileName: audit.target_url,
          fileSizeBytes: (audit.config as { pdf?: { fileSizeBytes?: number } } | null)?.pdf
            ?.fileSizeBytes,
          pdfPath: uploadPath,
          pageCount: document.pageCount,
          pagesAnalyzed: document.pagesAnalyzed,
          truncated: document.pagesAnalyzed < document.pageCount,
          tagged: document.tagged,
          language: document.lang,
          title: document.title,
          displayDocTitle: document.displayDocTitle,
          pdfVersion: document.pdfVersion,
          producer: document.producer,
          pdfUaPart: document.pdfUaPart,
          encrypted: document.encrypted,
          hasAcroForm: document.hasAcroForm,
          hasXfa: document.hasXfa,
          outlineCount: document.outlineCount,
          violations,
          needsReview: findings.length - violations,
        },
      },
    });

    return Response.json({ auditId, status: "complete" });
  } catch (e) {
    console.error("POST /api/uploads/pdf/finalize error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
