import { insertAudit, createSignedUploadUrl, countAuditsByIp } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { getClientIp } from "@/lib/http";

const ANON_DAILY_LIMIT = parseInt(process.env.ANON_DAILY_LIMIT || "5", 10);

// The only hard ceiling is Supabase Storage's own per-file limit, not
// Vercel's ~4.3MB function body cap — this route never receives the file
// itself, only a { fileName, fileSize } declaration, so it can honor a real
// 25MB limit. Matches the retention story: PDFs are deleted with the rest of
// the audit within 24h (AUDIT_RETENTION_HOURS), so a larger transient upload
// isn't a storage-growth concern.
const MAX_PDF_MB = 25;

/**
 * POST /api/uploads/pdf/init — step 1 of 3 for a PDF audit.
 *
 * Creates the audit row (platform="pdf", status="queued") and mints a
 * Supabase Storage signed UPLOAD url. The browser then PUTs the file
 * directly to Supabase (see audit-input.tsx) — this route's own response
 * body is tiny, so it never touches the platform's request-body ceiling.
 * Step 2 is the direct browser→Supabase upload; step 3 is
 * POST /api/uploads/pdf/finalize, which downloads and analyzes it
 * server-side (no body-size limit applies there either — it reads a path).
 */
export async function POST(request: Request) {
  const auth = await requireSession(request);
  const ip = getClientIp(request);

  try {
    const { fileName, fileSize } = await request.json();

    if (!fileName || typeof fileName !== "string" || !fileName.toLowerCase().endsWith(".pdf")) {
      return Response.json({ error: "A .pdf file name is required" }, { status: 400 });
    }
    if (typeof fileSize !== "number" || fileSize <= 0) {
      return Response.json({ error: "fileSize is required" }, { status: 400 });
    }
    if (fileSize > MAX_PDF_MB * 1024 * 1024) {
      return Response.json(
        {
          error: `File too large: ${(fileSize / (1024 * 1024)).toFixed(1)}MB exceeds the ${MAX_PDF_MB}MB limit.`,
        },
        { status: 413 }
      );
    }

    // Same free-tier policy as URL audits: 5/day per IP, then ask to sign up.
    if (!auth.ok && ip) {
      const used = await countAuditsByIp(ip);
      if (used >= ANON_DAILY_LIMIT) {
        return Response.json(
          {
            error: `You've used your ${ANON_DAILY_LIMIT} free audits for today. Create a free account to keep auditing.`,
            code: "ANON_LIMIT_REACHED",
            redirectTo: "/auth",
          },
          { status: 429 }
        );
      }
    }

    const auditId = await insertAudit(
      fileName,
      { pdf: { fileName, fileSizeBytes: fileSize } },
      { userId: auth.ok ? auth.userId : null, ip },
      "pdf"
    );

    const uploadPath = `${auditId}/uploads/source.pdf`;
    const { path, token } = await createSignedUploadUrl(uploadPath);

    return Response.json({ auditId, path, token }, { status: 201 });
  } catch (e) {
    console.error("POST /api/uploads/pdf/init error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
