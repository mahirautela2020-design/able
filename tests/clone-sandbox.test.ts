import { describe, it, expect } from "vitest";
import { validateSandboxPath } from "@/lib/git/clone";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("clone-sandbox", () => {
  describe("validateSandboxPath", () => {
    it("accepts valid sandbox path", () => {
      expect(() =>
        validateSandboxPath(join(tmpdir(), "audit-test123-abc"))
      ).not.toThrow();
    });

    it("rejects path with .. traversal", () => {
      const tempBase = tmpdir();
      const badPath = `${tempBase}\\audit-test-abc\\..\\outside`;
      expect(() =>
        validateSandboxPath(badPath)
      ).toThrow();
    });

    it("rejects path outside temp dir", () => {
      expect(() => validateSandboxPath("/etc/audit-test-abc")).toThrow("outside sandbox");
    });

    it("rejects path without audit- prefix", () => {
      expect(() => validateSandboxPath(join(tmpdir(), "some-file"))).toThrow("Unexpected path");
    });
  });

  describe("cleanupClone safety", () => {
    it("validateSandboxPath catches non-temp paths", () => {
      expect(() => validateSandboxPath("/tmp/other-12345")).toThrow();
    });

    it("validateSandboxPath catches no-audit-id paths", () => {
      expect(() => validateSandboxPath(join(tmpdir(), "audit-"))).toThrow("No audit ID");
    });
  });
});
