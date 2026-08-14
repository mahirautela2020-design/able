import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { getWcagRegistry } from "@/engine/wcag-registry";
import { PRINCIPLES, filterScsByPrinciple, Workbench } from "@/components/workbench/workbench";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("workbench principle filter", () => {
  it("matches registry entries for every principle tab (regression: numeric key vs word mismatch)", () => {
    const registry = getWcagRegistry();
    const scList = registry.map((sc) => ({ sc, count: 0, worst: "minor", status: "pass" as const }));

    for (const p of PRINCIPLES) {
      const result = filterScsByPrinciple(scList, p.key, "ALL");
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it("returns exactly the registry SCs whose principle matches the tab, for AA level", () => {
    const registry = getWcagRegistry();
    const scList = registry.map((sc) => ({ sc, count: 0, worst: "minor", status: "pass" as const }));

    const perceivableAA = filterScsByPrinciple(scList, "1", "AA");
    expect(perceivableAA.length).toBeGreaterThan(0);
    expect(perceivableAA.every((r) => r.sc.principle === "Perceivable" && r.sc.level === "AA")).toBe(true);
  });

  it("renders SC row buttons in the Workbench checklist instead of the empty state (reproduces the reported symptom)", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ blocked: false }) })
    );

    render(
      <Workbench
        auditId="audit-1"
        targetUrl="https://example.com"
        auditStatus="complete"
        findings={[]}
      />
    );

    // Default active principle is "1" (Perceivable) — real SC rows (e.g. 1.4.3)
    // must render, and the always-empty placeholder must not.
    expect(screen.getByText("1.4.3")).toBeInTheDocument();
    expect(
      screen.queryByText("No criteria under this principle and level.")
    ).not.toBeInTheDocument();
  });
});
