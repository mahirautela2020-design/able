import sharp from "sharp";
import { withPage } from "@/engine/browser";
import { waitForPageSettle } from "@/engine/settle";
import { getAudit, getAuditPageId, insertFindings, uploadEvidence, invalidatePdfCache } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { getClientIp } from "@/lib/http";
import { sanitizeUrl, validateHost } from "@/lib/ssrf";
import { contrastRatio, requiredContrastRatio } from "@/lib/contrast";
import { buildContrastFinding } from "@/lib/audit/contrast-finding";
import type { Bbox } from "@/lib/explore/types";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ContrastFindingBody {
  pageUrl?: string;
  selector?: string;
  elementHtml?: string;
  fg?: string;
  bg?: string;
  hasText?: boolean;
  bbox?: Bbox;
  viewport?: { width: number; height: number };
  /** The AA/AAA + normal/large-text target the user had selected in
   * Contrast Lab when they flagged this pair — defaults preserve the
   * pre-selector AA/normal-text behavior for older callers. */
  level?: "AA" | "AAA";
  largeText?: boolean;
}

function isLevel(v: unknown): v is "AA" | "AAA" {
  return v === "AA" || v === "AAA";
}

function isBbox(v: unknown): v is Bbox {
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

  // Owner-scoped auth: a session belonging to the audit's owner, or an
  // anonymous request whose IP matches the audit's creator IP — Contrast Lab
  // is reachable from the main (anonymous-friendly) workbench, so it
  // shouldn't hard-require sign-in the way the NVDA run route does. This is
  // a WRITE endpoint (unlike the read-only report/sr-preview routes it
  // otherwise mirrors), so a valid session alone is not enough: it must
  // belong to THIS audit's owner, or any authenticated caller could attach
  // fabricated findings to another user's audit just by knowing its id. A
  // missing audit and a not-yours audit get the SAME 401 here so a caller
  // can't distinguish "doesn't exist" from "exists, not yours" by response
  // code.
  if (!audit) {
    return Response.json(
      { error: "Missing or invalid authorization header" },
      { status: 401 }
    );
  }

  const auth = await requireSession(request);
  const reqIp = getClientIp(request);
  const isOwner = auth.ok
    ? audit.created_by
      ? audit.created_by === auth.userId
      : !!reqIp && audit.created_ip === reqIp
    : !!reqIp && audit.created_ip === reqIp;
  if (!isOwner) {
    return Response.json(
      { error: "Missing or invalid authorization header" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as ContrastFindingBody;
  const { selector, elementHtml, fg, bg, hasText, bbox, viewport, pageUrl } = body;
  const level = isLevel(body.level) ? body.level : "AA";
  const largeText = body.largeText === true;

  if (!selector || !fg || !bg || !bbox) {
    return Response.json(
      { error: "selector, fg, bg, and bbox are required" },
      { status: 400 }
    );
  }
  if (!isBbox(bbox)) {
    return Response.json({ error: "bbox {x,y,width,height} is required" }, { status: 400 });
  }

  // Server-computed ratio — never trust a client-posted number. Only a pair
  // that actually fails the caller's selected target (AA/AAA, normal/large
  // text — the same target the Contrast Lab UI shows) is eligible to become
  // a finding; a pair that passes that target is not a violation of it and
  // this route refuses to fabricate one. Without this, an AAA-only failure
  // (passes AA, fails AAA) could never be flagged regardless of what the
  // user had selected in the UI.
  let ratio: number;
  try {
    ratio = contrastRatio(fg, bg);
  } catch {
    return Response.json({ error: "Unparseable fg/bg color" }, { status: 400 });
  }
  // hasText is client-reported at this point (server verification happens
  // during the withPage capture below, right before buildContrastFinding) —
  // fine for an early reject gate: it can only cause a false-negative 400
  // if the client mis-reports it, never a fabricated finding, since the
  // eventual persisted row is always built from the DOM-verified value.
  const requiredRatio = requiredContrastRatio(level, largeText, hasText !== false);
  if (ratio >= requiredRatio) {
    return Response.json(
      { error: `This pair already passes ${level}${largeText ? " (large text)" : ""} — nothing to flag` },
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

  // Re-navigate and crop a fresh evidence screenshot around the picked
  // element, at the same viewport the user was looking at. fullPage capture
  // (not just the current viewport) so elements below the fold still crop
  // correctly; the real captured dimensions are read back via sharp rather
  // than assumed from the viewport, since a full-page capture is taller than
  // the viewport whenever the page scrolls. The same navigation also
  // verifies hasText against the live DOM — never trust it from the client
  // alone, since it decides the persisted WCAG criterion (1.4.3 vs 1.4.11).
  // Both are best-effort: if the browser step fails, the finding is still
  // persisted (without a crop, falling back to the client's hasText) rather
  // than losing the flag entirely.
  let cropUrl: string | null = null;
  let verifiedHasText = hasText === true;
  try {
    const vp = isViewport(viewport) ? viewport : { width: 1440, height: 900 };

    const { screenshot, domHasText } = await withPage(
      async (page) => {
        await page.goto(parsedUrl.href, { waitUntil: "domcontentloaded", timeout: 15_000 });
        // Settle animations/consent banners/fonts before capturing — without
        // this, a re-navigated evidence screenshot can catch the page
        // mid-transition (a cookie banner still animating in, a webfont not
        // yet swapped), producing a crop that doesn't match what the user
        // saw in Contrast Lab. Best-effort: waitForPageSettle already
        // degrades gracefully internally on any single step's failure.
        await waitForPageSettle(page, { networkidleTimedOut: false });
        const domHasText = await page
          .evaluate((sel: string) => {
            const el = document.querySelector(sel);
            return !!el && (el.textContent || "").trim().length > 0;
          }, selector)
          .catch(() => null);
        const screenshot = await page.screenshot({ fullPage: true, animations: "disabled" });
        return { screenshot, domHasText };
      },
      { viewport: vp }
    );
    if (domHasText !== null) verifiedHasText = domHasText;

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

  const computed = buildContrastFinding({
    auditId,
    pageId,
    selector,
    elementHtml: elementHtml ?? null,
    fg,
    bg,
    hasText: verifiedHasText,
    level,
    largeText,
  });

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

  // This finding may have just been added to an audit whose PDF was already
  // cached — invalidate so the next download reflects it. Best-effort: a
  // failed invalidation just means the next download serves a stale cache,
  // not a broken response for this request.
  invalidatePdfCache(auditId).catch(() => {});

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
