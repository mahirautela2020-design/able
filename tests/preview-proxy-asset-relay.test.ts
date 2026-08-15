import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as proxyGet } from "@/app/api/preview-proxy/route";
import { GET as assetGet, POST as assetPost } from "@/app/api/preview-proxy-asset/route";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preview-proxy-asset — subresource relay (regression: same-origin fetch/XHR from a proxied page's own JS was CORS-rejected, since the caller became OUR origin, not the target's)", () => {
  it("relays a GET and echoes content-type with permissive CORS", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        headers: { get: (n: string) => (n === "content-type" ? "application/javascript" : null) },
        arrayBuffer: async () => new TextEncoder().encode("console.log(1)").buffer,
      }))
    );
    const req = new NextRequest(
      "http://localhost/api/preview-proxy-asset?url=" + encodeURIComponent("https://example.com/x.js")
    );
    const res = await assetGet(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("content-type")).toBe("application/javascript");
  });

  it("relays a POST with the request body forwarded upstream", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => ({
      status: 201,
      headers: { get: (n: string) => (n === "content-type" ? "application/json" : null) },
      arrayBuffer: async () => new TextEncoder().encode("{}").buffer,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const req = new NextRequest(
      "http://localhost/api/preview-proxy-asset?url=" + encodeURIComponent("https://example.com/api"),
      { method: "POST", body: JSON.stringify({ a: 1 }), headers: { "content-type": "application/json" } }
    );
    const res = await assetPost(req);
    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });

  it("rejects a private/loopback target the same way the document proxy does", async () => {
    const req = new NextRequest(
      "http://localhost/api/preview-proxy-asset?url=" + encodeURIComponent("http://127.0.0.1/secret")
    );
    const res = await assetGet(req);
    expect(res.status).toBe(400);
  });
});

describe("preview-proxy-asset — CSS url()/@import rewriting (regression: cross-origin @font-face is CORS-gated in every browser, unlike plain images/scripts — a stylesheet relayed as raw bytes still failed every custom webfont it declared)", () => {
  function stubCssFetch(css: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        headers: { get: (n: string) => (n === "content-type" ? "text/css; charset=utf-8" : null) },
        arrayBuffer: async () => new TextEncoder().encode(css).buffer,
      }))
    );
  }

  it("rewrites a relative url() to an absolute relay URL resolved against the stylesheet's own location", async () => {
    stubCssFetch(`@font-face { src: url("../fonts/brand.woff2") format("woff2"); }`);
    const req = new NextRequest(
      "http://localhost:3000/api/preview-proxy-asset?url=" +
        encodeURIComponent("https://example.com/styles/main.css")
    );
    const res = await assetGet(req);
    const body = await res.text();
    expect(body).toContain(
      'url("http://localhost:3000/api/preview-proxy-asset?url=' +
        encodeURIComponent("https://example.com/fonts/brand.woff2") +
        '")'
    );
  });

  it("rewrites both @import forms (bare string and url()) without double-wrapping", async () => {
    stubCssFetch(`@import "tokens.css";\n@import url(normalize.css);`);
    const req = new NextRequest(
      "http://localhost:3000/api/preview-proxy-asset?url=" +
        encodeURIComponent("https://example.com/styles/main.css")
    );
    const res = await assetGet(req);
    const body = await res.text();
    const tokensRelay =
      'http://localhost:3000/api/preview-proxy-asset?url=' +
      encodeURIComponent("https://example.com/styles/tokens.css");
    const normalizeRelay =
      'http://localhost:3000/api/preview-proxy-asset?url=' +
      encodeURIComponent("https://example.com/styles/normalize.css");
    expect(body).toContain(`@import "${tokensRelay}"`);
    expect(body).toContain(`@import "${normalizeRelay}"`);
    // The exact regression: url() and @import overlap on `@import url(...)`
    // syntax — a naive two-pass rewrite double-wraps it (relay(relay(x))).
    expect(body).not.toContain(encodeURIComponent("localhost:3000"));
  });

  it("leaves data: URIs alone", async () => {
    stubCssFetch(`.icon { background: url(data:image/png;base64,AAAA); }`);
    const req = new NextRequest(
      "http://localhost:3000/api/preview-proxy-asset?url=" + encodeURIComponent("https://example.com/x.css")
    );
    const res = await assetGet(req);
    const body = await res.text();
    expect(body).toContain("url(data:image/png;base64,AAAA)");
  });
});

