import { NextRequest, NextResponse } from "next/server";
import { validateHost } from "@/lib/ssrf";
import { withPage, takeScreenshot } from "@/engine/browser";
import { waitForPageSettle } from "@/engine/settle";
import { isBotBlocked } from "@/engine/crawl";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Preview render — render embedding-blocked URLs to screenshots server-side.
 *
 * Sites that send X-Frame-Options / CSP block iframe embedding, but a real
 * headless browser navigating top-level renders them fine. This endpoint
 * takes an arbitrary URL, renders it to a full-page screenshot via headless
 * Chromium, and returns the PNG bytes so the client can display it in an <img>.
 *
 * SSRF-guarded: validateHost performs async DNS lookup to block private IPs.
 * Bot-blocked pages (403 or cloudflare captchas) return a { blocked: true }
 * JSON response so the client can offer a tier-3 fallback.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url query param required" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return NextResponse.json({ error: "Only http(s) URLs supported" }, { status: 400 });
    }
    // Async SSRF guard: DNS lookup to catch hostnames that resolve to
    // private IPs (the sync guard in preview-proxy misses these).
    await validateHost(target.hostname);
  } catch (e) {
    return NextResponse.json(
      { error: `URL rejected: ${(e as Error).message}` },
      { status: 400 }
    );
  }

  try {
    const screenshot = await withPage(async (page) => {
      // Navigate and capture status + title for bot-block detection.
      const response = await page.goto(target.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      const status = response?.status() ?? null;
      const title = await page.title();

      // Settle before screenshot: wait for networkidle, pause animations,
      // dismiss consent modals. Reuse the same settle helper the auditor uses.
      await waitForPageSettle(page, { networkidleTimedOut: false });

      // Bot-block detection: if status is 403 or title suggests a captcha,
      // return a blocked response (not an error, just a signal to the client
      // to show tier-3).
      if (isBotBlocked(title, status)) {
        return { blocked: true as const };
      }

      // Reuse the auditor's screenshot helper so the viewport (1440×900 from
      // withPage's default context) and the clip width agree — a mismatched
      // clip wider than the viewport can fail the capture.
      const buffer = await takeScreenshot(page);
      return { blocked: false as const, buffer };
    });

    // If bot-blocked, return JSON signal; client shows tier-3 message.
    if (screenshot.blocked) {
      return NextResponse.json({ blocked: true, reason: "bot-detection" }, { status: 200 });
    }

    // Success: return PNG bytes with no-cache directive (each URL render is unique).
    return new NextResponse(new Uint8Array(screenshot.buffer!), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Render failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
