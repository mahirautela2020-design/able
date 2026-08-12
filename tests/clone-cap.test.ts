import { describe, it, expect } from "vitest";
import { assertRepoSizeWithinCap, getDirectorySize, MAX_REPO_SIZE_MB } from "@/lib/git/clone";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("clone repo size cap (RISKS #6 — disk bomb guard)", () => {
  describe("assertRepoSizeWithinCap", () => {
    it("allows repos at or under the cap", () => {
      expect(() => assertRepoSizeWithinCap(0)).not.toThrow();
      expect(() => assertRepoSizeWithinCap(MAX_REPO_SIZE_MB)).not.toThrow();
    });

    it("rejects repos over the cap", () => {
      expect(() => assertRepoSizeWithinCap(MAX_REPO_SIZE_MB + 1)).toThrow(/exceeds cap/);
    });

    it("rejects multi-GB repos", () => {
      expect(() => assertRepoSizeWithinCap(10240)).toThrow(/exceeds cap/);
    });
  });

  describe("getDirectorySize", () => {
    it("computes directory size in MB (rounded up)", () => {
      const dir = mkdtempSync(join(tmpdir(), "clone-cap-test-"));
      try {
        writeFileSync(join(dir, "a.bin"), Buffer.alloc(1024 * 1024)); // 1 MB
        writeFileSync(join(dir, "b.bin"), Buffer.alloc(512 * 1024)); // 0.5 MB
        const sizeMb = getDirectorySize(dir);
        expect(sizeMb).toBe(2); // 1.5 MB → ceil = 2
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("returns 0 for a missing directory", () => {
      expect(getDirectorySize("/nonexistent/definitely-not-here")).toBe(0);
    });
  });
});
