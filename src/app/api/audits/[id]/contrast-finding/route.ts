import sharp from "sharp";
import { withPage, takeScreenshot } from "@/engine/browser";
import { getAudit, insertFindings, uploadEvidence, supabase } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { contrastRatio, contrastVerdict } from "@/lib/contrast";
import { apcaContrast } from "@/lib/apca";

interface ContrastFindingBody {
  pageId?: string;
  selector?: string;
  elementHtml?: string;
  fg?: string;
  bg?: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

/**
 * POST /api/audits/[id]/contrast-finding — persist a Contrast Lab pick as a
 * real finding (1.4.3 / 1.4.11), with crop evidence, so it shows up in the
 * report instead of only the live Explore session. Auth-gated like the
 * other run/scan routes (NVDA, keyboard) since it re-navigates the target
 * page and takes a screenshot.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  const { id: auditId } = await params;

  let audit: Awaited<ReturnType<typeof getAudit>>;
  try {
    audit = await getAudit(auditId);
  } catch {
    return Response.json({ error: "Audit not found" }, { status: 404 });
  }
  if (!audit) {
    return Response.json({ error: "Audit not found" }, { status: 404 });
  }

  const body = (await request.json()) as ContrastFindingBody;
  const { selector, elementHtml, fg, bg, bbox } = body;
  if (!selector || !fg || !bg || !bbox) {
    return Response.json(
      { error: "selector, fg, bg, and bbox are required" },
      { status: 400 }
    );
  }

  const { data: pages, error: pagesError } = await supabase
    .from("audit_pages")
    .select("id, page_url")
    .eq("audit_id", auditId);
  if (pagesError) throw pagesError;

  const pageRows = (pages || []) as { id: string; page_url: string }[];
  let pageId = body.pageId;
  let pageUrl: string | null = null;

  if (pageId) {
    pageUrl = pageRows.find((p) => p.id === pageId)?.page_url ?? null;
  } else {
    const match =
      pageRows.find((p) => p.page_url === audit.target_url) ?? pageRows[0];
    pageId = match?.id;
    pageUrl = match?.page_url ?? null;
  }

  if (!pageId || !pageUrl) {
    return Response.json(
      { error: "No scanned page found for this audit" },
      { status: 404 }
    );
  }

  // Server-side recompute — never trust a client-posted ratio.
  const ratio = contrastRatio(fg, bg);
  const verdict = contrastVerdict(ratio);
  const apcaLc = apcaContrast(fg, bg);

  const hasText = !!elementHtml?.replace(/<[^>]*>/g, "").trim();
  const wcagCriterion = hasText ? "1.4.3" : "1.4.11";
  const severity =
    verdict.level === "fail" ? "serious" : verdict.level === "AA" ? "moderate" : "minor";

  let screenshotCropUrl: string | null = null;
  try {
    screenshotCropUrl = await withPage(async (page) => {
      await page.goto(pageUrl!, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const screenshot = await takeScreenshot(page);
      const metadata = await sharp(screenshot).metadata();
      const width = metadata.width || 1440;
      const height = metadata.height || 20_000;

      const left = Math.min(Math.max(0, Math.round(bbox.x - 30)), width - 1);
      const top = Math.min(Math.max(0, Math.round(bbox.y - 30)), height - 1);
      const cropWidth = Math.max(1, Math.min(width - left, Math.round(bbox.width + 60)));
      const cropHeight = Math.max(1, Math.min(height - top, Math.round(bbox.height + 60)));

      const cropped = await sharp(screenshot)
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .webp({ quality: 80 })
        .toBuffer();

      const path = `${auditId}/contrast-lab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
      return uploadEvidence(cropped, path);
    });
  } catch {
    // Evidence capture is best-effort — still persist the finding without a crop.
    screenshotCropUrl = null;
  }

  const findingRow = {
    audit_id: auditId,
    page_id: pageId,
    bucket: "automated",
    rule_id: "contrast-lab-flag",
    rule_title: hasText
      ? "Contrast Lab: text contrast flagged"
      : "Contrast Lab: non-text contrast flagged",
    wcag_criteria: [`wcag${wcagCriterion.replace(/\./g, "")}`],
    wcag_criterion: wcagCriterion,
    wcag_level: "AA",
    principle: "Perceivable",
    severity,
    confidence: 1,
    source_engines: ["contrast-lab"],
    selector,
    element_html: elementHtml ?? null,
    failure_summary: `${fg} on ${bg} — ${ratio.toFixed(2)}:1 (${
      verdict.level === "fail" ? "fails AA" : `passes ${verdict.level}`
    })`,
    additional_instances: 0,
    screenshot_crop_url: screenshotCropUrl,
    full_screenshot_url: null,
    recommendation: null,
    evidence: { fg, bg, ratio, apcaLc },
    engine_version: null,
  };

  await insertFindings([findingRow]);

  return Response.json(
    { success: true, ratio, verdict, apcaLc, wcagCriterion, screenshotCropUrl },
    { status: 201 }
  );
}
