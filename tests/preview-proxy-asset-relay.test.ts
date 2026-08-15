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

  it("leaves classic (non-module) scripts untouched — they're exempt from CORS on load", async () => {
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
    expect(body).toContain('<script src="/scripts/app.js">');
  });
});
