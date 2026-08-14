import sharp from "sharp";
import { withPage } from "@/engine/browser";
import { getAudit, getAuditPageId, insertFindings, uploadEvidence } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { contrastRatio, contrastVerdict } from "@/lib/contrast";
import { buildContrastFinding } from "@/lib/audit/contrast-finding";

export const runtime = "nodejs";
export const maxDuration = 30;

function getClientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? null;
}

interface ContrastFindingBody {
  pageUrl?: string;
  selector?: string;
  elementHtml?: string;
  fg?: string;
  bg?: string;
  hasText?: boolean;
  bbox?: { x: number; y: number; width: number; height: number };
  viewport?: { width: number; height: number };
}

function isBbox(v: unknown): v is { x: number; y: number; width: number; height: number } {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.x === "number" &&
    typeof b.y === "number" &&
    typeof b.width === "number" &&
    typeof b.height === "number"
  );
}

function isViewport(v: unknown): v is { width: number; height: number } {
  if (!v || typeof v !== "object") return false;
  const vp = v as Record<string, unknown>;
  return typeof vp.width === "number" && typeof vp.height === "number";
}

/**
 * POST /api/audits/[id]/contrast-finding — persist a Contrast Lab pick as a
 * real finding (1.4.3 / 1.4.11), with crop evidence, so it shows up in the
 * report instead of only the live Explore session.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // Same owner-scoped auth pattern as /api/audits/[id]/sr-preview: a valid
  // session, or an anonymous request whose IP matches the audit's creator IP
  // — Contrast Lab is reachable from the main (anonymous-friendly) workbench,
  // so it shouldn't hard-require sign-in the way the NVDA run route does.
  const auth = await requireSession(request);
  if (!auth.ok) {
    const reqIp = getClientIp(request);
    if (!reqIp || audit.created_ip !== reqIp) {
      return Response.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }
  }

  const body = (await request.json().catch(() => ({}))) as ContrastFindingBody;
  const { selector, elementHtml, fg, bg, hasText, bbox, viewport, pageUrl } = body;

  if (!selector || !fg || !bg || !bbox) {
    return Response.json(
      { error: "selector, fg, bg, and bbox are required" },
      { status: 400 }
    );
  }
  if (!isBbox(bbox)) {
    return Response.json({ error: "bbox {x,y,width,height} is required" }, { status: 400 });
  }

  // Server-computed ratio/verdict — never trust a client-posted number. Only
  // an actual AA failure is eligible to become a finding; a passing pair is
  // not a violation and this route refuses to fabricate one.
  let ratio: number;
  try {
    ratio = contrastRatio(fg, bg);
  } catch {
    return Response.json({ error: "Unparseable fg/bg color" }, { status: 400 });
  }
  const verdict = contrastVerdict(ratio);
  if (verdict.passesAA) {
    return Response.json(
      { error: "This pair already passes AA — nothing to flag" },
      { status: 400 }
    );
  }

  let pageId: string | null;
  try {
    pageId = await getAuditPageId(auditId, pageUrl || audit.target_url);
  } catch {
    pageId = null;
  }
  if (!pageId) {
    return Response.json({ error: "No scanned page found for this audit" }, { status: 404 });
  }

  const computed = buildContrastFinding({
    auditId,
    pageId,
    selector,
    elementHtml: elementHtml ?? null,
    fg,
    bg,
    hasText: hasText === true,
  });

  // Re-navigate and crop a fresh evidence screenshot around the picked
  // element, at the same viewport the user was looking at. Best-effort: if
  // the browser/screenshot step fails, the finding is still persisted
  // without a crop rather than losing the flag entirely.
  let cropUrl: string | null = null;
  try {
    const vp = isViewport(viewport) ? viewport : { width: 1440, height: 900 };
    const targetUrl = pageUrl || audit.target_url;

    const screenshot = await withPage(
      async (page) => {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
        return page.screenshot({ animations: "disabled" });
      },
      { viewport: vp }
    );

    const left = Math.min(Math.max(0, Math.round(bbox.x - 30)), vp.width - 1);
    const top = Math.min(Math.max(0, Math.round(bbox.y - 30)), vp.height - 1);
    const cropWidth = Math.max(1, Math.min(vp.width - left, Math.round(bbox.width + 60)));
    const cropHeight = Math.max(1, Math.min(vp.height - top, Math.round(bbox.height + 60)));

    const cropped = await sharp(screenshot)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .webp({ quality: 80 })
      .toBuffer();

    const path = `${auditId}/contrast-lab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    cropUrl = await uploadEvidence(cropped, path);
  } catch {
    cropUrl = null;
  }

  try {
    await insertFindings([
      {
        ...computed.row,
        screenshot_crop_url: cropUrl,
        full_screenshot_url: null,
      },
    ]);
  } catch {
    return Response.json({ error: "Failed to save finding" }, { status: 500 });
  }

  return Response.json(
    {
      ok: true,
      criterion: computed.criterion,
      ratio: computed.ratio,
      apcaLc: computed.apcaLc,
      severity: computed.row.severity,
      screenshotCropUrl: cropUrl,
    },
    { status: 201 }
  );
}
