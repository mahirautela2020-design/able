import { supabase, createSignedUrl, getAudit } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { getClientIp } from "@/lib/http";
import { buildReportHtml } from "@/lib/report";

export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * GET /api/audits/:id/pdf — returns the audit report as a 16:9 landscape PDF.
 *
 * Why PDF is generated here (server-side) rather than client-side:
 * - The stored report_path is an interactive HTML report (expandable
 *   findings, per-SC matrix) — ideal for on-screen review.
 * - For distribution, we render that same HTML through headless Chromium
 *   (Playwright, already a dependency) and print to a 16:9 page so the
 *   PDF is a faithful, slide-ready export of the same content.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Isolation: PDF exports are private. Owner-scoped, matching the check
    // in /api/audits/[id]/report and /api/audits/[id]/sr-preview — a missing
    // audit and an audit that exists but isn't yours get the SAME 401 so a
    // caller can't enumerate valid audit ids by probing for 404 vs 401.
    let auditRow: Awaited<ReturnType<typeof getAudit>> | null = null;
    try {
      auditRow = await getAudit(id);
    } catch {
      auditRow = null;
    }
    if (!auditRow) {
      return Response.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const auth = await requireSession(request);
    const reqIp = getClientIp(request);
    const isOwner = auth.ok
      ? auditRow.created_by
        ? auditRow.created_by === auth.userId
        : !!reqIp && auditRow.created_ip === reqIp
      : !!reqIp && auditRow.created_ip === reqIp;
    if (!isOwner) {
      return Response.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    // Regenerate the report HTML from the DB (same builder the pipeline uses)
    const html = await buildReportHtml(id);

    const { data: findings } = await supabase
      .from("findings")
      .select("*")
      .eq("audit_id", id);

    // Resolve signed URLs for evidence images so they render in the PDF
    const signedHtml = await resolveSignedUrls(
      html,
      (findings || []).map((f: { screenshot_crop_url?: string | null; full_screenshot_url?: string | null }) => [
        f.screenshot_crop_url,
        f.full_screenshot_url,
      ])
    );

    // Lazy-require playwright chromium so this route stays cold-friendly
    const { chromium } = await import("playwright-core");
    const chromiumPkg = await import("@sparticuz/chromium");

    const isVercel = !!process.env.VERCEL;
    const browser = await chromium.launch({
      args: isVercel ? chromiumPkg.default.args : ["--no-sandbox", "--disable-dev-shm-usage"],
      ...(isVercel
        ? { executablePath: await chromiumPkg.default.executablePath() }
        : { executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined }),
    });

    try {
      const page = await browser.newPage();
      // 16:9 landscape page (1280x720 CSS px)
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.setContent(signedHtml, { waitUntil: "networkidle" });

      const pdf = await page.pdf({
        width: "1280px",
        height: "720px",
        printBackground: true,
        margin: { top: "32px", bottom: "32px", left: "48px", right: "48px" },
      });

      // Convert Buffer → Uint8Array for the Response body (Node 18+ typing)
      const body = new Uint8Array(pdf);
      return new Response(body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="able-report-${id.slice(0, 8)}.pdf"`,
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    const message = (e as Error).message;
    console.error("PDF generation failed:", message);
    return Response.json(
      { error: `PDF generation failed: ${message}` },
      { status: 500 }
    );
  }
}

/** Replace evidence paths in the report HTML with signed URLs. */
async function resolveSignedUrls(
  html: string,
  urlPairs: [string | null | undefined, string | null | undefined][]
): Promise<string> {
  let out = html;
  for (const [crop, full] of urlPairs) {
    for (const u of [crop, full]) {
      if (!u) continue;
      const path = u.replace(/^.*\/evidence\//, "");
      try {
        const signed = await createSignedUrl(path);
        if (signed) out = out.split(u).join(signed);
      } catch {
        // leave as-is
      }
    }
  }
  return out;
}
