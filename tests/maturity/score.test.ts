import { describe, it, expect } from "vitest";
import { computeMaturityScore } from "@/lib/maturity/score";

describe("maturity/score", () => {
  it("all-0 answers produce Reactive level", () => {
    const answers = Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [
        `q-${i}`,
        0,
      ])
    );
    const result = computeMaturityScore(answers);
    expect(result.level).toBe("Reactive");
    expect(result.overall).toBeLessThan(1);
  });

  it("mid-range answers produce Managed level", () => {
    const answers: Record<string, number> = {};
    const ids = [
      "gov-1", "gov-2", "gov-3", "gov-4", "gov-5",
      "design-1", "design-2", "design-3", "design-4", "design-5",
      "dev-1", "dev-2", "dev-3", "dev-4", "dev-5",
      "qa-1", "qa-2", "qa-3", "qa-4", "qa-5",
      "ops-1", "ops-2", "ops-3", "ops-4", "ops-5",
    ];
    for (const id of ids) {
      answers[id] = 2;
    }
    const result = computeMaturityScore(answers);
    expect(result.overall).toBeGreaterThanOrEqual(1);
    expect(result.overall).toBeLessThan(3);
    expect(result.level).toBe("Managed");
  });

  it("all-4 answers produce Leading level", () => {
    const answers: Record<string, number> = {};
    const ids = [
      "gov-1", "gov-2", "gov-3", "gov-4", "gov-5",
      "design-1", "design-2", "design-3", "design-4", "design-5",
      "dev-1", "dev-2", "dev-3", "dev-4", "dev-5",
      "qa-1", "qa-2", "qa-3", "qa-4", "qa-5",
      "ops-1", "ops-2", "ops-3", "ops-4", "ops-5",
    ];
    for (const id of ids) {
      answers[id] = 4;
    }
    const result = computeMaturityScore(answers);
    expect(result.overall).toBe(4);
    expect(result.level).toBe("Leading");
  });

  it("mixed domain weighting affects byDomain scores", () => {
    const answers: Record<string, number> = {
      "gov-1": 4, "gov-2": 4, "gov-3": 4, "gov-4": 4, "gov-5": 4,
      "design-1": 0, "design-2": 0, "design-3": 0, "design-4": 0, "design-5": 0,
      "dev-1": 2, "dev-2": 2, "dev-3": 2, "dev-4": 2, "dev-5": 2,
      "qa-1": 2, "qa-2": 2, "qa-3": 2, "qa-4": 2, "qa-5": 2,
      "ops-1": 2, "ops-2": 2, "ops-3": 2, "ops-4": 2, "ops-5": 2,
    };
    const result = computeMaturityScore(answers);
    const gov = result.byDomain.find((d) => d.domain === "governance")!;
    const design = result.byDomain.find((d) => d.domain === "design")!;
    expect(gov.score).toBe(4);
    expect(design.score).toBe(0);
    expect(result.byDomain).toHaveLength(5);
  });

  it("handles empty answers gracefully", () => {
    const result = computeMaturityScore({});
    expect(result.overall).toBe(0);
    expect(result.level).toBe("Reactive");
  });
});
