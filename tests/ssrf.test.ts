import { describe, it, expect } from "vitest";
import { validateHostSync, sanitizeUrl } from "@/lib/ssrf";

describe("ssrf", () => {
  it("blocks the cloud metadata IP", () => {
    expect(() => validateHostSync("169.254.169.254")).toThrow(/SSRF_BLOCKED/);
  });

  it("blocks private IPv4 ranges", () => {
    for (const host of ["127.0.0.1", "10.0.0.1", "192.168.1.1", "172.16.0.1", "172.31.255.255"]) {
      expect(() => validateHostSync(host)).toThrow(/SSRF_BLOCKED/);
    }
  });

  it("blocks localhost and metadata hostname", () => {
    expect(() => validateHostSync("localhost")).toThrow(/SSRF_BLOCKED/);
    expect(() => validateHostSync("metadata.google.internal")).toThrow(/SSRF_BLOCKED/);
  });

  it("allows a public hostname", () => {
    expect(() => validateHostSync("example.com")).not.toThrow();
  });

  it("sanitizeUrl accepts http(s) and rejects other protocols", () => {
    expect(sanitizeUrl("https://example.com")?.protocol).toBe("https:");
    expect(sanitizeUrl("http://example.com")?.protocol).toBe("http:");
    expect(sanitizeUrl("ftp://example.com")).toBeNull();
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("not a url")).toBeNull();
  });
});
