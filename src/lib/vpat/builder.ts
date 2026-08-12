import type { Finding } from "@/engine/axe-scan";
import type { MaturityResult } from "@/lib/maturity/score";
import { getVpatTemplate, getVpatCriteriaIds, type VpatSection, type VpatTemplate } from "./template";

export interface VpatBuildInput {
  findings: Finding[];
  maturity: MaturityResult | null;
}

export function buildVPAT(input: VpatBuildInput): VpatTemplate {
  const template = getVpatTemplate();
  const criteriaIds = getVpatCriteriaIds();
  const criteriaSet = new Set(criteriaIds);

  const findingsBySc = new Map<string, Finding[]>();

  for (const f of input.findings) {
    if (!f.wcag_criteria || f.wcag_criteria.length === 0) continue;
    for (const sc of f.wcag_criteria) {
      if (!criteriaSet.has(sc)) continue;
      const existing = findingsBySc.get(sc) || [];
      existing.push(f);
      findingsBySc.set(sc, existing);
    }
  }

  const severityRank: Record<string, number> = {
    critical: 4,
    serious: 3,
    moderate: 2,
    minor: 1,
  };

  template.sections = template.sections.map((section) => {
    const scId = section.criteria.split(" ")[0];
    const findings = findingsBySc.get(scId) || [];

    if (findings.length === 0) {
      return {
        ...section,
        conformance: "Supports" as const,
        remarks: "No automated violations detected.",
      };
    }

    const maxSeverity = findings.reduce((max, f) => {
      const rank = severityRank[f.severity] || 0;
      return Math.max(max, rank);
    }, 0);

    const highSeverity = findings.filter(
      (f) => f.severity === "critical" || f.severity === "serious"
    );

    let conformance: VpatSection["conformance"];
    if (highSeverity.length > 0 || maxSeverity >= 3) {
      conformance = "Does Not Support";
    } else if (maxSeverity === 2) {
      conformance = "Partial";
    } else {
      conformance = "Supports";
    }

    const sampleFinding = findings[0];
    const remarks = `${findings.length} finding(s). ${sampleFinding.rule_id}: ${sampleFinding.rule_title}`;

    return {
      ...section,
      conformance,
      remarks,
    };
  });

  if (input.maturity) {
    template.sections.push({
      criteria: "Maturity Assessment",
      level: "AA",
      conformance: "Supports",
      remarks: `Overall maturity: ${input.maturity.overall} (${input.maturity.level}). ${input.maturity.byDomain.length} domains assessed.`,
    });
  }

  return template;
}

export function vpatToCsv(template: VpatTemplate): string {
  const header = "Criteria,Level,Conformance,Remarks\n";
  const rows = template.sections
    .map((s) => {
      const escapedRemarks = s.remarks.includes(",")
        ? `"${s.remarks.replace(/"/g, '""')}"`
        : s.remarks;
      return `${s.criteria},${s.level},${s.conformance},${escapedRemarks}`;
    })
    .join("\n");

  return header + rows;
}

export function vpatToJson(template: VpatTemplate): Record<string, unknown> {
  return {
    title: template.title,
    standard: template.standard,
    edition: template.edition,
    generatedAt: new Date().toISOString(),
    sections: template.sections.map((s) => ({
      criteria: s.criteria,
      level: s.level,
      conformance: s.conformance,
      remarks: s.remarks,
    })),
  };
}
