import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Workbench, formatEta } from "@/components/workbench/workbench";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("formatEta (regression: ETA was shown in raw seconds, no explicit percentage)", () => {
  it("shows a sub-minute ETA as '<1 min left'", () => {
    expect(formatEta(45)).toBe("<1 min left");
  });

  it("rounds to whole minutes for longer ETAs", () => {
    expect(formatEta(245)).toBe("~4 min left");
  });
});

describe("Workbench — running-audit progress bar shows an explicit percentage", () => {
  it("renders a percent number alongside the page count and minute-scale ETA", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          audit: { status: "running", progress: { pagesDone: 2, pagesTotal: 5 } },
          findings: [],
        }),
      })
    );

    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="running" findings={[]} />
    );

    await waitFor(() => expect(screen.getByText(/40% · Scanning page 2 of 5/)).toBeInTheDocument());
  });
});
