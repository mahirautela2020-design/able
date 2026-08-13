import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/preview-proxy/route";
import { ABLE_INSPECT_BRIDGE_SCRIPT } from "@/lib/explore/bridge-script";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(html: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: (name: string) => (name === "content-type" ? "text/html; charset=utf-8" : null) },
      text: async () => html,
    }))
  );
}

describe("preview-proxy — Contrast Lab bridge injection", () => {
  it("injects the __ableInspect bridge script before </body> on a real proxied page", async () => {
    stubFetch("<html><head><title>Example</title></head><body><h1>Hi</h1></body></html>");

    const req = new NextRequest("http://localhost/api/preview-proxy?url=https://example.com");
    const res = await GET(req);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain("window.__ableInspect");
    expect(body.indexOf(ABLE_INSPECT_BRIDGE_SCRIPT.trim().slice(0, 40))).toBeGreaterThan(-1);
    // Bridge must land before the closing body tag so it runs on the proxied page.
    expect(body.indexOf("window.__ableInspect")).toBeLessThan(body.indexOf("</body>"));
  });

  it("still rejects non-HTML upstream responses (existing guard untouched)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: (name: string) => (name === "content-type" ? "application/json" : null) },
        text: async () => "{}",
      }))
    );

    const req = new NextRequest("http://localhost/api/preview-proxy?url=https://example.com");
    const res = await GET(req);
    expect(res.status).toBe(415);
  });

  it("still SSRF-blocks private hosts (existing guard untouched)", async () => {
    const req = new NextRequest("http://localhost/api/preview-proxy?url=http://127.0.0.1");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
