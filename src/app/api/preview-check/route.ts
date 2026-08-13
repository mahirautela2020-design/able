import { NextRequest, NextResponse } from "next/server";

/**
 * Checks whether a target URL allows iframe embedding, by inspecting its
 * response headers SERVER-SIDE (x-frame-options / CSP frame-ancestors).
 *
 * WHY: the browser cannot reliably detect this from a cross-origin iframe —
 * accessing contentWindow.document throws a SecurityError for EVERY external
 * site (even embeddable ones), so client-side detection false-positives on
 * wikipedia/example.com etc. Headers are the source of truth.
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
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    // HEAD first: many sites (amazon.in) only expose x-frame-options on
    // HEAD responses even when they return 405 for the method itself.
    // Fall back to GET when HEAD fails (network-level).
    // Browser-like UA: some CDNs (Akamai on qantas.com) bot-block plain
    // fetch UAs; a Chrome UA passes and returns the real headers.
    const browserUa =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    let res: Response | null = null;
    let usedMethod = "GET";
    try {
      // Keep HEAD's headers EVEN on 405: amazon.in returns 405 for HEAD but
      // attaches x-frame-options: SAMEORIGIN to that very response. Only a
      // network-level failure falls through to GET.
      res = await fetch(target.toString(), {
        method: "HEAD",
        redirect: "follow",
        headers: { "user-agent": browserUa, accept: "text/html,*/*" },
        signal: AbortSignal.timeout(15000),
      });
      usedMethod = "HEAD";
    } catch {
      // HEAD unsupported / connection reset — fall through to GET.
    }
    if (!res) {
      res = await fetch(target.toString(), {
        method: "GET",
        redirect: "follow",
        headers: { "user-agent": browserUa, accept: "text/html,*/*" },
        signal: AbortSignal.timeout(15000),
      });
      usedMethod = "GET";
    }

    const xfo = (res.headers.get("x-frame-options") || "").toUpperCase();
    const csp = res.headers.get("content-security-policy") || "";
    const frameAncestors = csp.match(/frame-ancestors\s+([^;]*)/i)?.[1]?.trim();

    // Blocked when: XFO is DENY/SAMEORIGIN, or CSP frame-ancestors exists
    // and does not include '*' or our own origin.
    const blockedByXfo = xfo === "DENY" || xfo === "SAMEORIGIN";
    const blockedByCsp =
      !!frameAncestors &&
      frameAncestors !== "*" &&
      !frameAncestors.includes("https://scana11y-nine.vercel.app") &&
      !frameAncestors.includes("http://localhost:3000");

    return NextResponse.json({
      url: target.toString(),
      method: usedMethod,
      blocked: blockedByXfo || blockedByCsp,
      reasons: [
        blockedByXfo ? `x-frame-options: ${xfo}` : null,
        blockedByCsp ? `csp frame-ancestors: ${frameAncestors}` : null,
      ].filter(Boolean),
    });
  } catch (e) {
    // Network errors / timeouts: report blocked:false so the preview shows
    // (the iframe will render its own error if the site is truly unreachable).
    return NextResponse.json({
      url: target.toString(),
      blocked: false,
      reasons: [],
      checkError: (e as Error).message,
    });
  }
}
