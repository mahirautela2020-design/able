import { NextRequest, NextResponse } from "next/server";
import { validateHostSync } from "@/lib/ssrf";

/**
 * Raw subresource relay for the preview proxy.
 *
 * The document proxy (`/api/preview-proxy`) fetches the top-level HTML
 * server-side so XFO/CSP framing headers never reach the browser. But a
 * proxied page's own client-side JS still runs IN the browser, and any
 * same-origin `fetch`/`XMLHttpRequest` calls it makes (typical for
 * hydration — client-rendered widgets pulling JSON from the site's own
 * API) go out from OUR origin, not the target's — which the target's CORS
 * policy almost always rejects, since it never expected a cross-origin
 * caller. The bridge script injected by preview-proxy rewrites those calls
 * to hit this route instead, which does the actual request server-side
 * (no browser CORS involved) and relays the response back with permissive
 * CORS headers so the iframe's JS can read it.
 *
 * No HTML/text transform here — this is a byte passthrough for whatever
 * content-type the target returns (json/js/css/images/fonts/etc).
 */
export async function GET(request: NextRequest) {
  return relay(request, "GET");
}

export async function POST(request: NextRequest) {
  return relay(request, "POST");
}

async function relay(request: NextRequest, method: "GET" | "POST") {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "url query param required" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
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
    const body = method === "POST" ? await request.arrayBuffer() : undefined;
    const reqContentType = request.headers.get("content-type");

    const res = await fetch(target.toString(), {
      method,
      redirect: "follow",
      body,
      headers: {
        "user-agent": browserUa,
        accept: request.headers.get("accept") || "*/*",
        "accept-language": "en-US,en;q=0.9",
        referer: `${target.origin}/`,
        ...(reqContentType ? { "content-type": reqContentType } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });

    // 5MB cap — same guardrail as the document proxy.
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 5_000_000) {
      return NextResponse.json({ error: "Asset too large to relay" }, { status: 413 });
    }

    return new NextResponse(buf, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/octet-stream",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Asset relay failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
