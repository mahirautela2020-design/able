import { deriveRuleMappings } from "./wcag-registry";

/**
 * Pure, portable axe-result -> WCAG-mapped Finding conversion. Deliberately
 * has ZERO Node/Playwright dependencies (unlike axe-scan.ts, which also
 * drives a real browser via Playwright) so it can be bundled into contexts
 * that can't run Playwright at all -- e.g. the Chrome extension, which runs
 * axe-core directly in the already-open tab and needs the exact same
 * WCAG-criterion mapping the server-side web audit uses, not a re-derived
 * approximation.
 */

export interface AxeResult {
  violations: AxeViolation[];
  passes: unknown[];
  incomplete: AxeViolation[];
  inapplicable: unknown[];
  testEngine: { name: string; version: string };
}

export interface AxeViolation {
  id: string;
  help: string;
  helpUrl: string;
  impact: string | null;
  tags: string[];
  description: string;
  nodes: AxeNode[];
}

export interface AxeNode {
  html: string;
  impact: string | null;
  target: string[];
  failureSummary: string;
  any: unknown[];
  all: unknown[];
  none: unknown[];
}

export interface Finding {
  bucket: "automated" | "needs_review" | "behavior" | "best-practice";
  rule_id: string;
  rule_title: string;
  wcag_criteria: string[];
  wcag_criterion: string | null;
  wcag_level: string | null;
  principle: string | null;
  severity: "critical" | "serious" | "moderate" | "minor";
  confidence: number;
  source_engines: string[];
  selector: string;
  element_html: string;
  failure_summary: string;
  additional_instances: number;
  bbox: { x: number; y: number; width: number; height: number } | null;
  evidence: Record<string, unknown>;
  engine_version: string | null;
}

export function extractFindings(
  result: AxeResult,
  axeVersion: string,
  bboxes: Map<string, { x: number; y: number; width: number; height: number }>
): Finding[] {
  const findings: Finding[] = [];
  // axe's own tags array lists the WCAG *level* tag ("wcag2aa") before the
  // rule-specific SC tag ("wcag143"), so picking tags[0] as "the criterion"
  // silently stores a level, not a criterion. deriveRuleMappings() resolves
  // each rule id to its real, dotted SC id(s) instead.
  const ruleMappings = deriveRuleMappings();

  for (const violation of [
    ...result.violations.map((v) => ({ ...v, _type: "violation" as const })),
    ...result.incomplete.map((v) => ({ ...v, _type: "incomplete" as const })),
  ]) {
    const isIncomplete = violation._type === "incomplete";
    const isBestPractice = !violation.tags.some((t) => t.startsWith("wcag"));
    const wcagTags = violation.tags.filter(
      (t) => t.startsWith("wcag") || t.startsWith("section508")
    );
    const mappedScIds = ruleMappings.get(violation.id) ?? [];

    const severityMap: Record<string, Finding["severity"]> = {
      critical: "critical",
      serious: "serious",
      moderate: "moderate",
      minor: "minor",
    };

    const nodesToProcess = violation.nodes.slice(0, 4);
    const additionalInstances = Math.max(0, violation.nodes.length - 4);

    for (let i = 0; i < nodesToProcess.length; i++) {
      const node = nodesToProcess[i];
      const key = `${violation.id}-${node.target.join(" ")}`;
      const bbox = bboxes.get(key) || null;

      // Prefer the resolved dotted SC id(s). Fall back to the raw axe tags
      // only for the rare rule with no registry mapping (e.g. a
      // section508-only rule) -- and even then, prefer a rule-specific tag
      // ("wcag143") over a level tag ("wcag2aa"/"wcag21a"): axe always lists
      // the level tag first, so a plain [0] pick would silently repeat the
      // original bug for this fallback path.
      const specificFallbackTag = wcagTags.find((t) => /^wcag\d{3,}$/.test(t));
      const wcagCriterion =
        mappedScIds.length > 0
          ? mappedScIds[0]
          : specificFallbackTag ?? (wcagTags.length > 0 ? wcagTags[0] : null);

      findings.push({
        bucket: isIncomplete
          ? "needs_review"
          : isBestPractice
            ? "best-practice"
            : "automated",
        rule_id: violation.id,
        rule_title: violation.help,
        wcag_criteria: mappedScIds.length > 0 ? mappedScIds : wcagTags,
        wcag_criterion: isBestPractice ? null : wcagCriterion,
        wcag_level: extractWcagLevel(wcagTags),
        principle: extractPrinciple(wcagCriterion),
        severity: severityMap[violation.impact || "moderate"] || "moderate",
        confidence: isIncomplete ? 0.5 : 0.9,
        source_engines: ["axe-core"],
        selector: node.target.join(" "),
        element_html: node.html,
        failure_summary: node.failureSummary || violation.description,
        additional_instances: i === 0 ? additionalInstances : 0,
        bbox,
        evidence: {
          target: node.target,
          impact: node.impact || violation.impact,
          tags: violation.tags,
          helpUrl: violation.helpUrl,
        },
        engine_version: axeVersion,
      });
    }
  }

  return findings;
}

export function extractWcagLevel(tags: string[]): string | null {
  for (const tag of tags) {
    if (tag.includes("aa")) return "AA";
    if (tag.includes("aaa")) return "AAA";
    if (tag.includes("a")) return "A";
  }
  return null;
}

export function extractPrinciple(criterion: string | null): string | null {
  if (!criterion) return null;
  const num = parseFloat(criterion);
  if (isNaN(num)) return null;
  if (num < 2) return "Perceivable";
  if (num < 3) return "Operable";
  if (num < 4) return "Understandable";
  return "Robust";
}
