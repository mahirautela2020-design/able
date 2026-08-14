import type { Finding } from "@/engine/axe-scan";
import { getWcagRegistry } from "@/engine/wcag-registry";

export interface WcagScoreEntry {
  id: string;
  name: string;
  level: string;
  principle: string;
  status: "automated-pass" | "fail" | "needs_review" | "manual" | "not-applicable";
  findingsCount: number;
  evidenceLinks: string[];
}

export interface ComplianceMatrix {
  sc: WcagScoreEntry[];
  totalAutomatable: number;
  automatablePassed: number;
  wcagScore: number;
}

export function normalizeFindings(
  findings: Finding[]
): Finding[] {
  const deduped = deduplicate(findings);

  const bestPractice = deduped.filter(
    (f) => f.bucket === "best-practice"
  );
  const behavior = deduped.filter((f) => f.bucket === "behavior");
  const needsReview = deduped.filter((f) => f.bucket === "needs_review");
  const automated = deduped.filter((f) => f.bucket === "automated");

  return [...bestPractice, ...behavior, ...needsReview, ...automated];
}

function deduplicate(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.rule_id}-${f.selector}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param testedScIds When provided, only these SC ids are eligible to fall
 * back to "automated-pass" (an automatable SC with zero findings against
 * it). SCs outside this set stay "manual" instead of being reported as
 * passed — a module the user disabled never ran, so there's no basis to
 * claim it passed. Omit to keep the pre-module-gating behavior (every
 * automatable SC is eligible), used by callers that don't have a module
 * selection to scope against.
 */
export function computeComplianceMatrix(
  findings: Finding[],
  testedScIds?: Iterable<string>
): ComplianceMatrix {
  const registry = getWcagRegistry();
  const scMap = new Map<string, WcagScoreEntry>();

  for (const sc of registry) {
    scMap.set(sc.id, {
      id: sc.id,
      name: sc.name,
      level: sc.level,
      principle: sc.principle,
      status: "manual",
      findingsCount: 0,
      evidenceLinks: [],
    });
  }

  const failMap = new Map<string, string[]>();
  const reviewMap = new Map<string, string[]>();

  for (const f of findings) {
    for (const sc of f.wcag_criteria) {
      if (f.bucket === "automated") {
        const existing = failMap.get(sc) || [];
        existing.push(f.rule_id);
        failMap.set(sc, existing);
      } else if (f.bucket === "needs_review") {
        const existing = reviewMap.get(sc) || [];
        existing.push(f.rule_id);
        reviewMap.set(sc, existing);
      }
    }
  }

  for (const [scId, rules] of failMap) {
    const entry = scMap.get(scId);
    if (entry) {
      entry.status = "fail";
      entry.findingsCount = rules.length;
    }
  }

  for (const [scId, rules] of reviewMap) {
    const entry = scMap.get(scId);
    if (entry && entry.status !== "fail") {
      entry.status = "needs_review";
      entry.findingsCount = rules.length;
    }
  }

  const testedSet = testedScIds ? new Set(testedScIds) : null;

  for (const sc of registry) {
    if (!sc.manualTest && (!testedSet || testedSet.has(sc.id))) {
      scMap.set(sc.id, {
        ...scMap.get(sc.id)!,
        ...(scMap.get(sc.id)!.status === "manual"
          ? { status: "automated-pass" }
          : {}),
      });
    }
  }

  const rows = registry.map((sc) => scMap.get(sc.id)!);

  const automatable = rows.filter((r) => r.status !== "manual" && r.status !== "not-applicable");
  const passed = automatable.filter((r) => r.status === "automated-pass");
  const automatableCount = automatable.length;
  const passedCount = passed.length;

  let score = automatableCount > 0
    ? 100 * (passedCount / automatableCount)
    : 100;

  const severityWeights: Record<string, number> = {
    critical: 10,
    serious: 5,
    moderate: 2,
    minor: 0.5,
  };

  const failingFindings = findings.filter((f) => f.bucket === "automated");
  const failedScSet = new Set(
    failingFindings.flatMap((f) => f.wcag_criteria)
  );

  for (const scId of failedScSet) {
    const scFindings = failingFindings.filter((f) =>
      f.wcag_criteria.includes(scId)
    );
    const maxPenalty = scFindings.reduce((max, f) => {
      const w = severityWeights[f.severity] || 0;
      return Math.max(max, w);
    }, 0);
    score -= maxPenalty;
  }

  score = Math.max(0, score);
  score = Math.round(score * 10) / 10;

  return {
    sc: rows,
    totalAutomatable: automatableCount,
    automatablePassed: passedCount,
    wcagScore: score,
  };
}

export function buildProgress(
  pagesTotal: number,
  pagesDone: number,
  currentPage: string | null
) {
  return {
    pagesTotal,
    pagesDone,
    currentPage,
    updatedAt: new Date().toISOString(),
  };
}
