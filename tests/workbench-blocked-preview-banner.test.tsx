import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("Workbench — single preview toolbar row, centered status messaging", () => {
  it("shows exactly one 'blocks embedding' notice, not a duplicated toolbar row", async () => {
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
      expect(screen.getAllByText(/blocks direct embedding/i).length).toBeGreaterThan(0)
    );
    // Only one notice — there is no longer a second toolbar row duplicating
    // the same "blocks embedding ... Open live site" message.
    expect(screen.getAllByText(/blocks direct embedding/i)).toHaveLength(1);
    // The single nav row keeps exactly the five specified controls.
    expect(screen.getByText("← Back")).toBeInTheDocument();
    expect(screen.getByText("Open live site")).toBeInTheDocument();
    expect(screen.getByText("Reload preview")).toBeInTheDocument();
    expect(screen.getByText("Render like a browser")).toBeInTheDocument();
  });

  it("falls back to the audited screenshot with a centered message when the proxy itself fails to render", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("/api/preview-proxy?")) {
          return { ok: false, status: 502, headers: new Headers({ "content-type": "application/json" }) };
        }
        return { ok: true, json: async () => ({ blocked: false }) };
      })
    );
    render(
      <Workbench
        auditId="audit-1"
        targetUrl="https://www.qantas.com"
        auditStatus="complete"
        findings={[findingWithScreenshot]}
      />
    );

    await waitFor(() =>
      expect(
        screen.getByAltText(/Full-page screenshot of https:\/\/www\.qantas\.com/i)
      ).toBeInTheDocument()
    );
    expect(screen.getByText(/isn.t available for this site/i)).toBeInTheDocument();
  });
});
