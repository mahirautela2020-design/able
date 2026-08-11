import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FindingDetail } from "@/components/workbench/finding-detail";
import type { FindingRow } from "@/lib/axe/types";

const mockFinding: FindingRow = {
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
  element_html: "<button class=\"my-btn\">Click me</button>",
  failure_summary: "Element has insufficient color contrast of 3.2:1",
  additional_instances: 2,
  screenshot_crop_url: null,
  full_screenshot_url: null,
  recommendation: "Darken text to #595959",
  evidence: {},
  engine_version: "4.13.0",
};

describe("finding-detail", () => {
  it("returns null when finding is null", () => {
    const { container } = render(
      <FindingDetail finding={null} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows severity badge and WCAG level", () => {
    render(<FindingDetail finding={mockFinding} onClose={() => {}} />);

    expect(screen.getByText("Finding Detail")).toBeInTheDocument();
    expect(screen.getByText("AA")).toBeInTheDocument();
  });

  it("shows pinned axe rule id", () => {
    render(<FindingDetail finding={mockFinding} onClose={() => {}} />);

    expect(screen.getByText(/color-contrast/)).toBeInTheDocument();
  });

  it("shows rule title", () => {
    render(<FindingDetail finding={mockFinding} onClose={() => {}} />);

    expect(
      screen.getByText("Elements must meet minimum color contrast ratio thresholds")
    ).toBeInTheDocument();
  });

  it("shows failure summary", () => {
    render(<FindingDetail finding={mockFinding} onClose={() => {}} />);

    expect(
      screen.getByText("Element has insufficient color contrast of 3.2:1")
    ).toBeInTheDocument();
  });

  it("shows element HTML", () => {
    render(<FindingDetail finding={mockFinding} onClose={() => {}} />);

    const elements = screen.getAllByText(/Click me/);
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows CSS selector", () => {
    render(<FindingDetail finding={mockFinding} onClose={() => {}} />);

    expect(screen.getByText("#hero .cta-button")).toBeInTheDocument();
  });

  it("shows recommendation", () => {
    render(<FindingDetail finding={mockFinding} onClose={() => {}} />);

    expect(screen.getByText("Darken text to #595959")).toBeInTheDocument();
  });

  it("shows additional instances count in technical details", () => {
    render(<FindingDetail finding={mockFinding} onClose={() => {}} />);

    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("shows WCAG criterion chip", () => {
    render(<FindingDetail finding={mockFinding} onClose={() => {}} />);

    expect(screen.getByText("1.4.3")).toBeInTheDocument();
  });

  it("has close button", () => {
    render(<FindingDetail finding={mockFinding} onClose={() => {}} />);

    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });
});
