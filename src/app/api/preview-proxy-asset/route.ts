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

    const contentType = res.headers.get("content-type") || "application/octet-stream";

    // Cross-origin @font-face is CORS-gated in every browser (unlike plain
    // images/scripts) — a stylesheet loaded through this relay would still
    // fail to load ITS OWN font/background-image references, since those
    // stay relative to the target's origin and never touch this relay.
    // Rewrite every url()/@import inside the CSS to route through this same
    // relay, recursively, so the whole dependency chain stays CORS-free.
    if (contentType.includes("text/css")) {
      const css = rewriteCssUrls(new TextDecoder().decode(buf), target, request.nextUrl.origin);
      return new NextResponse(css, {
        status: res.status,
        headers: {
          "content-type": "text/css; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      });
    }

    // A script's static/dynamic import specifiers resolve relative to ITS
    // OWN url — once this script is served through this relay, that "own
    // url" becomes the relay's URL, not the script's real location, so any
    // relative import lands under /api/preview-proxy-asset's own directory
    // instead of the real site. Rewrite import specifiers the same way CSS
    // url()/@import are rewritten above, resolving against the REAL script
    // location (`target`) before wrapping in the relay.
    if (/^(text|application)\/(java|ecma)script/.test(contentType) || /\.m?js(\?|$)/i.test(target.pathname)) {
      const js = rewriteJsImports(new TextDecoder().decode(buf), target, request.nextUrl.origin);
      return new NextResponse(js, {
        status: res.status,
        headers: {
          "content-type": contentType,
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      });
    }

    return new NextResponse(buf, {
      status: res.status,
      headers: {
        "content-type": contentType,
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

// Best-effort, regex-based — real JS parsing would be needed for full
// correctness (specifiers built from template literals/variables can't be
// seen statically), but this covers the overwhelmingly common case of a
// plain string-literal specifier, which is how the vast majority of
// hand-written and bundler-emitted import/export statements look.
function rewriteJsImports(js: string, scriptUrl: URL, proxyOrigin: string): string {
  const relayBase = `${proxyOrigin}/api/preview-proxy-asset`;
  const relay = (abs: string) => `${relayBase}?url=${encodeURIComponent(abs)}`;
  const alreadyRelayed = (ref: string) => ref.indexOf(relayBase) === 0;
  const shouldRewrite = (ref: string) =>
    !alreadyRelayed(ref) && (ref.startsWith(".") || ref.startsWith("/"));
  const resolve = (ref: string) => {
    try {
      return new URL(ref, scriptUrl).toString();
    } catch {
      return null;
    }
  };
  const rewriteRef = (ref: string) => {
    if (!shouldRewrite(ref)) return ref;
    const abs = resolve(ref);
    return abs ? relay(abs) : ref;
  };

  let out = js.replace(
    /\bimport\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g,
    (full, quote: string, ref: string) => `import(${quote}${rewriteRef(ref)}${quote})`
  );

  out = out.replace(
    /\b(import|export)\s+([^'";]*?\bfrom\s+)?(['"])((?:\\.|(?!\3).)*)\3/g,
    (full, kw: string, fromClause: string | undefined, quote: string, ref: string) => {
      // Bare `export { x };` with no module specifier must not be touched —
      // only rewrite when there's an actual specifier (a `from` clause, or
      // a side-effect `import "path";`/`export * from "path";`).
      if (kw === "export" && !fromClause) return full;
      return `${kw} ${fromClause || ""}${quote}${rewriteRef(ref)}${quote}`;
    }
  );

  return out;
}

function rewriteCssUrls(css: string, cssUrl: URL, proxyOrigin: string): string {
  const relayBase = `${proxyOrigin}/api/preview-proxy-asset`;
  const relay = (abs: string) => `${relayBase}?url=${encodeURIComponent(abs)}`;
  // Idempotency guard: `@import url(...)` matches BOTH the @import pattern
  // and the generic url() pattern below — without this, the two passes
  // would double-wrap the same reference (relay(relay(url))), producing a
  // nonsense nested URL the relay itself can't resolve.
  const alreadyRelayed = (ref: string) => ref.indexOf(relayBase) === 0;
  const resolve = (ref: string) => {
    try {
      return new URL(ref, cssUrl).toString();
    } catch {
      return null;
    }
  };

  // @import runs first and consumes its own optional url(...) wrapper
  // whole, so the generic url() pass below never sees it.
  let out = css.replace(
    /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)([^;]*);?/gi,
    (full, _uq: string, uref: string | undefined, _sq: string, sref: string | undefined, rest: string) => {
      const ref = uref ?? sref ?? "";
      if (!ref || alreadyRelayed(ref)) return full;
      const abs = resolve(ref);
      return abs ? `@import "${relay(abs)}"${rest};` : full;
    }
  );

  out = out.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (full, _quote: string, ref: string) => {
      if (ref.startsWith("data:") || alreadyRelayed(ref)) return full;
      const abs = resolve(ref);
      return abs ? `url("${relay(abs)}")` : full;
    }
  );

  return out;
}
