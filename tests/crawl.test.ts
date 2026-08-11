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
