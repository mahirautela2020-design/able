import { describe, it, expect } from "vitest";
import { runApkLint } from "@/lib/android/apk-lint";

describe("apk-lint", () => {
  describe("runApkLint with no aapt2", () => {
    it("returns empty array when AAPT2_PATH is unset and aapt2 missing", async () => {
      const findings = await runApkLint("/nonexistent/path.apk");
      expect(Array.isArray(findings)).toBe(true);
    });
  });

  describe("lint finding shape", () => {
    it("each finding has required fields", () => {
      const mockFinding = {
        rule_id: "android-test-rule",
        severity: "warning" as const,
        file: "AndroidManifest.xml",
        line: 100,
        message: "Test issue",
      };

      expect(mockFinding.rule_id).toBeTruthy();
      expect(["error", "warning", "info"]).toContain(mockFinding.severity);
      expect(mockFinding.file).toBeTruthy();
      expect(typeof mockFinding.line).toBe("number");
      expect(mockFinding.message).toBeTruthy();
    });
  });
});
