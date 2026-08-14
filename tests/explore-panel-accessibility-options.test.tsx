import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExplorePanel } from "@/components/workbench/explore/explore-panel";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExplorePanel — Accessibility Options widget wiring", () => {
  it("renders the Accessibility Options FAB over the preview", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ snapshot: null }) })
    );

    render(<ExplorePanel targetUrl="https://example.com/page" auditId="audit-1" />);

    expect(screen.getByTestId("a11y-options-fab")).toBeInTheDocument();
  });

  it("selecting an orientation resizes the preview container (simulated device rotation)", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ snapshot: null }) })
    );

    render(<ExplorePanel targetUrl="https://example.com/page" auditId="audit-1" />);

    const iframe = screen.getByTitle("Explore preview");
    const wrapper = iframe.parentElement as HTMLElement;
    expect(wrapper.style.width).toBe("");

    fireEvent.click(screen.getByTestId("a11y-options-fab"));
    fireEvent.click(screen.getByTestId("a11y-orientation-portrait"));

    expect(wrapper.style.width).toBe("420px");
  });
});
