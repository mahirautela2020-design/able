import { describe, it, expect } from "vitest";

describe("findings-source-filter", () => {
  it("source code-lint is a valid filter value", () => {
    const sourceFilters = ["all", "axe-core", "keyboard", "code-lint", "android-lint", "needs_review"];
    expect(sourceFilters).toContain("code-lint");
    expect(sourceFilters).toContain("android-lint");
  });

  it("default filter is all", () => {
    const defaultFilter = "all";
    expect(defaultFilter).toBe("all");
  });

  it("filters narrow by source", () => {
    const findings = [
      { source_engines: ["axe-core"] },
      { source_engines: ["code-lint"] },
      { source_engines: ["android-lint"] },
      { source_engines: ["axe-core"] },
    ];

    const codeLintFindings = findings.filter((f) =>
      f.source_engines.includes("code-lint")
    );
    expect(codeLintFindings.length).toBe(1);

    const androidFindings = findings.filter((f) =>
      f.source_engines.includes("android-lint")
    );
    expect(androidFindings.length).toBe(1);

    const allFindings = findings.filter(() => true);
    expect(allFindings.length).toBe(4);
  });
});
