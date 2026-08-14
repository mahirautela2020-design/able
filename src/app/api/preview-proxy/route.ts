import { NextRequest, NextResponse } from "next/server";
import { validateHostSync } from "@/lib/ssrf";
import { ABLE_INSPECT_BRIDGE_SCRIPT } from "@/lib/explore/bridge-script";

/**
 * Preview proxy — the "iframes can't load X-Frame-Options sites" hack.
 *
 * Instead of framing the target directly (browser enforces XFO/CSP and
 * refuses), we fetch the page SERVER-SIDE through our own origin. The
 * iframe sees OUR response — which carries no x-frame-options / CSP
 * frame-ancestors — so the browser renders it. This is how VS Code /
 * Claude / Codex-style previews work: the network layer is ours, not the
 * browser's.
 *
 * SSRF-guarded: validateHostSync blocks private IPs + dangerous hosts.
 * The response is same-origin proxied HTML with <base href> injected so
 * subresources (css/js/img) load from the real site.
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
    validateHostSync(target.hostname);
  } catch (e) {
    return NextResponse.json(
      { error: `URL rejected: ${(e as Error).message}` },
      { status: 400 }
    );
  }

  try {
    const browserUa =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

    const res = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": browserUa,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream ${res.status} ${res.statusText}` },
        { status: 502 }
      );
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json(
        { error: "Only HTML pages can be proxied for preview" },
        { status: 415 }
      );
    }

    let html = await res.text();

    // Guard against runaway pages — 5MB cap.
    if (html.length > 5_000_000) {
      return NextResponse.json({ error: "Page too large to preview" }, { status: 413 });
    }

    // Inject <base href> so relative/absolute subresources resolve against
    // the REAL site (we only proxy the document; assets load directly).
    const origin = target.origin;
    if (!/<base\s/i.test(html)) {
      html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${origin}/">`);
    } else {
      // Some sites set their own <base> — leave it (their call).
    }

    // Make our response iframe-able: we simply don't set the blocking
    // headers. Also strip any CSP meta tags that would re-block framing.
    html = html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "");

    // Contrast Lab / Explore: give proxied pages the same __ableInspect
    // bridge the bundled demo fixture exposes, so click-to-inspect works
    // against the real audited page, not just public/explore-demo.html.
    const bridgeTag = `<script>${ABLE_INSPECT_BRIDGE_SCRIPT}</script>`;
    html = /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, `${bridgeTag}</body>`)
      : html + bridgeTag;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        // Allow our own workbench to frame this proxied page.
        "x-frame-options": "SAMEORIGIN",
        "content-security-policy": "frame-ancestors 'self' http://localhost:3000 https://scana11y-nine.vercel.app",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Preview proxy failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
