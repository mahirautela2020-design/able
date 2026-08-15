import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Workbench } from "@/components/workbench/workbench";

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ blocked: false, snapshot: null }) })
  );
}

describe("Workbench — four left-column tabs, fixed right preview", () => {
  it("exposes Checklist / Inspect / Screen Reader / Accessibility tabs", () => {
    stubFetch();
    render(
      <Workbench auditId="a1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );
    for (const label of ["Checklist", "Inspect", "Screen Reader", "Accessibility"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Preview is present from the start and stays across tab switches.
    expect(screen.getByTitle("Live preview of https://example.com")).toBeInTheDocument();
  });

  it("the Accessibility tab renders the UX4G-style controls inline in the left column", () => {
    stubFetch();
    render(
      <Workbench auditId="a1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );

    fireEvent.click(screen.getByText("Accessibility"));

    expect(screen.getByTestId("a11y-options-inline")).toBeInTheDocument();
    // A representative UX4G control is present (contrast dropdown).
    expect(screen.getByTestId("a11y-contrast")).toBeInTheDocument();
    // Preview stays on the right.
    expect(screen.getByTitle("Live preview of https://example.com")).toBeInTheDocument();
  });
});
