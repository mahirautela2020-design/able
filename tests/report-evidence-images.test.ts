import { describe, it, expect } from "vitest";
import { vi } from "vitest";

interface FindingRow {
  id: string;
  wcag_criterion: string | null;
  wcag_criteria: string[];
  severity: string;
  rule_title: string;
  failure_summary: string;
  bucket: string;
  selector: string | null;
  screenshot_crop_url: string | null;
  full_screenshot_url: string | null;
}

const auditRow = {
  id: "audit-1",
  target_url: "https://example.com",
  status: "complete",
  created_at: "2026-01-01T00:00:00Z",
  config: {},
};

const baseFinding: FindingRow = {
  id: "f1",
  wcag_criterion: "1.4.3",
  wcag_criteria: ["1.4.3"],
  severity: "serious",
  rule_title: "Insufficient color contrast",
  failure_summary: "Text fails 4.5:1",
  bucket: "automated",
  selector: "#cta",
  screenshot_crop_url: "https://storage.example/evidence/audit-1/crop.webp",
  full_screenshot_url: null,
};

const state = vi.hoisted(() => ({ findings: [] as unknown[] }));

vi.mock("@/lib/supabase/server", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "audits") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: auditRow, error: null }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === "findings") {
        return {
          select: () => ({
            eq: async () => ({ data: state.findings, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
  uploadEvidence: async () => "audit-1/report.html",
}));

import { buildReportHtml } from "@/lib/report";

describe("buildReportHtml — evidence images (regression: PDF route resolved signed URLs for a section that never rendered any <img> tags)", () => {
  it("embeds an <img> for each finding that has a screenshot, using the raw stored path (the PDF route substitutes it for a signed URL afterward)", async () => {
    state.findings = [
      baseFinding,
      { ...baseFinding, id: "f2", rule_title: "Missing accessible name", selector: "#icon-btn", screenshot_crop_url: null },
    ];

    const html = await buildReportHtml("audit-1");

    expect(html).toContain("<h2>Evidence</h2>");
    expect(html).toContain('src="https://storage.example/evidence/audit-1/crop.webp"');
    expect(html).toContain("Insufficient color contrast");
    expect(html).toContain("1.4.3");
  });

  it("omits the Evidence section entirely when no finding has a screenshot", async () => {
    state.findings = [{ ...baseFinding, screenshot_crop_url: null, full_screenshot_url: null }];

    const html = await buildReportHtml("audit-1");

    expect(html).not.toContain("<h2>Evidence</h2>");
    expect(html).not.toContain('<div class="evidence-entry">');
  });

  it("falls back to full_screenshot_url when screenshot_crop_url is absent", async () => {
    state.findings = [
      { ...baseFinding, screenshot_crop_url: null, full_screenshot_url: "https://storage.example/evidence/audit-1/full.webp" },
    ];

    const html = await buildReportHtml("audit-1");

    expect(html).toContain('src="https://storage.example/evidence/audit-1/full.webp"');
  });
});

describe("buildReportHtml — compliance-matrix status is a text badge, not an emoji (regression: SC status column rendered as a bare emoji glyph — unclear/unreadable in the PDF, especially once rasterized)", () => {
  it("renders a labeled text badge for every SC status and no emoji glyphs", async () => {
    state.findings = [baseFinding];

    const html = await buildReportHtml("audit-1");

    expect(html).toMatch(/<span class="badge badge-\w+">[\w\s/]+<\/span>/);
    expect(html).not.toMatch(/[✅❌👁🖐]/);
  });
});
