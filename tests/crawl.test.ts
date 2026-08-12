import { describe, it, expect } from "vitest";
import { sanitizeUrl, validateHost, isBotBlocked } from "@/engine/crawl";

describe("crawl", () => {
  describe("sanitizeUrl", () => {
    it("accepts http URLs", () => {
      expect(sanitizeUrl("http://example.com")).not.toBeNull();
    });

    it("accepts https URLs", () => {
      expect(sanitizeUrl("https://example.com/path")).not.toBeNull();
    });

    it("rejects non-http protocols", () => {
      expect(sanitizeUrl("ftp://example.com")).toBeNull();
      expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
      expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    });

    it("rejects invalid URLs", () => {
      expect(sanitizeUrl("not-a-url")).toBeNull();
    });

    it("auto-prefixes https:// when no scheme is given", () => {
      const url = sanitizeUrl("www.qantas.com");
      expect(url).not.toBeNull();
      expect(url!.protocol).toBe("https:");
      expect(url!.hostname).toBe("www.qantas.com");

      const bare = sanitizeUrl("qantas.com");
      expect(bare).not.toBeNull();
      expect(bare!.protocol).toBe("https:");
    });

    it("keeps explicit schemes untouched", () => {
      expect(sanitizeUrl("http://example.com")!.protocol).toBe("http:");
      expect(sanitizeUrl("https://example.com")!.protocol).toBe("https:");
    });
  });

  describe("validateHost", () => {
    it("rejects localhost", async () => {
      await expect(validateHost("localhost")).rejects.toThrow("SSRF_BLOCKED");
    });

    it("rejects metadata IP", async () => {
      await expect(validateHost("169.254.169.254")).rejects.toThrow("SSRF_BLOCKED");
    });
  });

  describe("isBotBlocked", () => {
    it("detects Cloudflare challenge", () => {
      expect(isBotBlocked("Just a moment...", null)).toBe(true);
      expect(isBotBlocked("Attention required!", null)).toBe(true);
      expect(isBotBlocked("Cloudflare", null)).toBe(true);
    });

    it("detects 403", () => {
      expect(isBotBlocked("Any title", 403)).toBe(true);
    });

    it("passes normal pages", () => {
      expect(isBotBlocked("Welcome to my site", 200)).toBe(false);
    });
  });
});
