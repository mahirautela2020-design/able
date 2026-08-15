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
        // A same-origin-looking navigation reduces false-positive WAF/bot
        // rejections on sites that check these — this is still a bounded
        // fidelity improvement, not an attempt to defeat real bot
        // detection (Cloudflare/Akamai challenge pages etc. will still
        // never render through any server-side proxy, and that's fine).
        referer: `${target.origin}/`,
        "sec-fetch-mode": "navigate",
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
    // A site's own <base> tag is usually a relative or path-only href
    // (meant to be resolved against ITS OWN url, not ours) — leaving that
    // as-is under our proxy origin resolves every relative asset wrong.
    // Only keep an existing tag if it's already a valid absolute URL.
    const origin = target.origin;
    // Match any existing <base> tag (with or without href — e.g. a
    // target="_blank"-only base is valid HTML) so we replace it in place
    // rather than leaving it and inserting a second <base>.
    const baseMatch = html.match(/<base\b[^>]*>/i);
    const baseHrefMatch = baseMatch ? baseMatch[0].match(/href=["']([^"']*)["']/i) : null;
    // Protocol-relative hrefs ("//cdn.example.com/") are also valid
    // absolute-host URLs, not just http(s)://.
    const hasValidAbsoluteBase = !!baseHrefMatch && /^(https?:)?\/\//i.test(baseHrefMatch[1]);
    if (!hasValidAbsoluteBase) {
      const newBaseTag = `<base href="${origin}/">`;
      if (baseMatch) {
        html = html.replace(baseMatch[0], newBaseTag);
      } else if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, `<head$1>${newBaseTag}`);
      } else if (/<html[^>]*>/i.test(html)) {
        // Malformed page with no <head> at all — still inject one so
        // relative assets don't silently resolve against our own origin.
        html = html.replace(/<html([^>]*)>/i, `<html$1><head>${newBaseTag}</head>`);
      } else {
        html = `<head>${newBaseTag}</head>${html}`;
      }
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
