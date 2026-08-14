// Pure logic for turning a Contrast Lab pick into a findings-table row. No
// I/O here — the route (src/app/api/audits/[id]/contrast-finding/route.ts)
// owns screenshot capture, cropping, and the Supabase writes; this module
// only decides ratio/verdict/criterion/severity, so it's unit-testable
// without a browser or a database.
import { contrastRatio, contrastVerdict } from "@/lib/contrast";
import { apcaContrast } from "@/lib/apca";

export type ContrastCriterion = "1.4.3" | "1.4.11";
export type ContrastSeverity = "serious" | "moderate";

/** 1.4.3 (text) applies when the element carries visible text; otherwise the
 * relevant criterion is 1.4.11 (non-text / UI component contrast). */
export function pickContrastCriterion(hasText: boolean): ContrastCriterion {
  return hasText ? "1.4.3" : "1.4.11";
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
  const ratio = contrastRatio(input.fg, input.bg);
  const verdict = contrastVerdict(ratio);
  const apcaLc = apcaContrast(input.fg, input.bg);
  const criterion = pickContrastCriterion(input.hasText);
  const severity = severityFromRatio(ratio);

  const failureSummary =
    criterion === "1.4.3"
      ? `Text color ${input.fg} on background ${input.bg} has ${ratio.toFixed(2)}:1 contrast — below the ${verdict.requiredAA.toFixed(1)}:1 AA minimum for text (WCAG 1.4.3).`
      : `Element color ${input.fg} on background ${input.bg} has ${ratio.toFixed(2)}:1 contrast — below the 3:1 AA minimum for non-text/UI components (WCAG 1.4.11).`;

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
        criterion === "1.4.3"
          ? "Contrast Lab: text contrast flagged"
          : "Contrast Lab: non-text contrast flagged",
      wcag_criteria: [`wcag${criterion.replace(/\./g, "")}`],
      wcag_criterion: criterion,
      wcag_level: "AA",
      principle: "Perceivable",
      severity,
      confidence: 1,
      source_engines: ["contrast-lab"],
      selector: input.selector,
      element_html: input.elementHtml,
      failure_summary: failureSummary,
      additional_instances: 0,
      recommendation: null,
      evidence: { fg: input.fg, bg: input.bg, ratio, apcaLc },
      engine_version: null,
    },
  };
}
