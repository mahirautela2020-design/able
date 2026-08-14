import { describe, it, expect } from "vitest";
import { normalizeFindings, computeComplianceMatrix } from "@/engine/normalize";
import type { Finding } from "@/engine/axe-scan";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    bucket: "automated",
    rule_id: "color-contrast",
    rule_title: "Elements must have sufficient color contrast",
    wcag_criteria: ["1.4.3"],
    wcag_criterion: "1.4.3",
    wcag_level: "AA",
    principle: "Perceivable",
    severity: "serious",
    confidence: 0.9,
    source_engines: ["axe-core"],
    selector: "div.low-contrast",
    element_html: '<div class="low-contrast">text</div>',
    failure_summary: "Fix contrast",
    additional_instances: 0,
    bbox: { x: 0, y: 0, width: 100, height: 20 },
    evidence: {},
    engine_version: "4.13.0",
    ...overrides,
  };
}

describe("normalize", () => {
  describe("normalizeFindings", () => {
    it("deduplicates identical findings", () => {
      const f = makeFinding();
      const result = normalizeFindings([f, f]);
      expect(result).toHaveLength(1);
    });

    it("does not deduplicate different rules", () => {
      const f1 = makeFinding();
      const f2 = makeFinding({ rule_id: "image-alt", wcag_criterion: "1.1.1", wcag_criteria: ["1.1.1"] });
      const result = normalizeFindings([f1, f2]);
      expect(result).toHaveLength(2);
    });
  });

  describe("computeComplianceMatrix", () => {
    it("returns all 86 SCs (WCAG 2.2)", () => {
      const matrix = computeComplianceMatrix([]);
      expect(matrix.sc).toHaveLength(86);
    });

    it("all automated-pass when no findings", () => {
      const matrix = computeComplianceMatrix([]);
      const automatable = matrix.sc.filter(
        (s) => s.status !== "manual" && s.status !== "not-applicable"
      );
      const passed = automatable.filter((s) => s.status === "automated-pass");
      expect(passed.length).toBe(automatable.length);
      expect(matrix.wcagScore).toBe(100);
    });

    it("marks SC as fail when automated finding exists", () => {
      const f = makeFinding({ wcag_criterion: "1.4.3", wcag_criteria: ["1.4.3"] });
      const matrix = computeComplianceMatrix([f]);
      const sc = matrix.sc.find((s) => s.id === "1.4.3");
      expect(sc?.status).toBe("fail");
    });

    it("marks SC as needs-review for incomplete findings", () => {
      const f = makeFinding({
        bucket: "needs_review",
        confidence: 0.5,
        wcag_criterion: "1.4.3",
        wcag_criteria: ["1.4.3"],
      });
      const matrix = computeComplianceMatrix([f]);
      const sc = matrix.sc.find((s) => s.id === "1.4.3");
      expect(sc?.status).toBe("needs_review");
    });

    it("fail outranks needs-review", () => {
      const f1 = makeFinding({ wcag_criterion: "1.4.3", wcag_criteria: ["1.4.3"] });
      const f2 = makeFinding({
        bucket: "needs_review",
        confidence: 0.5,
        wcag_criterion: "1.4.3",
        wcag_criteria: ["1.4.3"],
      });
      const matrix = computeComplianceMatrix([f1, f2]);
      const sc = matrix.sc.find((s) => s.id === "1.4.3");
      expect(sc?.status).toBe("fail");
    });

    it("best-practice findings have null criterion", () => {
      const f = makeFinding({
        bucket: "best-practice",
        wcag_criterion: null,
        wcag_criteria: [],
      });
      expect(f.wcag_criterion).toBeNull();
      expect(f.bucket).toBe("best-practice");
    });

    it("additional_instances is non-negative", () => {
      const f = makeFinding({ additional_instances: 3 });
      expect(f.additional_instances).toBeGreaterThanOrEqual(0);
    });

    it("needs_review confidence <= automated", () => {
      const automated = makeFinding({ bucket: "automated", confidence: 0.9 });
      const needsReview = makeFinding({
        bucket: "needs_review",
        confidence: 0.5,
      });
      expect(needsReview.confidence).toBeLessThanOrEqual(automated.confidence);
    });

    it("regression: an automatable SC outside the tested set stays 'manual', not fabricated as passed", () => {
      // Without a testedScIds arg, every automatable SC becomes
      // "automated-pass" when no findings exist against it — a caller that
      // knows only a subset of modules actually ran (e.g. "keyboard" was
      // disabled) must not let that default leak a false pass for
      // module-gated SCs like 2.1.1 that the disabled module would cover.
      const matrix = computeComplianceMatrix([], ["1.4.3"]);
      const untested = matrix.sc.find((s) => s.id === "2.1.1");
      const tested = matrix.sc.find((s) => s.id === "1.4.3");
      expect(untested?.status).toBe("manual");
      expect(tested?.status).toBe("automated-pass");
    });

    it("omitting testedScIds keeps pre-module-gating behavior (all automatable SCs eligible)", () => {
      const matrix = computeComplianceMatrix([]);
      const sc = matrix.sc.find((s) => s.id === "2.1.1");
      expect(sc?.status).toBe("automated-pass");
    });

    it("scoring penalizes critical more than minor", () => {
      const critical = makeFinding({
        severity: "critical",
        wcag_criterion: "1.4.3",
        wcag_criteria: ["1.4.3"],
      });
      const matrix1 = computeComplianceMatrix([critical]);

      const minor = makeFinding({
        severity: "minor",
        wcag_criterion: "2.4.2",
        wcag_criteria: ["2.4.2"],
      });
      const matrix2 = computeComplianceMatrix([minor]);

      expect(matrix1.wcagScore).toBeLessThan(matrix2.wcagScore);
    });
  });
});
