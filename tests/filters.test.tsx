import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Filters, applyFilters, type FilterState } from "@/components/workbench/filters";
import type { FindingRow } from "@/lib/axe/types";

const mockFindings: FindingRow[] = [
  {
    id: "f-1", audit_id: "a1", page_id: "page-001", bucket: "automated",
    rule_id: "r1", rule_title: "A", wcag_criteria: [], wcag_criterion: "1.4.3",
    wcag_level: "AA", principle: "P", severity: "critical", confidence: 0.9,
    source_engines: ["axe"], selector: null, element_html: null,
    failure_summary: "", additional_instances: 0, screenshot_crop_url: null,
    full_screenshot_url: null, recommendation: null, evidence: {}, engine_version: null,
  },
  {
    id: "f-2", audit_id: "a1", page_id: "page-001", bucket: "automated",
    rule_id: "r2", rule_title: "B", wcag_criteria: [], wcag_criterion: "1.1.1",
    wcag_level: "A", principle: "P", severity: "serious", confidence: 0.9,
    source_engines: ["axe"], selector: null, element_html: null,
    failure_summary: "", additional_instances: 0, screenshot_crop_url: null,
    full_screenshot_url: null, recommendation: null, evidence: {}, engine_version: null,
  },
  {
    id: "f-3", audit_id: "a1", page_id: "page-002", bucket: "needs_review",
    rule_id: "r3", rule_title: "C", wcag_criteria: [], wcag_criterion: "4.1.2",
    wcag_level: "A", principle: "R", severity: "moderate", confidence: 0.5,
    source_engines: ["axe"], selector: null, element_html: null,
    failure_summary: "", additional_instances: 0, screenshot_crop_url: null,
    full_screenshot_url: null, recommendation: null, evidence: {}, engine_version: null,
  },
];

describe("applyFilters", () => {
  it("returns all findings with default filters", () => {
    const filters: FilterState = { severity: "all", level: "all", pageId: "all", status: "all" };
    expect(applyFilters(mockFindings, filters)).toHaveLength(3);
  });

  it("filters by severity", () => {
    const filters: FilterState = { severity: "critical", level: "all", pageId: "all", status: "all" };
    const result = applyFilters(mockFindings, filters);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("critical");
  });

  it("filters by level AA", () => {
    const filters: FilterState = { severity: "all", level: "AA", pageId: "all", status: "all" };
    const result = applyFilters(mockFindings, filters);
    expect(result).toHaveLength(1);
    expect(result[0].wcag_criterion).toBe("1.4.3");
  });

  it("filters by page", () => {
    const filters: FilterState = { severity: "all", level: "all", pageId: "page-002", status: "all" };
    const result = applyFilters(mockFindings, filters);
    expect(result).toHaveLength(1);
    expect(result[0].page_id).toBe("page-002");
  });

  it("filters by status needs_review", () => {
    const filters: FilterState = { severity: "all", level: "all", pageId: "all", status: "needs_review" };
    const result = applyFilters(mockFindings, filters);
    expect(result).toHaveLength(1);
    expect(result[0].bucket).toBe("needs_review");
  });

  it("combines multiple filters", () => {
    const filters: FilterState = { severity: "serious", level: "A", pageId: "all", status: "automated" };
    const result = applyFilters(mockFindings, filters);
    expect(result).toHaveLength(1);
    expect(result[0].rule_id).toBe("r2");
  });

  it("returns empty when no matches", () => {
    const filters: FilterState = { severity: "minor", level: "all", pageId: "all", status: "all" };
    expect(applyFilters(mockFindings, filters)).toHaveLength(0);
  });
});

describe("Filters component", () => {
  it("renders filter buttons", () => {
    const filters: FilterState = { severity: "all", level: "all", pageId: "all", status: "all" };
    render(
      <Filters filters={filters} onChange={() => {}} pageIds={["page-001", "page-002"]} />
    );

    expect(screen.getByText("Severity:")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Serious")).toBeInTheDocument();
    expect(screen.getByText("Level:")).toBeInTheDocument();
    expect(screen.getByText("AA")).toBeInTheDocument();
    expect(screen.getByText("Status:")).toBeInTheDocument();
    expect(screen.getByText("Automated")).toBeInTheDocument();
  });
});
