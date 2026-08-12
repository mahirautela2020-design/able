import { describe, it, expect } from "vitest";
import { getMaturityQuestions } from "@/lib/maturity/questions";

describe("maturity/questions", () => {
  const questions = getMaturityQuestions();

  it("has 25 questions", () => {
    expect(questions).toHaveLength(25);
  });

  it("weights sum to 100", () => {
    const totalWeight = questions.reduce((sum, q) => sum + q.weight, 0);
    expect(totalWeight).toBe(100);
  });

  it("has no duplicate ids", () => {
    const ids = questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every scoreRange is bounded [0, 4]", () => {
    for (const q of questions) {
      expect(q.scoreRange[0]).toBe(0);
      expect(q.scoreRange[1]).toBe(4);
    }
  });

  it("all questions have valid domains", () => {
    const validDomains = ["governance", "design", "dev", "qa", "ops"];
    for (const q of questions) {
      expect(validDomains).toContain(q.domain);
    }
  });

  it("all questions have non-empty text", () => {
    for (const q of questions) {
      expect(q.text.length).toBeGreaterThan(10);
    }
  });

  it("each domain has exactly 5 questions", () => {
    const domainCounts = new Map<string, number>();
    for (const q of questions) {
      domainCounts.set(q.domain, (domainCounts.get(q.domain) || 0) + 1);
    }
    for (const [, count] of domainCounts) {
      expect(count).toBe(5);
    }
  });
});
