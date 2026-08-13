import sharp from "sharp";
import { withPage } from "@/engine/browser";
import { getAudit, getAuditPageId, insertFindings, uploadEvidence } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { sanitizeUrl, validateHost } from "@/lib/ssrf";
import { contrastVerdict, contrastRatio } from "@/lib/contrast";
import { buildContrastFinding } from "@/lib/audit/contrast-finding";

export const runtime = "nodejs";
export const maxDuration = 30;

function getClientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? null;
}

interface Body {
  pageUrl?: unknown;
  selector?: unknown;
  elementHtml?: unknown;
  fg?: unknown;
  bg?: unknown;
  hasText?: unknown;
  bbox?: unknown;
  viewport?: unknown;
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: auditId } = await params;

  let audit;
  try {
    audit = await getAudit(auditId);
  } catch {
    return Response.json({ error: "Audit not found" }, { status: 404 });
  }
  if (!audit) return Response.json({ error: "Audit not found" }, { status: 404 });

  // Same owner-scoped auth pattern as /api/audits/[id]/sr-preview: a valid
  // session, or an anonymous request whose IP matches the audit's creator IP.
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { selector, elementHtml, fg, bg, hasText, bbox, viewport, pageUrl } = body;

  if (typeof fg !== "string" || typeof bg !== "string") {
    return Response.json({ error: "fg and bg colors are required" }, { status: 400 });
  }
  if (typeof selector !== "string" || !selector) {
    return Response.json({ error: "selector is required" }, { status: 400 });
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

  const targetPageUrl = typeof pageUrl === "string" && pageUrl ? pageUrl : audit.target_url;

  let pageId: string | null;
  try {
    pageId = await getAuditPageId(auditId, targetPageUrl);
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
    elementHtml: typeof elementHtml === "string" ? elementHtml : null,
    fg,
    bg,
    hasText: hasText === true,
  });

  // Re-navigate and crop a fresh evidence screenshot around the picked
  // element. Best-effort: if the browser/screenshot step fails, the finding
  // still gets persisted without a crop rather than losing the flag entirely.
  let cropUrl: string | null = null;
  try {
    const parsed = sanitizeUrl(targetPageUrl);
    if (parsed && (parsed.protocol === "http:" || parsed.protocol === "https:")) {
      await validateHost(parsed.hostname);
      const vp = isViewport(viewport) ? viewport : { width: 1440, height: 900 };

      const screenshot = await withPage(
        async (page) => {
          await page.goto(parsed.href, { waitUntil: "domcontentloaded", timeout: 15_000 });
          return page.screenshot({ animations: "disabled" });
        },
        { viewport: vp }
      );

      const left = Math.min(Math.max(0, Math.round(bbox.x - 30)), vp.width - 1);
      const top = Math.min(Math.max(0, Math.round(bbox.y - 30)), vp.height - 1);
      const width = Math.max(1, Math.min(vp.width - left, Math.round(bbox.width + 60)));
      const height = Math.max(1, Math.min(vp.height - top, Math.round(bbox.height + 60)));

      const crop = await sharp(screenshot)
        .extract({ left, top, width, height })
        .webp({ quality: 80 })
        .toBuffer();

      const cropPath = `${auditId}/contrast-lab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
      cropUrl = await uploadEvidence(crop, cropPath);
    }
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

  return Response.json({
    ok: true,
    criterion: computed.criterion,
    ratio: computed.ratio,
    apcaLc: computed.apcaLc,
    severity: computed.severity,
    screenshotCropUrl: cropUrl,
  });
}
