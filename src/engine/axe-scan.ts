import { readFileSync } from "fs";
import path from "path";
import type { Page } from "playwright-core";
import { takeScreenshot } from "./browser";
import { deriveRuleMappings } from "./wcag-registry";

declare global {
  interface Window {
    axe: {
      run: (options: Record<string, unknown>) => Promise<AxeResult>;
    };
    __ableBboxes: Record<string, { x: number; y: number; width: number; height: number } | null>;
  }
}

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

export interface ScanResult {
  findings: Finding[];
  axeVersion: string;
  screenshot: Buffer;
}

// The `automated` module (src/lib/audit-modules.ts) advertises coverage of
// every non-manual SC in the registry, including AAA — the *aaa tags must
// stay here or that promise silently doesn't hold.
export const AXE_RUN_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag2aaa",
  "wcag21a",
  "wcag21aa",
  "wcag21aaa",
  "wcag22aa",
  "wcag22aaa",
  "best-practice",
];

export async function runAxe(page: Page): Promise<ScanResult> {
  // Resolve axe-core from the filesystem directly. Next.js/Turbopack mangles
  // require.resolve() output inside server bundles (returns the module spec
  // like "…\axe.js [app-route] (ecmascript)" instead of a real path).
  const axePath = path.join(process.cwd(), "node_modules", "axe-core", "axe.js");
  const axeSource = readFileSync(axePath, "utf-8");
  await page.addScriptTag({ content: axeSource });

  const axeResult = await Promise.race([
    page.evaluate(
      (tags) =>
        window.axe.run({
          runOnly: {
            type: "tag",
            values: tags,
          },
        }) as Promise<AxeResult>,
      AXE_RUN_TAGS,
    ),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AXE_TIMEOUT")), 15_000)
    ),
  ]);

  const axeVersion = axeResult.testEngine?.version || "unknown";
  const screenshot = await takeScreenshot(page);

  const bboxes = await resolveBboxes(page, axeResult);

  const findings = extractFindings(axeResult, axeVersion, bboxes);

  return { findings, axeVersion, screenshot };
}

async function resolveBboxes(
  page: Page,
  result: AxeResult
): Promise<Map<string, { x: number; y: number; width: number; height: number }>> {
  const allTargets = [
    ...result.violations,
    ...result.incomplete,
  ].flatMap((v) =>
    v.nodes.map((n) => ({ ruleId: v.id, target: n.target }))
  );

  const bboxMap = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();

  const targets = allTargets.map((t) => ({
    selector: t.target.join(" "),
    key: `${t.ruleId}-${t.target.join(" ")}`,
  }));

  await page.evaluate(({ targets }) => {
    window.__ableBboxes = {};
    for (const { selector, key } of targets) {
      try {
        const parts = selector.split(" >>> ");
        let el: Element | null = null;
        if (parts.length > 1) {
          let root: Document | ShadowRoot | Element = document;
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (root instanceof Document || root instanceof ShadowRoot) {
              el = root.querySelector(part);
            } else {
              el = (root as Element).shadowRoot?.querySelector(part) || null;
            }
            if (!el) break;
            if (i < parts.length - 1) {
              root = (el as Element).shadowRoot || document;
            }
          }
        } else {
          el = document.querySelector(selector);
        }
        if (el) {
          const rect = el.getBoundingClientRect();
          window.__ableBboxes[key] = {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        }
      } catch {
        window.__ableBboxes[key] = null;
      }
    }
  }, { targets });

  const resolved = await page.evaluate(
    () => window.__ableBboxes || {}
  );

  for (const [key, val] of Object.entries(resolved)) {
    if (val) bboxMap.set(key, val as { x: number; y: number; width: number; height: number });
  }

  return bboxMap;
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
      // section508-only rule) — and even then, prefer a rule-specific tag
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

function extractWcagLevel(tags: string[]): string | null {
  for (const tag of tags) {
    if (tag.includes("aa")) return "AA";
    if (tag.includes("aaa")) return "AAA";
    if (tag.includes("a")) return "A";
  }
  return null;
}

function extractPrinciple(criterion: string | null): string | null {
  if (!criterion) return null;
  const num = parseFloat(criterion);
  if (isNaN(num)) return null;
  if (num < 2) return "Perceivable";
  if (num < 3) return "Operable";
  if (num < 4) return "Understandable";
  return "Robust";
}
