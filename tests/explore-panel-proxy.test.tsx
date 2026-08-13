import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExplorePanel } from "@/components/workbench/explore/explore-panel";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExplorePanel — real-page inspection via the preview proxy", () => {
  it("iframes the target through /api/preview-proxy instead of loading it cross-origin directly", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ snapshot: null }) })
    );

    render(<ExplorePanel targetUrl="https://example.com/page" auditId="audit-1" />);

    const iframe = screen.getByTitle("Explore preview");
    expect(iframe).toHaveAttribute(
      "src",
      "/api/preview-proxy?url=" + encodeURIComponent("https://example.com/page")
    );
  });
});
