import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Workbench } from "@/components/workbench/workbench";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ blocked: false, snapshot: null }) })
  );
}

describe("Workbench — Inspect tab (left-column tools + shared right preview)", () => {
  it("always shows the shared live preview on the right", () => {
    stubFetch();
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );
    expect(screen.getByTitle("Live preview of https://example.com")).toBeInTheDocument();
  });

  it("clicking 'Inspect' shows the Element Inspector rail in the left column while the preview stays on the right", () => {
    stubFetch();
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );

    fireEvent.click(screen.getByText("Inspect"));

    expect(screen.getByTestId("inspect-rail")).toBeInTheDocument();
    expect(screen.getByText("Element Inspector")).toBeInTheDocument();
    // The preview is fixed on the right, not swapped away.
    expect(screen.getByTitle("Live preview of https://example.com")).toBeInTheDocument();
  });

  it("switching back to 'Checklist' hides the inspector rail (preview stays)", () => {
    stubFetch();
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );

    fireEvent.click(screen.getByText("Inspect"));
    expect(screen.getByTestId("inspect-rail")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Checklist"));
    expect(screen.queryByTestId("inspect-rail")).not.toBeInTheDocument();
    expect(screen.getByTitle("Live preview of https://example.com")).toBeInTheDocument();
  });
});
