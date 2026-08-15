import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NvdaPanel } from "@/components/workbench/nvda-panel";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("NvdaPanel", () => {
  it("renders as plain always-visible text, not a collapsible section", () => {
    render(<NvdaPanel auditId="audit-1" />);
    expect(screen.getByText("Screen reader (NVDA)")).toBeInTheDocument();
    expect(screen.getByText(/only run when this app is running locally/i)).toBeInTheDocument();
    expect(screen.getByText("Run local NVDA check")).toBeInTheDocument();
  });

  it("shows an honest unavailable note when NVDA is not present", async () => {
    stubFetch({
      available: false,
      reason: "nvda-not-found",
      announcements: [],
      silentElements: [],
      suggestions: [],
    });

    render(<NvdaPanel auditId="audit-1" />);
    fireEvent.click(screen.getByText("Run local NVDA check"));

    await waitFor(() => {
      expect(screen.getByText(/nvda-not-found/)).toBeInTheDocument();
    });
  });

  it("lists announcements and silent elements when NVDA is available", async () => {
    stubFetch({
      available: true,
      announcements: [
        {
          at: 1,
          element: "#a",
          role: "link",
          name: "Home",
          level: null,
          spoken: "Home, link",
        },
      ],
      silentElements: [{ element: "#empty", role: "button" }],
      suggestions: [
        {
          rule_id: "nvda-coverage-summary",
          rule_title: "coverage",
          detail: "1 interactive element(s) walked; 1 silent.",
          wcag_criterion: null,
        },
      ],
    });

    render(<NvdaPanel auditId="audit-1" />);
    fireEvent.click(screen.getByText("Run local NVDA check"));

    await waitFor(() => {
      expect(screen.getByText(/announces nothing/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Home, link/)).toBeInTheDocument();
    expect(screen.getByText(/#empty/)).toBeInTheDocument();
  });
});
