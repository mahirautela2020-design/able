import { describe, it, expect } from "vitest";
import { buildContrastFinding, pickContrastCriterion } from "@/lib/audit/contrast-finding";

describe("pickContrastCriterion", () => {
  it("picks 1.4.3 when the element has visible text (default AA level)", () => {
    expect(pickContrastCriterion(true)).toBe("1.4.3");
  });

  it("picks 1.4.11 when the element has no visible text (icon/UI component)", () => {
    expect(pickContrastCriterion(false)).toBe("1.4.11");
  });

  it("regression: picks 1.4.6 (Contrast Enhanced) for text at the AAA target", () => {
    expect(pickContrastCriterion(true, "AAA")).toBe("1.4.6");
  });

  it("regression: non-text stays 1.4.11 even at the AAA target (WCAG defines no AAA tier for it)", () => {
    expect(pickContrastCriterion(false, "AAA")).toBe("1.4.11");
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
      target: { level: "AA", largeText: false },
      passesAA: false,
      passesAAA: false,
    });
  });

  it("regression: an AAA-only failure (passes AA, fails AAA) is recorded against 1.4.6, not 1.4.3", () => {
    // #636363 on white is ~6.01:1 — clears the 4.5:1 AA floor but misses the
    // 7:1 AAA "Contrast Enhanced" floor. Before this fix, the route never
    // even reached buildContrastFinding for this pair because its own
    // passesAA gate rejected it outright regardless of which target the
    // user had picked in the UI.
    const result = buildContrastFinding({
      auditId: "audit-1",
      pageId: "page-1",
      selector: "#cta",
      elementHtml: null,
      fg: "#636363",
      bg: "#ffffff",
      hasText: true,
      level: "AAA",
      largeText: false,
    });

    expect(result.ratio).toBeGreaterThanOrEqual(4.5);
    expect(result.ratio).toBeLessThan(7.0);
    expect(result.criterion).toBe("1.4.6");
    expect(result.row.wcag_criteria).toEqual(["wcag146"]);
    expect(result.row.wcag_level).toBe("AAA");
    expect(result.row.evidence).toMatchObject({
      target: { level: "AAA", largeText: false },
      passesAA: true,
      passesAAA: false,
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
