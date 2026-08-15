import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/preview-proxy/route";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(html: string, captureHeaders?: (headers: Record<string, string>) => void) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captureHeaders?.(init?.headers as Record<string, string>);
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: (name: string) => (name === "content-type" ? "text/html; charset=utf-8" : null) },
        text: async () => html,
      };
    })
  );
}

describe("preview-proxy — <base> tag robustness (regression: any existing <base> tag was left alone, even a relative/invalid one)", () => {
  it("injects an absolute <base href> when the page has no base tag at all", async () => {
    stubFetch("<html><head><title>Example</title></head><body></body></html>");
    const req = new NextRequest("http://localhost/api/preview-proxy?url=https://example.com/page");
    const res = await GET(req);
    const body = await res.text();
    expect(body).toContain('<base href="https://example.com/">');
  });

  it("replaces a relative/path-only <base> tag (would resolve wrong under our proxy origin)", async () => {
    stubFetch(
      '<html><head><base href="/some/path/"><title>Example</title></head><body></body></html>'
    );
    const req = new NextRequest("http://localhost/api/preview-proxy?url=https://example.com/page");
    const res = await GET(req);
    const body = await res.text();
    expect(body).toContain('<base href="https://example.com/">');
    expect(body).not.toContain('href="/some/path/"');
  });

  it("keeps an existing <base> tag that already has a valid absolute href", async () => {
    stubFetch(
      '<html><head><base href="https://cdn.example.com/assets/"><title>Example</title></head><body></body></html>'
    );
    const req = new NextRequest("http://localhost/api/preview-proxy?url=https://example.com/page");
    const res = await GET(req);
    const body = await res.text();
    expect(body).toContain('<base href="https://cdn.example.com/assets/">');
  });

  it("keeps an existing <base> tag with a protocol-relative absolute href", async () => {
    stubFetch(
      '<html><head><base href="//cdn.example.com/assets/"><title>Example</title></head><body></body></html>'
    );
    const req = new NextRequest("http://localhost/api/preview-proxy?url=https://example.com/page");
    const res = await GET(req);
    const body = await res.text();
    expect(body).toContain('<base href="//cdn.example.com/assets/">');
  });

  it("replaces a <base> tag that has no href at all, without leaving a second <base> tag behind", async () => {
    stubFetch(
      '<html><head><base target="_blank"><title>Example</title></head><body></body></html>'
    );
    const req = new NextRequest("http://localhost/api/preview-proxy?url=https://example.com/page");
    const res = await GET(req);
    const body = await res.text();
    expect(body).toContain('<base href="https://example.com/">');
    expect(body.match(/<base\b/gi)?.length).toBe(1);
  });

  it("still injects a <base> tag when the page has an <html> but no <head> at all (regression: silently skipped, breaking relative assets under the proxy origin)", async () => {
    stubFetch('<html><body>No head here</body></html>');
    const req = new NextRequest("http://localhost/api/preview-proxy?url=https://example.com/page");
    const res = await GET(req);
    const body = await res.text();
    expect(body).toContain('<base href="https://example.com/">');
  });

  it("still injects a <base> tag for a bare HTML fragment with neither <head> nor <html>", async () => {
    stubFetch('<body>Fragment only</body>');
    const req = new NextRequest("http://localhost/api/preview-proxy?url=https://example.com/page");
    const res = await GET(req);
    const body = await res.text();
    expect(body).toContain('<base href="https://example.com/">');
  });

  it("only fixes the first of multiple <base> tags — browsers only honor the first anyway", async () => {
    stubFetch(
      '<html><head><base href="/one/"><base href="/two/"><title>Example</title></head><body></body></html>'
    );
    const req = new NextRequest("http://localhost/api/preview-proxy?url=https://example.com/page");
    const res = await GET(req);
    const body = await res.text();
    expect(body).toContain('<base href="https://example.com/">');
    expect(body).toContain('<base href="/two/">');
  });
});

describe("preview-proxy — outbound request headers (regression: no Referer/Sec-Fetch-Mode, more likely to trip WAF/bot-detection false positives)", () => {
  it("sends a same-origin Referer and Sec-Fetch-Mode: navigate to the target", async () => {
    let captured: Record<string, string> = {};
    stubFetch("<html><head></head><body></body></html>", (h) => {
      captured = h;
    });
    const req = new NextRequest("http://localhost/api/preview-proxy?url=https://example.com/page");
    await GET(req);

    expect(captured.referer).toBe("https://example.com/");
    expect(captured["sec-fetch-mode"]).toBe("navigate");
  });
});
