import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FindingsListClient } from "@/components/workbench/findings-list";
import type { FindingRow } from "@/lib/axe/types";

const mockFindings: FindingRow[] = [
  {
    id: "find-001",
    audit_id: "audit-1",
    page_id: "page-001",
    bucket: "automated",
    rule_id: "color-contrast",
    rule_title: "Elements must meet minimum color contrast ratio thresholds",
    wcag_criteria: ["wcag143"],
    wcag_criterion: "1.4.3",
    wcag_level: "AA",
    principle: "Perceivable",
    severity: "serious",
    confidence: 0.9,
    source_engines: ["axe-core"],
    selector: "#hero .cta-button",
    element_html: "<button>Click me</button>",
    failure_summary: "Insufficient color contrast of 3.2:1",
    additional_instances: 0,
    screenshot_crop_url: null,
    full_screenshot_url: null,
    recommendation: "Darken text",
    evidence: {},
    engine_version: "4.13.0",
  },
  {
    id: "find-002",
    audit_id: "audit-1",
    page_id: "page-001",
    bucket: "needs_review",
    rule_id: "aria-allowed-role",
    rule_title: "ARIA role must be appropriate",
    wcag_criteria: ["wcag412"],
    wcag_criterion: "4.1.2",
    wcag_level: "A",
    principle: "Robust",
    severity: "moderate",
    confidence: 0.5,
    source_engines: ["axe-core"],
    selector: "div[role=button]",
    element_html: "<div role='button'>Send</div>",
    failure_summary: "Needs review",
    additional_instances: 0,
    screenshot_crop_url: null,
    full_screenshot_url: null,
    recommendation: "Use <button> instead",
    evidence: {},
    engine_version: "4.13.0",
  },
];

const mockPages = [
  { id: "page-001", page_title: "Home" },
  { id: "page-002", page_title: "About" },
];

describe("findings-list", () => {
  it("shows findings grouped by WCAG criterion", () => {
    render(
      <FindingsListClient
        findings={mockFindings}
        scopePages={mockPages}
        auditUrl="https://example.com"
        auditCreatedAt="2026-08-01T10:00:00Z"
      />
    );

    expect(screen.getByText("1.4.3")).toBeInTheDocument();
    expect(screen.getByText("4.1.2")).toBeInTheDocument();
  });

  it("shows audit information in header", () => {
    render(
      <FindingsListClient
        findings={mockFindings}
        scopePages={mockPages}
        auditUrl="https://example.com"
        auditCreatedAt="2026-08-01T10:00:00Z"
      />
    );

    expect(screen.getByText(/example\.com/)).toBeInTheDocument();
  });

  it("shows finding count per criterion", () => {
    render(
      <FindingsListClient
        findings={mockFindings}
        scopePages={mockPages}
        auditUrl="https://example.com"
        auditCreatedAt="2026-08-01T10:00:00Z"
      />
    );

    const counts = screen.getAllByText("1 finding");
    expect(counts.length).toBe(2);
  });

  it("shows empty state when no findings", () => {
    render(
      <FindingsListClient
        findings={[]}
        scopePages={mockPages}
        auditUrl="https://example.com"
        auditCreatedAt="2026-08-01T10:00:00Z"
      />
    );

    expect(screen.getByText("No findings")).toBeInTheDocument();
  });

  it("opens finding detail on row click", async () => {
    const user = userEvent.setup();

    render(
      <FindingsListClient
        findings={mockFindings}
        scopePages={mockPages}
        auditUrl="https://example.com"
        auditCreatedAt="2026-08-01T10:00:00Z"
      />
    );

    const firstFindingBtn = screen.getByText("Elements must meet minimum color contrast ratio thresholds").closest("button");
    expect(firstFindingBtn).not.toBeNull();

    await user.click(firstFindingBtn!);

    expect(screen.getByText("Finding Detail")).toBeInTheDocument();
    expect(screen.getByText("Rule: color-contrast")).toBeInTheDocument();
  });
});
