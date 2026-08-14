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

describe("Workbench — left-column mode nav (regression: Contrast Lab/SR were buried in a toolbar button and a page-level section below the whole workbench)", () => {
  it("switching to 'Screen Reader' mode replaces the main area with the merged SrPreview+NvdaPanel panel", () => {
    stubFetch();
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );

    fireEvent.click(screen.getByText("Screen Reader"));

    expect(screen.getByTestId("screen-reader-panel")).toBeInTheDocument();
    expect(screen.queryByTitle("Live preview of https://example.com")).not.toBeInTheDocument();
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

    expect(screen.getByText("1.1.1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("1. Perceivable"));
    expect(screen.queryByText("1.1.1")).not.toBeInTheDocument();
  });
});
