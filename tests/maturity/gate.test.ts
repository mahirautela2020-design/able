import { describe, it, expect } from "vitest";
import { getMaturityQuestions } from "@/lib/maturity/questions";
import { computeMaturityScore } from "@/lib/maturity/score";

describe("maturity gate", () => {
  it("passes maturity questionnaire unit tests", () => {
    const questions = getMaturityQuestions();
    expect(questions).toHaveLength(25);

    const totalWeight = questions.reduce((sum, q) => sum + q.weight, 0);
    expect(totalWeight).toBe(100);

    const ids = questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const q of questions) {
      expect(q.scoreRange[0]).toBe(0);
      expect(q.scoreRange[1]).toBe(4);
    }

    const answers: Record<string, number> = {};
    for (const q of questions) {
      answers[q.id] = 0;
    }
    const result = computeMaturityScore(answers);
    expect(result.level).toBe("Reactive");
    expect(result.overall).toBeLessThan(1);

    const all4: Record<string, number> = {};
    for (const q of questions) {
      all4[q.id] = 4;
    }
    const result4 = computeMaturityScore(all4);
    expect(result4.level).toBe("Leading");
    expect(result4.overall).toBe(4);
  });
});
