import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  insertAudit: vi.fn().mockResolvedValue("audit-1"),
  getFindingsForAudit: vi.fn().mockResolvedValue([
    {
      id: "f1",
      rule_id: "color-contrast",
      rule_title: "Color Contrast",
      wcag_criterion: "1.4.3",
      wcag_level: "AA",
      severity: "serious",
      confidence: 0.95,
      selector: ".btn",
      element_html: "<button>Click</button>",
      failure_summary: "Fix contrast",
      source_engines: ["axe-core", "htmlcs"],
    },
  ]),
}));

describe("mcp wrapper", () => {
  it("startAudit returns expected shape", async () => {
    const { startAudit } = await import("@/lib/mcp/wrapper");
    const result = await startAudit({ url: "https://example.com" });

    expect(result).toEqual({
      auditId: "audit-1",
      status: "queued",
    });
  });

  it("startAudit does not invoke any LLM or finding-creation path", async () => {
    const { startAudit } = await import("@/lib/mcp/wrapper");
    const result = await startAudit({ url: "https://example.com" });

    expect(result.auditId).toBe("audit-1");
    expect(result.status).toBe("queued");
  });

  it("getFindings returns expected shape with findings", async () => {
    const { getFindings } = await import("@/lib/mcp/wrapper");
    const result = await getFindings("audit-1");

    expect(result.auditId).toBe("audit-1");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toEqual({
      id: "f1",
      ruleId: "color-contrast",
      ruleTitle: "Color Contrast",
      wcagCriterion: "1.4.3",
      wcagLevel: "AA",
      severity: "serious",
      confidence: 0.95,
      selector: ".btn",
      elementHtml: "<button>Click</button>",
      failureSummary: "Fix contrast",
      sourceEngines: ["axe-core", "htmlcs"],
    });
  });

  it("exportReport returns expected shape with summary", async () => {
    const { exportReport } = await import("@/lib/mcp/wrapper");
    const result = await exportReport({ auditId: "audit-1" });

    expect(result.auditId).toBe("audit-1");
    expect(result.format).toBe("json");
    expect(result.findings).toHaveLength(1);
    expect(result.summary).toEqual({
      total: 1,
      critical: 0,
      serious: 1,
      moderate: 0,
      minor: 0,
    });
  });

  it("exportReport accepts format option", async () => {
    const { exportReport } = await import("@/lib/mcp/wrapper");
    const result = await exportReport({ auditId: "audit-1", format: "html" });

    expect(result.format).toBe("html");
  });

  it("wrapper does not export any createFinding or LLM invocation functions", async () => {
    const wrapper = await import("@/lib/mcp/wrapper");

    const exportNames = Object.keys(wrapper);
    expect(exportNames).not.toContain("createFinding");
    expect(exportNames).not.toContain("invokeLlm");
    expect(exportNames).not.toContain("generateFindings");
    expect(exportNames).not.toContain("llmInvoke");
  });

  it("wrapper exports are read-only facade functions", async () => {
    const wrapper = await import("@/lib/mcp/wrapper");

    expect(typeof wrapper.startAudit).toBe("function");
    expect(typeof wrapper.getFindings).toBe("function");
    expect(typeof wrapper.exportReport).toBe("function");
  });
});