describe("preview-proxy-asset — JS import specifier rewriting (regression: a relayed script's relative import()/import-from specifiers resolve against the RELAY's own url, not the script's real location, landing under /api/preview-proxy-asset's own directory instead of the real site)", () => {
  function stubJsFetch(js: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        headers: { get: (n: string) => (n === "content-type" ? "text/javascript; charset=utf-8" : null) },
        arrayBuffer: async () => new TextEncoder().encode(js).buffer,
      }))
    );
  }

  it("rewrites a relative dynamic import() to an absolute relay URL resolved against the script's own location", async () => {
    stubJsFetch(`export async function load(){ return import("./utils/common-utils.js"); }`);
    const req = new NextRequest(
      "http://localhost:3000/api/preview-proxy-asset?url=" +
        encodeURIComponent("https://example.com/scripts/aem.js")
    );
    const res = await assetGet(req);
    const body = await res.text();
    expect(body).toContain(
      'import("http://localhost:3000/api/preview-proxy-asset?url=' +
        encodeURIComponent("https://example.com/scripts/utils/common-utils.js") +
        '")'
    );
  });

  it("rewrites static import-from and side-effect import specifiers", async () => {
    stubJsFetch(`import { decorate } from "./utils/decorate.js";\nimport "./polyfill.js";`);
    const req = new NextRequest(
      "http://localhost:3000/api/preview-proxy-asset?url=" +
        encodeURIComponent("https://example.com/scripts/aem.js")
    );
    const res = await assetGet(req);
    const body = await res.text();
    expect(body).toContain(
      'from "http://localhost:3000/api/preview-proxy-asset?url=' +
        encodeURIComponent("https://example.com/scripts/utils/decorate.js") +
        '"'
    );
    expect(body).toContain(
      'import "http://localhost:3000/api/preview-proxy-asset?url=' +
        encodeURIComponent("https://example.com/scripts/polyfill.js") +
        '"'
    );
  });

  it("leaves bare-specifier and non-module-syntax code untouched (no 'from' clause, no relative path)", async () => {
    stubJsFetch(`export const importantThing = "from here"; export { x };`);
    const req = new NextRequest(
      "http://localhost:3000/api/preview-proxy-asset?url=" + encodeURIComponent("https://example.com/x.js")
    );
    const res = await assetGet(req);
    const body = await res.text();
    expect(body).toContain(`export const importantThing = "from here"; export { x };`);
  });
});

