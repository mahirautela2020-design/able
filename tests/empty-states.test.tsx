import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FindingsListClient } from "@/components/workbench/findings-list";
import { FindingDetail } from "@/components/workbench/finding-detail";
import { EvidenceViewer } from "@/components/workbench/evidence-viewer";
import ScopeDetailPage from "@/app/(app)/scope/[auditId]/page";
import AxSnapshotPage from "@/app/(app)/scope/[auditId]/snapshots/[pageId]/page";
import type { FindingRow } from "@/lib/axe/types";

async function renderAsync(element: React.ReactElement) {
  const result = await element;
  return render(result);
}

describe("empty-states", () => {
  describe("findings list empty state", () => {
    it("shows no findings message", () => {
      render(
        <FindingsListClient
          findings={[]}
          scopePages={[]}
          auditUrl="https://example.com"
          auditCreatedAt="2026-01-01T00:00:00Z"
        />
      );

      expect(screen.getByText("No findings")).toBeInTheDocument();
      expect(
        screen.getByText("No accessibility issues were found for this audit.")
      ).toBeInTheDocument();
    });
  });

  describe("scope page not found", () => {
    it("shows audit not found for unknown ID", async () => {
      const params = Promise.resolve({ auditId: "nonexistent-id" });
      await renderAsync(await ScopeDetailPage({ params }));

      expect(screen.getByText("Audit not found")).toBeInTheDocument();
    });
  });

  describe("ax snapshot not found", () => {
    it("shows not found for unknown page", async () => {
      const params = Promise.resolve({
        auditId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        pageId: "nonexistent-page",
      });
      await renderAsync(await AxSnapshotPage({ params }));

      expect(screen.getByText("AX Snapshot not found")).toBeInTheDocument();
    });
  });

  describe("evidence viewer no screenshots", () => {
    it("shows no evidence text", () => {
      const finding: FindingRow = {
        id: "f-1", audit_id: "a1", page_id: "p1", bucket: "automated",
        rule_id: "r1", rule_title: "Title", wcag_criteria: [], wcag_criterion: null,
        wcag_level: null, principle: null, severity: "minor", confidence: 0.9,
        source_engines: [], selector: null, element_html: null,
        failure_summary: "Summary", additional_instances: 0,
        screenshot_crop_url: null, full_screenshot_url: null,
        recommendation: null, evidence: {}, engine_version: null,
      };

      render(<EvidenceViewer finding={finding} />);

      expect(
        screen.getByText("No evidence screenshots available for this finding.")
      ).toBeInTheDocument();
    });
  });

  describe("finding detail null state", () => {
    it("renders nothing when finding is null", () => {
      const { container } = render(
        <FindingDetail finding={null} onClose={() => {}} />
      );
      expect(container.firstChild).toBeNull();
    });
  });
});
