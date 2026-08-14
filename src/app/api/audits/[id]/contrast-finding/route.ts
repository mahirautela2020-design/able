import sharp from "sharp";
import { withPage } from "@/engine/browser";
import { getAudit, getAuditPageId, insertFindings, uploadEvidence } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { sanitizeUrl, validateHost } from "@/lib/ssrf";
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

  // Fetch the audit up front — needed either way (existence check, and the
  // anonymous-auth IP fallback below) — but its outcome must not leak to an
  // unauthenticated caller as a distinguishable signal from "wrong IP" (see
  // the auth block below), or an unauthenticated caller could enumerate
  // valid audit ids by probing for 404 vs 401.
  let audit: Awaited<ReturnType<typeof getAudit>> | null = null;
  try {
    audit = await getAudit(auditId);
  } catch {
    audit = null;
  }

  // Same owner-scoped auth pattern as /api/audits/[id]/sr-preview: a valid
  // session, or an anonymous request whose IP matches the audit's creator IP
  // — Contrast Lab is reachable from the main (anonymous-friendly) workbench,
  // so it shouldn't hard-require sign-in the way the NVDA run route does.
  // A missing audit and a wrong-IP audit get the SAME 401 here so an
  // unauthenticated caller can't distinguish "doesn't exist" from "exists,
  // not yours" by response code.
  const auth = await requireSession(request);
  if (!auth.ok) {
    const reqIp = getClientIp(request);
    if (!audit || !reqIp || audit.created_ip !== reqIp) {
      return Response.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }
  }

  // Only a caller with a valid session (any session, not just this audit's
  // owner) gets an accurate existence check — the anonymous path already
  // returned above for a missing audit.
  if (!audit) {
    return Response.json({ error: "Audit not found" }, { status: 404 });
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

  // SSRF guard: the page the browser is about to navigate to may be
  // client-supplied (pageUrl) — validate it exactly like every other route
  // that navigates a URL (preview-proxy, explore/ax-snapshot). This also
  // closes off the disconnected demo-fixture route (pageUrl="/explore-demo.html",
  // a relative path) rather than letting it fail silently deep inside a
  // best-effort try/catch further down.
  const resolvedPageUrl = pageUrl || audit.target_url;
  const parsedUrl = sanitizeUrl(resolvedPageUrl);
  if (!parsedUrl) {
    return Response.json({ error: "Invalid or unsafe page URL" }, { status: 400 });
  }
  try {
    await validateHost(parsedUrl.hostname);
  } catch (e) {
    return Response.json(
      { error: `URL rejected: ${(e as Error).message}` },
      { status: 400 }
    );
  }

  let pageId: string | null;
  try {
    pageId = await getAuditPageId(auditId, resolvedPageUrl);
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
  // element, at the same viewport the user was looking at. fullPage capture
  // (not just the current viewport) so elements below the fold still crop
  // correctly; the real captured dimensions are read back via sharp rather
  // than assumed from the viewport, since a full-page capture is taller than
  // the viewport whenever the page scrolls. Best-effort: if the browser/
  // screenshot step fails, the finding is still persisted without a crop
  // rather than losing the flag entirely.
  let cropUrl: string | null = null;
  try {
    const vp = isViewport(viewport) ? viewport : { width: 1440, height: 900 };

    const screenshot = await withPage(
      async (page) => {
        await page.goto(parsedUrl.href, { waitUntil: "domcontentloaded", timeout: 15_000 });
        return page.screenshot({ fullPage: true, animations: "disabled" });
      },
      { viewport: vp }
    );

    const metadata = await sharp(screenshot).metadata();
    const imgWidth = metadata.width || vp.width;
    const imgHeight = metadata.height || vp.height;

    const left = Math.min(Math.max(0, Math.round(bbox.x - 30)), imgWidth - 1);
    const top = Math.min(Math.max(0, Math.round(bbox.y - 30)), imgHeight - 1);
    const cropWidth = Math.max(1, Math.min(imgWidth - left, Math.round(bbox.width + 60)));
    const cropHeight = Math.max(1, Math.min(imgHeight - top, Math.round(bbox.height + 60)));

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
