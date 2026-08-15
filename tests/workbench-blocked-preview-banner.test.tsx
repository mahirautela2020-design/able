import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Workbench, type WorkbenchFinding } from "@/components/workbench/workbench";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetchBlocked() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ blocked: true, snapshot: null }) })
  );
}

const findingWithScreenshot: WorkbenchFinding = {
  id: "f1",
  bucket: "automated",
  rule_id: "color-contrast",
  rule_title: "Insufficient contrast",
  wcag_criterion: "1.4.3",
  wcag_level: "AA",
  principle: "Perceivable",
  severity: "serious",
  selector: "#cta",
  failure_summary: "fails",
  screenshot_crop_url: null,
  full_screenshot_url: "https://example.com/evidence/full.png",
};

describe("Workbench — blocked-preview notice (regression: was duplicated across two stacked rows)", () => {
  it("shows exactly one 'blocks embedding' notice, not two", async () => {
    stubFetchBlocked();
    render(
      <Workbench
        auditId="audit-1"
        targetUrl="https://www.qantas.com"
        auditStatus="complete"
        findings={[findingWithScreenshot]}
      />
    );

    await waitFor(() =>
      expect(screen.getAllByText(/blocks embedding/i).length).toBeGreaterThan(0)
    );
    // Only one "blocks embedding" notice — previously stacked in two rows
    // (a dismissible banner plus a second, permanent toolbar with the same
    // message). The top URL toolbar has its own separate, always-present
    // "Open live site" link unrelated to this notice, so only the message
    // itself is asserted as singular here.
    expect(screen.getAllByText(/blocks embedding/i)).toHaveLength(1);
  });

  it("the screenshot/live-preview toggle lives in that single row and still works", async () => {
    stubFetchBlocked();
    render(
      <Workbench
        auditId="audit-1"
        targetUrl="https://www.qantas.com"
        auditStatus="complete"
        findings={[findingWithScreenshot]}
      />
    );

    await waitFor(() => expect(screen.getByText("Audited screenshot")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Audited screenshot"));
    expect(
      screen.getByAltText(/Full-page screenshot of https:\/\/www\.qantas\.com/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Live preview"));
    expect(screen.getByTitle(/Proxied preview of https:\/\/www\.qantas\.com/i)).toBeInTheDocument();
  });
});
