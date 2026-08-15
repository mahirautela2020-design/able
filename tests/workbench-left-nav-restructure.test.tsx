import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Workbench } from "@/components/workbench/workbench";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ blocked: false, lines: [] }) })
  );
}

describe("Workbench — left-column mode nav (regression: Inspect/Screen Reader were buried in a toolbar button and a page-level section below the whole workbench)", () => {
  it("switching to 'Screen Reader' shows the merged SrPreview+NvdaPanel in the left column while the preview stays on the right", () => {
    stubFetch();
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );

    fireEvent.click(screen.getByText("Screen Reader"));

    expect(screen.getByTestId("screen-reader-panel")).toBeInTheDocument();
    // Preview is fixed on the right for every tab now (not swapped away).
    expect(screen.getByTitle("Live preview of https://example.com")).toBeInTheDocument();
  });

  it("all four principle labels render as visible section headers (regression: unlabeled numeric tabs '1'/'2'/'3'/'4')", () => {
    stubFetch();
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );

    expect(screen.getByText("1. Perceivable")).toBeInTheDocument();
    expect(screen.getByText("2. Operable")).toBeInTheDocument();
    expect(screen.getByText("3. Understandable")).toBeInTheDocument();
    expect(screen.getByText("4. Robust")).toBeInTheDocument();
    // A criterion from a non-default (previously non-active) principle is
    // visible without clicking a tab first.
    expect(screen.getByText("2.1.1")).toBeInTheDocument();
  });

  it("clicking a principle header collapses its section", () => {
    stubFetch();
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );

    const header = screen.getByText("1. Perceivable").closest("button")!;
    expect(header).toHaveAttribute("aria-expanded", "true");
    // Content stays mounted (height-animated via CSS grid-rows, not
    // unmounted) so a screen reader / find-in-page doesn't lose it, but the
    // section reports itself collapsed and its wrapper is zeroed out.
    expect(screen.getByText("1.1.1")).toBeInTheDocument();

    fireEvent.click(header);

    expect(header).toHaveAttribute("aria-expanded", "false");
    const collapsedContent = screen.getByText("1.1.1");
    const gridWrapper = collapsedContent.closest('[style*="grid-template-rows"]');
    expect(gridWrapper).toHaveStyle({ gridTemplateRows: "0fr" });
  });
});
