// Pure logic for turning a Contrast Lab pick into a findings-table row. No
// I/O here — the route (src/app/api/audits/[id]/contrast-finding/route.ts)
// owns screenshot capture, cropping, and the Supabase writes; this module
// only decides ratio/verdict/criterion/severity, so it's unit-testable
// without a browser or a database.
import { contrastRatio, contrastVerdict, requiredContrastRatio } from "@/lib/contrast";
import { apcaContrast } from "@/lib/apca";

export type ContrastCriterion = "1.4.3" | "1.4.6" | "1.4.11";
export type ContrastSeverity = "serious" | "moderate";

/** 1.4.3 (text, AA) / 1.4.6 (text, AAA "Contrast Enhanced") applies when the
 * element carries visible text; otherwise the relevant criterion is 1.4.11
 * (non-text / UI component contrast — WCAG defines no AAA tier for it, so
 * `level` only affects the text branch). */
export function pickContrastCriterion(
  hasText: boolean,
  level: "AA" | "AAA" = "AA"
): ContrastCriterion {
  if (!hasText) return "1.4.11";
  return level === "AAA" ? "1.4.6" : "1.4.3";
}

/** Coarse two-tier severity: well below the AA floor is "serious",
 * borderline-below is "moderate". */
function severityFromRatio(ratio: number): ContrastSeverity {
  return ratio < 3.0 ? "serious" : "moderate";
}

export interface ContrastFindingInput {
  auditId: string;
  pageId: string;
  selector: string;
  elementHtml: string | null;
  fg: string;
  bg: string;
  hasText: boolean;
  /** The target the user picked in Contrast Lab's AA/AAA + normal/large
   * selector — determines both the required ratio and, for text, which
   * criterion (1.4.3 vs 1.4.6) the flagged failure is recorded against.
   * Default AA/normal-text preserves pre-selector behavior. */
  level?: "AA" | "AAA";
  largeText?: boolean;
}

export interface ContrastFindingComputed {
  criterion: ContrastCriterion;
  ratio: number;
  apcaLc: number;
  row: {
    audit_id: string;
    page_id: string;
    bucket: string;
    rule_id: string;
    rule_title: string;
    wcag_criteria: string[];
    wcag_criterion: string;
    wcag_level: string;
    principle: string;
    severity: string;
    confidence: number;
    source_engines: string[];
    selector: string;
    element_html: string | null;
    failure_summary: string;
    additional_instances: number;
    recommendation: string | null;
    evidence: Record<string, unknown>;
    engine_version: string | null;
  };
}

/**
 * Computes the contrast verdict SERVER-SIDE from the posted colors (never
 * trust a client-computed ratio) and assembles the findings row. The caller
 * (the route) is responsible for only invoking this for pairs that actually
 * fail AA — a passing pair is not a violation.
 */
export function buildContrastFinding(input: ContrastFindingInput): ContrastFindingComputed {
  const level = input.level ?? "AA";
  const largeText = input.largeText ?? false;
  const ratio = contrastRatio(input.fg, input.bg);
  const verdict = contrastVerdict(ratio, largeText);
  const apcaLc = apcaContrast(input.fg, input.bg);
  const criterion = pickContrastCriterion(input.hasText, level);
  const severity = severityFromRatio(ratio);
  const required = requiredContrastRatio(level, largeText, input.hasText);

  const failureSummary =
    criterion === "1.4.11"
      ? `Element color ${input.fg} on background ${input.bg} has ${ratio.toFixed(2)}:1 contrast — below the ${required.toFixed(1)}:1 minimum for non-text/UI components (WCAG 1.4.11).`
      : `Text color ${input.fg} on background ${input.bg} has ${ratio.toFixed(2)}:1 contrast — below the ${required.toFixed(1)}:1 ${level} minimum for ${largeText ? "large " : ""}text (WCAG ${criterion}).`;

  return {
    criterion,
    ratio,
    apcaLc,
    row: {
      audit_id: input.auditId,
      page_id: input.pageId,
      bucket: "automated",
      rule_id: "contrast-lab-flag",
      rule_title:
        criterion === "1.4.11"
          ? "Contrast Lab: non-text contrast flagged"
          : "Contrast Lab: text contrast flagged",
      wcag_criteria: [`wcag${criterion.replace(/\./g, "")}`],
      wcag_criterion: criterion,
      wcag_level: criterion === "1.4.11" ? "AA" : level,
      principle: "Perceivable",
      severity,
      confidence: 1,
      source_engines: ["contrast-lab"],
      selector: input.selector,
      element_html: input.elementHtml,
      failure_summary: failureSummary,
      additional_instances: 0,
      recommendation: null,
      evidence: {
        fg: input.fg,
        bg: input.bg,
        ratio,
        apcaLc,
        target: { level, largeText },
        passesAA: verdict.passesAA,
        passesAAA: verdict.passesAAA,
      },
      engine_version: null,
    },
  };
}
