import { describe, it, expect } from "vitest";
import { checkTouchTargets } from "@/lib/audit/touch-targets";
import type { DetectedElement } from "@/lib/audit/detection-types";

function el(overrides: Partial<DetectedElement> = {}): DetectedElement {
  return {
    label: "button",
    confidence: 0.9,
    bbox: { x: 0, y: 0, w: 44, h: 44 },
    class: "button",
    ...overrides,
  };
}

function byCriterion(findings: ReturnType<typeof checkTouchTargets>, criterion: string) {
  return findings.filter((f) => f.wcagCriterion === criterion);
}

describe("checkTouchTargets (WCAG 2.5.8)", () => {
  it("emits a critical violation for a target below 24×24 CSS px", () => {
    const findings = checkTouchTargets([el({ bbox: { x: 0, y: 0, w: 23, h: 24 } })]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      bucket: "violation",
      severity: "critical",
      ruleId: "touch-target-2.5.8",
      wcagCriterion: "2.5.8",
    });
  });

  it("flags a 24×24 target as needs_review (below 44 recommendation)", () => {
    const findings = checkTouchTargets([el({ bbox: { x: 0, y: 0, w: 24, h: 24 } })]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      bucket: "needs_review",
      severity: "moderate",
      wcagCriterion: "2.5.8",
    });
  });

  it("emits no finding for a 44×44 target", () => {
    const findings = checkTouchTargets([el({ bbox: { x: 0, y: 0, w: 44, h: 44 } })]);
    expect(findings).toHaveLength(0);
  });

  it("converts device pixels to CSS px via devicePixelRatio", () => {
    // 48 device px at dpr=2 → 24 CSS px → needs_review (not violation).
    const ok = checkTouchTargets(
      [el({ bbox: { x: 0, y: 0, w: 48, h: 48 } })],
      2
    );
    expect(ok).toHaveLength(1);
    expect(ok[0]!.bucket).toBe("needs_review");

    // 46 device px at dpr=2 → 23 CSS px → violation.
    const bad = checkTouchTargets(
      [el({ bbox: { x: 0, y: 0, w: 46, h: 48 } })],
      2
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]!.bucket).toBe("violation");
  });

  it("flags adjacent targets closer than 8 CSS px as needs_review", () => {
    const findings = checkTouchTargets([
      el({ bbox: { x: 0, y: 0, w: 44, h: 44 }, label: "a" }),
      el({ bbox: { x: 51, y: 0, w: 44, h: 44 }, label: "b" }), // 7px gap
    ]);
    const overlap = findings.find((f) => f.evidence.otherLabel === "b");
    expect(overlap).toBeDefined();
    expect(overlap!.bucket).toBe("needs_review");
  });

  it("does not flag targets 8 CSS px or more apart", () => {
    const findings = checkTouchTargets([
      el({ bbox: { x: 0, y: 0, w: 44, h: 44 }, label: "a" }),
      el({ bbox: { x: 52, y: 0, w: 44, h: 44 }, label: "b" }), // 8px gap
    ]);
    expect(findings).toHaveLength(0);
  });

  it("downgrades borderline-confidence (<0.5) violations to needs_review", () => {
    const findings = checkTouchTargets([
      el({ bbox: { x: 0, y: 0, w: 23, h: 24 }, confidence: 0.45 }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.bucket).toBe("needs_review");
    expect(findings[0]!.severity).toBe("moderate");
  });

  it("ignores non-interactive classes (text, image, icon)", () => {
    const findings = checkTouchTargets([
      el({ bbox: { x: 0, y: 0, w: 10, h: 10 }, class: "text" }),
      el({ bbox: { x: 0, y: 0, w: 10, h: 10 }, class: "image" }),
      el({ bbox: { x: 0, y: 0, w: 10, h: 10 }, class: "icon" }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("ignores elements below the 0.4 confidence floor entirely", () => {
    const findings = checkTouchTargets([
      el({ bbox: { x: 0, y: 0, w: 10, h: 10 }, confidence: 0.3 }),
    ]);
    expect(byCriterion(findings, "2.5.8")).toHaveLength(0);
  });
});
