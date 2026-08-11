import { describe, it, expect } from "vitest";
import { sanitizeUrl, validateHostSync, validateGitUrl, parseGitUrl } from "@/lib/ssrf";

describe("ssrf-code", () => {
  describe("sanitizeUrl", () => {
    it("accepts https URLs", () => {
      expect(sanitizeUrl("https://github.com/user/repo")).not.toBeNull();
    });

    it("accepts http URLs", () => {
      expect(sanitizeUrl("http://example.com")).not.toBeNull();
    });

    it("rejects file protocol", () => {
      expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
    });

    it("rejects javascript protocol", () => {
      expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    });
  });

  describe("validateHostSync", () => {
    it("rejects localhost", () => {
      expect(() => validateHostSync("localhost")).toThrow("SSRF_BLOCKED");
    });

    it("rejects metadata IP", () => {
      expect(() => validateHostSync("169.254.169.254")).toThrow("SSRF_BLOCKED");
    });

    it("rejects private IPs", () => {
      expect(() => validateHostSync("127.0.0.1")).toThrow("SSRF_BLOCKED");
      expect(() => validateHostSync("10.0.0.1")).toThrow("SSRF_BLOCKED");
      expect(() => validateHostSync("192.168.1.1")).toThrow("SSRF_BLOCKED");
    });
  });

  describe("validateGitUrl", () => {
    it("accepts public https git URLs", () => {
      expect(() => validateGitUrl("https://github.com/user/repo.git")).not.toThrow();
    });

    it("rejects git@localhost", () => {
      expect(() => validateGitUrl("git@localhost:user/repo.git")).toThrow("SSRF_BLOCKED");
    });

    it("rejects git@169.254.169.254", () => {
      expect(() => validateGitUrl("git@169.254.169.254:user/repo.git")).toThrow("SSRF_BLOCKED");
    });

    it("rejects link-local IPs in git URL", () => {
      expect(() => validateGitUrl("https://169.254.169.254/repo.git")).toThrow("SSRF_BLOCKED");
    });

    it("rejects private IPs in https URLs", () => {
      expect(() => validateGitUrl("https://192.168.1.1/repo.git")).toThrow("SSRF_BLOCKED");
      expect(() => validateGitUrl("https://10.0.0.1/repo.git")).toThrow("SSRF_BLOCKED");
    });
  });

  describe("parseGitUrl", () => {
    it("parses https git URL", () => {
      const url = parseGitUrl("https://github.com/user/repo.git");
      expect(url?.hostname).toBe("github.com");
    });

    it("parses git@ ssh URL", () => {
      const url = parseGitUrl("git@github.com:user/repo.git");
      expect(url?.hostname).toBe("github.com");
    });

    it("rejects file:// URLs", () => {
      expect(parseGitUrl("file:///home/user/repo")).toBeNull();
    });
  });
});
