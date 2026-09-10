import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// GET /api/preview-check had NO SSRF guard at all -- unauthenticated, and
// it does a real server-side HEAD/GET (following redirects) against
// whatever http(s) URL the caller supplies, then reflects back whether the
// request succeeded, timed out, or errored, plus the target's response
// headers. That's a blind SSRF probe against any internal host:port.
const fetchMock = vi.hoisted(() => vi.fn());
global.fetch = fetchMock as unknown as typeof fetch;

import { GET } from "@/app/api/preview-check/route";

function req(url: string) {
  return new NextRequest(
    `http://localhost/api/preview-check?url=${encodeURIComponent(url)}`
  );
}

describe("GET /api/preview-check -- SSRF guard", () => {
  it("rejects a private/link-local target before ever calling fetch", async () => {
    const res = await GET(req("http://169.254.169.254/latest/meta-data/"));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an IPv6 loopback target before ever calling fetch", async () => {
    const res = await GET(req("http://[::1]:9999/"));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a target that redirects to a private host, after following the redirect", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {},
      })
    );
    // Simulate fetch's own redirect-following landing somewhere private:
    // Response.url isn't settable via the constructor, so stub it.
    const res401 = new Response(null, { status: 200 });
    Object.defineProperty(res401, "url", { value: "http://127.0.0.1:8080/admin" });
    fetchMock.mockResolvedValueOnce(res401);

    const res = await GET(req("https://public-looking.example.com/"));
    expect(res.status).toBe(400);
  });

  it("allows a normal public target through", async () => {
    const ok = new Response(null, { status: 200, headers: { "x-frame-options": "SAMEORIGIN" } });
    Object.defineProperty(ok, "url", { value: "https://example.com/" });
    fetchMock.mockResolvedValue(ok);

    const res = await GET(req("https://example.com/"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blocked).toBe(true);
  });
});
