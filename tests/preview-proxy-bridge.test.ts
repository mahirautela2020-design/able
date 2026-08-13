import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/preview-proxy/route";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function mockUpstreamHtml(html: string) {
  global.fetch = vi.fn(async () =>
    new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  ) as unknown as typeof fetch;
}

describe("GET /api/preview-proxy", () => {
  it("injects the __ableInspect bridge before </body>", async () => {
    mockUpstreamHtml("<html><head></head><body><h1>Hi</h1></body></html>");
    const req = new NextRequest(
      "https://app.example.com/api/preview-proxy?url=" + encodeURIComponent("https://example.com/")
    );
    const res = await GET(req);
    const html = await res.text();

    expect(html).toContain("window.__ableInspect");
    // Bridge must land before </body> so it runs after the page's own DOM exists.
    expect(html.indexOf("__ableInspect")).toBeLessThan(html.indexOf("</body>"));
  });

  it("still appends the bridge when the upstream page has no </body> tag", async () => {
    mockUpstreamHtml("<h1>Fragment</h1>");
    const req = new NextRequest(
      "https://app.example.com/api/preview-proxy?url=" + encodeURIComponent("https://example.com/")
    );
    const res = await GET(req);
    const html = await res.text();
    expect(html).toContain("window.__ableInspect");
  });

  it("rejects a private/internal host (SSRF guard stays intact)", async () => {
    const req = new NextRequest(
      "https://app.example.com/api/preview-proxy?url=" + encodeURIComponent("http://127.0.0.1/")
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
