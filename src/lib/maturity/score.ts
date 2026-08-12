import { getMaturityQuestions } from "./questions";

export interface MaturityAnswers {
  [questionId: string]: number;
}

export interface DomainScore {
  domain: string;
  score: number;
  maxScore: number;
  answeredQuestions: number;
}

export type MaturityLevel =
  | "Reactive"
  | "Proactive"
  | "Managed"
  | "Optimizing"
  | "Leading";

export interface MaturityResult {
  overall: number;
  byDomain: DomainScore[];
  level: MaturityLevel;
}

export function computeMaturityScore(
  answers: MaturityAnswers
): MaturityResult {
  const questions = getMaturityQuestions();
  const domainMap = new Map<string, { totalWeight: number; weightedScore: number; answered: number }>();

  let totalWeight = 0;
  let weightedSum = 0;

  for (const q of questions) {
    const answer = answers[q.id];
    const domainKey = q.domain;

    if (!domainMap.has(domainKey)) {
      domainMap.set(domainKey, { totalWeight: 0, weightedScore: 0, answered: 0 });
    }
    const domain = domainMap.get(domainKey)!;

    if (answer !== undefined && answer !== null) {
      const clamped = Math.max(q.scoreRange[0], Math.min(q.scoreRange[1], answer));
      domain.weightedScore += (clamped / q.scoreRange[1]) * q.weight;
      domain.answered += 1;
      weightedSum += (clamped / q.scoreRange[1]) * q.weight;
    }
    domain.totalWeight += q.weight;
    totalWeight += q.weight;
  }

  const byDomain: DomainScore[] = [];
  for (const [domainKey, d] of domainMap) {
    byDomain.push({
      domain: domainKey,
      score: d.totalWeight > 0 ? Math.round((d.weightedScore / d.totalWeight) * 400) / 100 : 0,
      maxScore: 4,
      answeredQuestions: d.answered,
    });
  }

  const overall =
    totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 400) / 100
      : 0;

  let level: MaturityLevel;
  if (overall < 1) {
    level = "Reactive";
  } else if (overall < 2) {
    level = "Proactive";
  } else if (overall < 3) {
    level = "Managed";
  } else if (overall < 4) {
    level = "Optimizing";
  } else {
    level = "Leading";
  }

  return { overall, byDomain, level };
}
