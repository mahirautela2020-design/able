import { withPage } from "@/engine/browser";
import { captureAriaSnapshot } from "@/lib/sr/snapshot";
import { sanitizeUrl, validateHost } from "@/lib/ssrf";

export const runtime = "nodejs";
export const maxDuration = 30;

// Captures the accessibility tree of a URL via Playwright. Same-origin paths
// (e.g. the bundled demo fixture) are allowed; any other host is passed through
// the SSRF guard before a browser is launched.
export async function POST(request: Request) {
  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawUrl = body.url;
  if (!rawUrl || typeof rawUrl !== "string") {
    return Response.json({ error: "URL is required" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;

  let url: URL;
  if (rawUrl.startsWith("/")) {
    url = new URL(rawUrl, origin);
  } else {
    const parsed = sanitizeUrl(rawUrl);
    if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
      return Response.json(
        { error: "Invalid URL. Must be http:// or https://" },
        { status: 400 }
      );
    }
    url = parsed;
  }

  const sameOrigin = url.origin === origin;
  if (!sameOrigin) {
    try {
      await validateHost(url.hostname);
    } catch (e) {
      return Response.json(
        { error: `URL rejected: ${(e as Error).message}` },
        { status: 403 }
      );
    }
  }

  try {
    const snapshot = await withPage(async (page) => {
      await page.goto(url.href, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });
      return captureAriaSnapshot(page);
    });
    return Response.json({ snapshot });
  } catch (e) {
    // Browser launch can fail on constrained runtimes (e.g. Vercel Hobby).
    return Response.json(
      { error: `AX snapshot capture failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
