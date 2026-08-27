import { parsePdf, PdfParseError } from "@/lib/pdf/parse";
import { runPdfChecks, summarizeStructure } from "@/lib/pdf/checks";
import { PDF_GUIDED_CHECKLIST } from "@/lib/pdf/guided-checklist";

// Vercel's serverless functions hard-cap the request body at ~4.3MB
// (platform-level, not adjustable). Anything larger than this is rejected by
// the platform before this route ever runs, with a plain-text response the
// client can't parse as JSON — so this must stay under that ceiling, with
// margin for multipart overhead, or uploads fail with an opaque error no
// matter what this route does. The client checks file size before uploading
// so most users never round-trip a doomed request at all (see audit-input.tsx).
const MAX_PDF_MB = 4;

/** Some browsers/OSes send an empty or generic type for .pdf; fall back to the
 * extension rather than rejecting a legitimate upload. */
const ALLOWED_TYPES = new Set(["application/pdf", "application/x-pdf", ""]);

/**
 * POST /api/uploads/pdf — PDF/UA + WCAG accessibility audit of a PDF document.
 *
 * Every finding is deterministic: it comes from what the file's own structure
 * declares (tag tree, catalog entries, annotation dictionaries), checked
 * against the Matterhorn Protocol's machine-checkable conditions and the W3C
 * PDF Techniques. No vision model or LLM participates in this path at all, so
 * nothing here can be a hallucinated violation — and the conditions that need
 * human judgement are returned as a guided checklist rather than pretended
 * results.
 *
 * Like /api/uploads/image (and unlike the APK/IPA routes) this is a stateless
 * one-shot: nothing is persisted, there is no auditId and no ownership to
 * protect, so no session is required — matching the free-tier policy used for
 * URL audits.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "File is required" }, { status: 400 });
    }

    const looksLikePdf =
      ALLOWED_TYPES.has(file.type) || file.name.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) {
      return Response.json(
        { error: `Unsupported type ${file.type || "unknown"}. Upload a PDF document.` },
        { status: 400 }
      );
    }

    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      return Response.json(
        {
          error: `File too large: ${(file.size / (1024 * 1024)).toFixed(1)}MB exceeds the ${MAX_PDF_MB}MB limit.`,
        },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Cheap magic-number guard before handing bytes to the parser — a
    // mislabelled file should fail fast with a clear message.
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return Response.json(
        { error: "This file isn't a PDF — it doesn't start with a %PDF- header." },
        { status: 400 }
      );
    }

    let document;
    try {
      document = await parsePdf(buffer);
    } catch (e) {
      if (e instanceof PdfParseError) {
        return Response.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    const findings = runPdfChecks(document);
    const violations = findings.filter((f) => f.severity === "violation").length;
    const needsReview = findings.length - violations;

    return Response.json({
      success: true,
      findings,
      guidedChecklist: PDF_GUIDED_CHECKLIST,
      summary: {
        fileName: file.name,
        fileSizeBytes: file.size,
        pageCount: document.pageCount,
        pagesAnalyzed: document.pagesAnalyzed,
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
        needsReview,
        structure: summarizeStructure(document),
        // Stated explicitly so a long document's report never implies it
        // inspected pages it never opened.
        truncated: document.pagesAnalyzed < document.pageCount,
      },
    });
  } catch (e) {
    console.error("POST /api/uploads/pdf error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
