import { describe, it, expect, vi } from "vitest";
import { validateHostSync } from "@/lib/ssrf";

// src/lib/ssrf.ts's isPrivateIp() (and the byte-for-byte duplicate in
// src/engine/crawl.ts) only has IPv4 dotted-decimal regexes in
// PRIVATE_RANGES (/^127\./, /^10\./, /^192\.168\./, /^169\.254\./, ...).
// It has no pattern for any IPv6 form at all, so every private/loopback
// IPv6 address sails through both validateHostSync (used unauthenticated
// by /api/preview-proxy and /api/preview-proxy-asset, which then
// server-side `fetch()`es the target and relays the FULL response body
// back to the caller) and the async validateHost (used by
// /api/preview-render, /api/audits/[id]/nvda, /api/audits/[id]/contrast-
// finding, and engine/crawl.ts's main crawl pipeline).
//
// Per the WHATWG URL spec, `new URL(...).hostname` keeps the brackets for
// an IPv6 literal host (verified: `new URL("http://[::1]/").hostname ===
// "[::1]"`), which is exactly the string these routes pass into
// validateHostSync/validateHost — so this isn't a theoretical mismatch
// between test input and what a route actually sees.
describe("ssrf -- IPv6 private-range bypass (isPrivateIp has no IPv6 coverage)", () => {
  it("must block IPv6 loopback ::1, in both bracketed and unbracketed form", () => {
    expect(() => validateHostSync("[::1]")).toThrow(/SSRF_BLOCKED/);
    expect(() => validateHostSync("::1")).toThrow(/SSRF_BLOCKED/);
  });

  it("must block IPv6 link-local (fe80::/10) -- reaches cloud metadata on some platforms via fe80::a9fe:a9fe", () => {
    expect(() => validateHostSync("[fe80::1]")).toThrow(/SSRF_BLOCKED/);
  });

  it("must block IPv6 unique-local addresses (fc00::/7)", () => {
    expect(() => validateHostSync("[fd12:3456:789a::1]")).toThrow(/SSRF_BLOCKED/);
  });

  it("must block IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)", () => {
    // new URL("http://[::ffff:127.0.0.1]/").hostname normalizes to
    // "[::ffff:7f00:1]" -- the hex form of the same address.
    expect(() => validateHostSync("[::ffff:7f00:1]")).toThrow(/SSRF_BLOCKED/);
    expect(() => validateHostSync("[::ffff:127.0.0.1]")).toThrow(/SSRF_BLOCKED/);
  });

  it("async validateHost (DNS-resolving guard) must also block a hostname that resolves to IPv6 loopback", async () => {
    // Mock node:dns.lookup so this is deterministic regardless of the test
    // machine's own resolver/hosts file -- an attacker-controlled domain's
    // DNS record can point anywhere they choose, so simulating "this
    // hostname resolves to ::1" is exactly the real-world shape of the
    // attack (classic DNS-rebinding-style SSRF): the hostname itself looks
    // public, but resolves to a loopback/private address at request time.
    vi.resetModules();
    vi.doMock("node:dns", () => ({
      lookup: (
        _host: string,
        _opts: unknown,
        cb: (err: Error | null, addrs: { address: string; family: number }[]) => void
      ) => cb(null, [{ address: "::1", family: 6 }]),
    }));
    const { validateHost: validateHostFresh } = await import("@/lib/ssrf");
    await expect(validateHostFresh("attacker-controlled.example.com")).rejects.toThrow(
      /SSRF_BLOCKED/
    );
    vi.doUnmock("node:dns");
    vi.resetModules();
  });
});
