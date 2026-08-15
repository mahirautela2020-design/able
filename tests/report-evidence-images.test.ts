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

describe("buildReportHtml — findings + evidence are merged into one section (regression: screenshots lived in a separate 'Evidence' appendix a reader had to cross-reference back to the finding by WCAG number)", () => {
  it("embeds each finding's screenshot inline in its own Findings entry, using the raw stored path (the PDF route substitutes it for a signed URL afterward)", async () => {
    state.findings = [
      baseFinding,
      { ...baseFinding, id: "f2", rule_title: "Missing accessible name", selector: "#icon-btn", screenshot_crop_url: null },
    ];

    const html = await buildReportHtml("audit-1");

    expect(html).toContain('<h2 id="findings">Findings</h2>');
    expect(html).not.toContain("<h2>Evidence</h2>");
    expect(html).toContain('src="https://storage.example/evidence/audit-1/crop.webp"');
    expect(html).toContain("Insufficient color contrast");
    expect(html).toContain("1.4.3");
    // The Findings section (which now carries screenshots) must appear
    // before the Compliance Matrix, not after it.
    expect(html.indexOf('<h2 id="findings">Findings</h2>')).toBeLessThan(
      html.indexOf('<h2 id="matrix">WCAG 2.2 Compliance Matrix</h2>')
    );
  });

  it("still lists a finding even when it has no screenshot, with a fallback note instead of an <img>", async () => {
    state.findings = [{ ...baseFinding, screenshot_crop_url: null, full_screenshot_url: null }];

    const html = await buildReportHtml("audit-1");

    expect(html).toContain('<h2 id="findings">Findings</h2>');
    expect(html).toContain("No screenshot captured for this finding.");
    expect(html).not.toContain("<img");
  });

  it("falls back to full_screenshot_url when screenshot_crop_url is absent", async () => {
    state.findings = [
      { ...baseFinding, screenshot_crop_url: null, full_screenshot_url: "https://storage.example/evidence/audit-1/full.webp" },
    ];

    const html = await buildReportHtml("audit-1");

    expect(html).toContain('src="https://storage.example/evidence/audit-1/full.webp"');
  });
});

describe("buildReportHtml — findings are grouped by severity with a jump-link table of contents (DB insertion order has no relationship to importance — a reader should be able to triage critical issues first)", () => {
  it("groups findings under severity subheadings, worst severity first, each with a jump-link anchor", async () => {
    state.findings = [
      { ...baseFinding, id: "f-minor", severity: "minor", rule_title: "Minor issue" },
      { ...baseFinding, id: "f-critical", severity: "critical", rule_title: "Critical issue" },
      { ...baseFinding, id: "f-serious", severity: "serious", rule_title: "Serious issue" },
    ];

    const html = await buildReportHtml("audit-1");

    expect(html).toContain('id="findings-critical"');
    expect(html).toContain('id="findings-serious"');
    expect(html).toContain('id="findings-minor"');
    // Worst-first ordering: critical heading appears before serious, which
    // appears before minor.
    const criticalIdx = html.indexOf('id="findings-critical"');
    const seriousIdx = html.indexOf('id="findings-serious"');
    const minorIdx = html.indexOf('id="findings-minor"');
    expect(criticalIdx).toBeLessThan(seriousIdx);
    expect(seriousIdx).toBeLessThan(minorIdx);
  });

  it("renders a table of contents linking to Executive Summary, each severity group, and the Compliance Matrix", async () => {
    state.findings = [baseFinding];

    const html = await buildReportHtml("audit-1");

    expect(html).toContain('<a href="#summary">Executive Summary</a>');
    expect(html).toContain('<a href="#findings-serious">');
    expect(html).toContain('<a href="#matrix">WCAG 2.2 Compliance Matrix</a>');
    // Anchors must actually exist on the headings they point to.
    expect(html).toContain('id="summary"');
    expect(html).toContain('id="matrix"');
  });
});

describe("buildReportHtml — WCAG 2.2 Compliance Matrix uses the full 'Success Criterion' header, not the abbreviation", () => {
  it("labels the SC-number column 'Success Criterion'", async () => {
    state.findings = [baseFinding];

    const html = await buildReportHtml("audit-1");

    expect(html).toContain("<th>Success Criterion</th>");
    expect(html).not.toContain("<th>SC</th>");
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
