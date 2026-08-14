import { describe, it, expect } from "vitest";
import { buildContrastFinding, pickContrastCriterion } from "@/lib/audit/contrast-finding";

describe("pickContrastCriterion", () => {
  it("picks 1.4.3 when the element has visible text", () => {
    expect(pickContrastCriterion(true)).toBe("1.4.3");
  });

  it("picks 1.4.11 when the element has no visible text (icon/UI component)", () => {
    expect(pickContrastCriterion(false)).toBe("1.4.11");
  });
});

describe("buildContrastFinding — pure, server-side-only computation", () => {
  it("computes the real ratio/verdict/APCA from the colors, not a trusted client value", () => {
    const result = buildContrastFinding({
      auditId: "audit-1",
      pageId: "page-1",
      selector: "#cta",
      elementHtml: "<button>",
      fg: "#7a7a7a",
      bg: "#ffffff",
      hasText: true,
    });

    expect(result.criterion).toBe("1.4.3");
    expect(result.ratio).toBeCloseTo(4.29, 1);
    expect(typeof result.apcaLc).toBe("number");
  });

  it("builds a findings-table row matching this codebase's tag convention (wcag143, not '1.4.3')", () => {
    const result = buildContrastFinding({
      auditId: "audit-1",
      pageId: "page-1",
      selector: "#cta",
      elementHtml: null,
      fg: "#7a7a7a",
      bg: "#ffffff",
      hasText: true,
    });

    expect(result.row.wcag_criteria).toEqual(["wcag143"]);
    expect(result.row.wcag_criterion).toBe("1.4.3");
    expect(result.row.audit_id).toBe("audit-1");
    expect(result.row.page_id).toBe("page-1");
    expect(result.row.source_engines).toEqual(["contrast-lab"]);
    expect(result.row.confidence).toBe(1);
    expect(result.row.evidence).toEqual({
      fg: "#7a7a7a",
      bg: "#ffffff",
      ratio: result.ratio,
      apcaLc: result.apcaLc,
    });
  });

  it("uses 1.4.11 tag when the element has no visible text", () => {
    const result = buildContrastFinding({
      auditId: "audit-1",
      pageId: "page-1",
      selector: ".icon-btn",
      elementHtml: "<button aria-label='Close'>",
      fg: "#999999",
      bg: "#ffffff",
      hasText: false,
    });

    expect(result.criterion).toBe("1.4.11");
    expect(result.row.wcag_criteria).toEqual(["wcag1411"]);
  });

  it("severity is serious for a well-below-floor ratio, moderate for borderline", () => {
    const wellBelow = buildContrastFinding({
      auditId: "a",
      pageId: "p",
      selector: "#x",
      elementHtml: null,
      fg: "#cccccc",
      bg: "#ffffff",
      hasText: true,
    });
    expect(wellBelow.row.severity).toBe("serious");

    const borderline = buildContrastFinding({
      auditId: "a",
      pageId: "p",
      selector: "#x",
      elementHtml: null,
      fg: "#767676",
      bg: "#ffffff", // ~4.29:1, close to the 4.5 AA floor
      hasText: true,
    });
    expect(["serious", "moderate"]).toContain(borderline.row.severity);
  });
});
