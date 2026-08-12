import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceViewer } from "@/components/workbench/evidence-viewer";
import type { FindingRow } from "@/lib/axe/types";

const findingWithScreenshots: FindingRow = {
  id: "f-1",
  audit_id: "a1",
  page_id: "p1",
  bucket: "automated",
  rule_id: "color-contrast",
  rule_title: "Color contrast",
  wcag_criteria: [],
  wcag_criterion: null,
  wcag_level: null,
  principle: null,
  severity: "serious",
  confidence: 0.9,
  source_engines: ["axe-core"],
  selector: "#hero",
  element_html: "<div>hi</div>",
  failure_summary: "Bad contrast",
  additional_instances: 0,
  screenshot_crop_url: "https://example.com/crop.png",
  full_screenshot_url: "https://example.com/full.png",
  recommendation: null,
  evidence: {},
  engine_version: null,
};

const findingNoScreenshots: FindingRow = {
  ...findingWithScreenshots,
  screenshot_crop_url: null,
  full_screenshot_url: null,
};

describe("evidence-viewer", () => {
  it("shows alt text on full screenshot image", () => {
    render(<EvidenceViewer finding={findingWithScreenshots} />);

    const fullImg = screen.getByAltText("Full page screenshot for color-contrast finding");
    expect(fullImg).toBeInTheDocument();
    expect(fullImg).toHaveAttribute("src", "https://example.com/full.png");
  });

  it("shows alt text on cropped evidence image", () => {
    render(<EvidenceViewer finding={findingWithScreenshots} />);

    const cropImg = screen.getByAltText("Cropped evidence for color-contrast");
    expect(cropImg).toBeInTheDocument();
    expect(cropImg).toHaveAttribute("src", "https://example.com/crop.png");
  });

  it("shows placeholder text when no screenshots", () => {
    render(<EvidenceViewer finding={findingNoScreenshots} />);

    expect(
      screen.getByText("No evidence screenshots available for this finding.")
    ).toBeInTheDocument();
  });

  it("shows DOM snippet when selector present", () => {
    render(<EvidenceViewer finding={findingWithScreenshots} />);

    expect(screen.getByText("DOM Snippet")).toBeInTheDocument();
  });

  it("shows heading Evidence", () => {
    render(<EvidenceViewer finding={findingWithScreenshots} />);

    expect(screen.getByText("Evidence")).toBeInTheDocument();
  });
});
