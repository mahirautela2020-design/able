export interface RegulationMapping {
  regulationId: string;
  regulationName: string;
  jurisdiction: string;
  url: string;
  mappedScIds: string[];
  notes?: string;
}

export const REGULATION_MAPPINGS: RegulationMapping[] = [
  {
    regulationId: "section-508",
    regulationName: "Section 508 (Revised 2017)",
    jurisdiction: "United States",
    url: "https://www.access-board.gov/ict/",
    mappedScIds: [
      "1.1.1", "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5",
      "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.3.5",
      "1.4.1", "1.4.2", "1.4.3", "1.4.4", "1.4.5", "1.4.10", "1.4.11", "1.4.12",
      "2.1.1", "2.1.2", "2.1.4",
      "2.2.1", "2.2.2",
      "2.3.1",
      "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.5", "2.4.6", "2.4.7",
      "3.1.1", "3.1.2",
      "3.2.1", "3.2.2", "3.2.3", "3.2.4",
      "3.3.1", "3.3.2", "3.3.3", "3.3.4",
      "4.1.2", "4.1.3",
    ],
    notes: "Section 508 incorporates WCAG 2.0 Level A and AA by reference (36 CFR Part 1194, Appendix A). The 2017 refresh aligns with WCAG 2.0. WCAG 2.2 SCs are expected to be adopted in a future refresh.",
  },
  {
    regulationId: "en-301-549",
    regulationName: "EN 301 549 v3.2.1",
    jurisdiction: "European Union",
    url: "https://www.etsi.org/human-factors-accessibility/en-301-549-v3-the-harmonized-european-standard-for-ict-accessibility",
    mappedScIds: [
      "1.1.1", "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5",
      "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.3.5",
      "1.4.1", "1.4.2", "1.4.3", "1.4.4", "1.4.5", "1.4.10", "1.4.11", "1.4.12", "1.4.13",
      "2.1.1", "2.1.2", "2.1.4",
      "2.2.1", "2.2.2",
      "2.3.1",
      "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.5", "2.4.6", "2.4.7",
      "2.5.1", "2.5.2", "2.5.3", "2.5.4",
      "3.1.1", "3.1.2",
      "3.2.1", "3.2.2", "3.2.3", "3.2.4",
      "3.3.1", "3.3.2", "3.3.3", "3.3.4",
      "4.1.2", "4.1.3",
    ],
    notes: "EN 301 549 aligns with WCAG 2.1 Level A and AA. Serves as the harmonized standard under the European Accessibility Act (EAA) Directive 2019/882.",
  },
  {
    regulationId: "ada-title-ii",
    regulationName: "ADA Title II (Web Accessibility Rule)",
    jurisdiction: "United States",
    url: "https://www.ada.gov/resources/web-guidance/",
    mappedScIds: [
      "1.1.1", "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.3.5",
      "1.4.1", "1.4.3", "1.4.4", "1.4.5", "1.4.10", "1.4.11", "1.4.12", "1.4.13",
      "2.1.1", "2.1.2", "2.1.4",
      "2.2.1", "2.2.2",
      "2.3.1",
      "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.5", "2.4.6", "2.4.7",
      "2.5.1", "2.5.2", "2.5.3", "2.5.4",
      "3.1.1", "3.1.2",
      "3.2.1", "3.2.2", "3.2.3", "3.2.4",
      "3.3.1", "3.3.2", "3.3.3", "3.3.4",
      "4.1.2", "4.1.3",
    ],
    notes: "DOJ Final Rule (April 2024) requires WCAG 2.1 AA for state and local government web content and mobile apps. Compliance deadlines: April 2026 (large entities) / April 2027 (small entities).",
  },
  {
    regulationId: "ada-title-iii",
    regulationName: "ADA Title III (Public Accommodations)",
    jurisdiction: "United States",
    url: "https://www.ada.gov/",
    mappedScIds: [
      "1.1.1", "1.3.1", "1.3.2", "1.4.1", "1.4.3", "1.4.4", "1.4.11",
      "2.1.1", "2.1.2", "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.7",
      "3.1.1", "3.2.1", "3.2.2", "3.3.1", "3.3.2", "3.3.3", "3.3.4",
      "4.1.2", "4.1.3",
    ],
    notes: "No explicit federal regulation for commercial websites, but DOJ has consistently interpreted Title III to apply. Courts have repeatedly held WCAG 2.0/2.1 AA as the benchmark. Formal regulation expected.",
  },
  {
    regulationId: "aoda",
    regulationName: "AODA (Accessibility for Ontarians with Disabilities Act)",
    jurisdiction: "Canada (Ontario)",
    url: "https://www.ontario.ca/page/accessibility-laws",
    mappedScIds: [
      "1.1.1", "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.3.5",
      "1.4.1", "1.4.3", "1.4.4", "1.4.5", "1.4.10", "1.4.11",
      "2.1.1", "2.1.2", "2.1.4",
      "2.2.1", "2.2.2",
      "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.5", "2.4.6", "2.4.7",
      "3.1.1", "3.1.2",
      "3.2.1", "3.2.2", "3.2.3", "3.2.4",
      "3.3.1", "3.3.2", "3.3.3", "3.3.4",
      "4.1.2", "4.1.3",
    ],
    notes: "AODA Integrated Accessibility Standards Regulation (IASR) requires WCAG 2.0 Level AA. Public sector: Level AA. WCAG 2.1 AA compliance recommended.",
  },
  {
    regulationId: "aca",
    regulationName: "ACA (Accessible Canada Act)",
    jurisdiction: "Canada (Federal)",
    url: "https://www.canada.ca/en/employment-social-development/programs/accessible-people-disabilities.html",
    mappedScIds: [
      "1.1.1", "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.3.5",
      "1.4.1", "1.4.3", "1.4.4", "1.4.5", "1.4.10", "1.4.11", "1.4.12",
      "2.1.1", "2.1.2", "2.1.4",
      "2.2.1", "2.2.2",
      "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.5", "2.4.6", "2.4.7",
      "2.5.1", "2.5.2", "2.5.3",
      "3.1.1", "3.1.2",
      "3.2.1", "3.2.2", "3.2.3", "3.2.4",
      "3.3.1", "3.3.2", "3.3.3", "3.3.4",
      "4.1.2", "4.1.3",
    ],
    notes: "The Accessible Canada Act applies to federally regulated entities. Accessibility standards are being developed by Accessibility Standards Canada. EN 301 549 / WCAG 2.1 AA is the current benchmark.",
  },
  {
    regulationId: "w3c-wcag-22",
    regulationName: "W3C WCAG 2.2",
    jurisdiction: "International (W3C Standard)",
    url: "https://www.w3.org/TR/WCAG22/",
    mappedScIds: [
      "1.1.1",
      "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5", "1.2.6", "1.2.7", "1.2.8", "1.2.9",
      "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.3.5", "1.3.6",
      "1.4.1", "1.4.2", "1.4.3", "1.4.4", "1.4.5", "1.4.6", "1.4.7", "1.4.8", "1.4.9", "1.4.10", "1.4.11", "1.4.12", "1.4.13",
      "2.1.1", "2.1.2", "2.1.3", "2.1.4",
      "2.2.1", "2.2.2", "2.2.3", "2.2.4", "2.2.5", "2.2.6",
      "2.3.1", "2.3.2", "2.3.3",
      "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.5", "2.4.6", "2.4.7", "2.4.8", "2.4.9", "2.4.10", "2.4.11", "2.4.12", "2.4.13",
      "2.5.1", "2.5.2", "2.5.3", "2.5.4", "2.5.5", "2.5.6", "2.5.7", "2.5.8",
      "3.1.1", "3.1.2", "3.1.3", "3.1.4", "3.1.5", "3.1.6",
      "3.2.1", "3.2.2", "3.2.3", "3.2.4", "3.2.5", "3.2.6",
      "3.3.1", "3.3.2", "3.3.3", "3.3.4", "3.3.5", "3.3.6", "3.3.7", "3.3.8", "3.3.9",
      "4.1.2", "4.1.3",
    ],
    notes: "The canonical international standard. All other regulations in this mapping reference WCAG directly or indirectly.",
  },
  {
    regulationId: "uk-psbar",
    regulationName: "UK Public Sector Bodies Accessibility Regulations 2018",
    jurisdiction: "United Kingdom",
    url: "https://www.gov.uk/guidance/accessibility-requirements-for-public-sector-websites-and-apps",
    mappedScIds: [
      "1.1.1", "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.3.5",
      "1.4.1", "1.4.3", "1.4.4", "1.4.5", "1.4.10", "1.4.11", "1.4.12", "1.4.13",
      "2.1.1", "2.1.2", "2.1.4",
      "2.2.1", "2.2.2",
      "2.3.1",
      "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.5", "2.4.6", "2.4.7",
      "2.5.1", "2.5.2", "2.5.3",
      "3.1.1", "3.1.2",
      "3.2.1", "3.2.2", "3.2.3", "3.2.4",
      "3.3.1", "3.3.2", "3.3.3", "3.3.4",
      "4.1.2", "4.1.3",
    ],
    notes: "Requires WCAG 2.1 AA compliance for public sector websites and mobile apps. Must publish an accessibility statement.",
  },
];

export function getRegulationById(id: string): RegulationMapping | undefined {
  return REGULATION_MAPPINGS.find((r) => r.regulationId === id);
}

export function getScRegulationCoverage(scId: string): string[] {
  return REGULATION_MAPPINGS
    .filter((r) => r.mappedScIds.includes(scId))
    .map((r) => r.regulationId);
}