describe("preview-proxy — asset bridge injection (regression: relay URL was relative, so it resolved against the injected <base href> — the TARGET's origin — sending 'relayed' calls straight back to the target and reproducing the exact CORS failure this exists to avoid)", () => {
  it("injects an ABSOLUTE relay URL rooted at our own origin, not the target's", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: (n: string) => (n === "content-type" ? "text/html; charset=utf-8" : null) },
        text: async () => "<html><head></head><body></body></html>",
      }))
    );
    const req = new NextRequest("http://localhost:3000/api/preview-proxy?url=https://example.com/page");
    const res = await proxyGet(req);
    const body = await res.text();
    expect(body).toContain('RELAY="http://localhost:3000/api/preview-proxy-asset"');
    expect(body).not.toContain('RELAY="/api/preview-proxy-asset"');
  });

  it("rewrites <script type=module src> to the asset relay (ES modules enforce CORS on load, which the in-page fetch/XHR patch can't intercept)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: (n: string) => (n === "content-type" ? "text/html; charset=utf-8" : null) },
        text: async () =>
          '<html><head><script type="module" src="/scripts/app.js"></script></head><body></body></html>',
      }))
    );
    const req = new NextRequest("http://localhost:3000/api/preview-proxy?url=https://example.com/page");
    const res = await proxyGet(req);
    const body = await res.text();
    expect(body).toContain(
      'src="http://localhost:3000/api/preview-proxy-asset?url=' +
        encodeURIComponent("https://example.com/scripts/app.js") +
        '"'
    );
    expect(body).not.toContain('src="/scripts/app.js"');
  });

  it("relays classic (non-module) same-origin scripts too — not for CORS, but because they're the first hop for a script's own later fetch/XHR calls that only the client-side bridge can rewrite", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: (n: string) => (n === "content-type" ? "text/html; charset=utf-8" : null) },
        text: async () => '<html><head><script src="/scripts/app.js"></script></head><body></body></html>',
      }))
    );
    const req = new NextRequest("http://localhost:3000/api/preview-proxy?url=https://example.com/page");
    const res = await proxyGet(req);
    const body = await res.text();
    expect(body).toContain(
      'src="http://localhost:3000/api/preview-proxy-asset?url=' +
        encodeURIComponent("https://example.com/scripts/app.js") +
        '"'
    );
    expect(body).not.toContain('src="/scripts/app.js"');
  });

  it("leaves classic scripts pointed at a THIRD-PARTY origin untouched — only same-origin-as-target scripts are relayed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: (n: string) => (n === "content-type" ? "text/html; charset=utf-8" : null) },
        text: async () =>
          '<html><head><script src="https://cdn.example.net/analytics.js"></script></head><body></body></html>',
      }))
    );
    const req = new NextRequest("http://localhost:3000/api/preview-proxy?url=https://example.com/page");
    const res = await proxyGet(req);
    const body = await res.text();
    expect(body).toContain('<script src="https://cdn.example.net/analytics.js">');
  });

  it("relays <link rel=stylesheet> through the asset relay so its own cross-origin @font-face references stay CORS-free", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: (n: string) => (n === "content-type" ? "text/html; charset=utf-8" : null) },
        text: async () =>
          '<html><head><link rel="stylesheet" href="/styles/main.css"></head><body></body></html>',
      }))
    );
    const req = new NextRequest("http://localhost:3000/api/preview-proxy?url=https://example.com/page");
    const res = await proxyGet(req);
    const body = await res.text();
    expect(body).toContain(
      'href="http://localhost:3000/api/preview-proxy-asset?url=' +
        encodeURIComponent("https://example.com/styles/main.css") +
        '"'
    );
  });

  it("strips <link rel=preload>/rel=modulepreload> tags (regression: the browser's own preloader fetches these directly and immediately — no fetch/XHR/element-property patch can intercept it, so a cross-origin preload just CORS-fails outright; the real resource still loads fine via its actual relayed <script>/<link> tag)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: (n: string) => (n === "content-type" ? "text/html; charset=utf-8" : null) },
        text: async () =>
          '<html><head>' +
          '<link rel="preload" as="script" href="/scripts/martech.js" crossorigin>' +
          '<link rel="modulepreload" href="/scripts/app.js">' +
          '<link rel="stylesheet" href="/styles/main.css">' +
          '</head><body></body></html>',
      }))
    );
    const req = new NextRequest("http://localhost:3000/api/preview-proxy?url=https://example.com/page");
    const res = await proxyGet(req);
    const body = await res.text();
    expect(body).not.toContain("preload");
    expect(body).not.toContain("modulepreload");
    // The real stylesheet link (not a preload hint) must still be present.
    expect(body).toContain("stylesheet");
  });

  it("patches dynamic script/link injection (document.createElement + .src=) so analytics libs that inject tags at runtime — never present in the static HTML this route rewrites — still get relayed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: (n: string) => (n === "content-type" ? "text/html; charset=utf-8" : null) },
        text: async () => "<html><head></head><body></body></html>",
      }))
    );
    const req = new NextRequest("http://localhost:3000/api/preview-proxy?url=https://example.com/page");
    const res = await proxyGet(req);
    const body = await res.text();
    expect(body).toContain('patchUrlProp(window.HTMLScriptElement.prototype,"src")');
    expect(body).toContain('patchUrlProp(window.HTMLLinkElement.prototype,"href")');
    expect(body).toContain("Element.prototype.setAttribute=function");
  });
});
