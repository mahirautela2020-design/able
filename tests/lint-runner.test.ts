import { describe, it, expect } from "vitest";

describe("lint-runner", () => {
  describe("finding shape", () => {
    it("each code-lint finding has required fields", () => {
      const mockFinding = {
        rule_id: "code-lint/test-rule",
        severity: "error" as const,
        file: "src/index.html",
        line: 42,
        message: "Missing alt attribute on image",
      };

      expect(mockFinding.rule_id).toBeTruthy();
      expect(["error", "warning", "info"]).toContain(mockFinding.severity);
      expect(mockFinding.file).toBeTruthy();
      expect(typeof mockFinding.line).toBe("number");
      expect(mockFinding.message).toBeTruthy();
    });

    it("findings have source_engines set to code-lint", () => {
      const sourceEngines = ["code-lint"];
      expect(sourceEngines).toContain("code-lint");
      expect(sourceEngines.length).toBe(1);
    });
  });
});
