export interface VpatSection {
  criteria: string;
  level: "A" | "AA";
  conformance: "Supports" | "Partial" | "Does Not Support" | "Not Applicable";
  remarks: string;
}

export interface VpatTemplate {
  title: string;
  standard: string;
  edition: string;
  sections: VpatSection[];
}

const WCAG20_A_AA: Array<{ id: string; name: string; level: "A" | "AA" }> = [
  { id: "1.1.1", name: "Non-text Content", level: "A" },
  { id: "1.2.1", name: "Audio-only and Video-only (Prerecorded)", level: "A" },
  { id: "1.2.2", name: "Captions (Prerecorded)", level: "A" },
  { id: "1.2.3", name: "Audio Description or Media Alternative (Prerecorded)", level: "A" },
  { id: "1.2.4", name: "Captions (Live)", level: "AA" },
  { id: "1.2.5", name: "Audio Description (Prerecorded)", level: "AA" },
  { id: "1.3.1", name: "Info and Relationships", level: "A" },
  { id: "1.3.2", name: "Meaningful Sequence", level: "A" },
  { id: "1.3.3", name: "Sensory Characteristics", level: "A" },
  { id: "1.4.1", name: "Use of Color", level: "A" },
  { id: "1.4.2", name: "Audio Control", level: "A" },
  { id: "1.4.3", name: "Contrast (Minimum)", level: "AA" },
  { id: "1.4.4", name: "Resize Text", level: "AA" },
  { id: "1.4.5", name: "Images of Text", level: "AA" },
  { id: "2.1.1", name: "Keyboard", level: "A" },
  { id: "2.1.2", name: "No Keyboard Trap", level: "A" },
  { id: "2.2.1", name: "Timing Adjustable", level: "A" },
  { id: "2.2.2", name: "Pause, Stop, Hide", level: "A" },
  { id: "2.3.1", name: "Three Flashes or Below Threshold", level: "A" },
  { id: "2.4.1", name: "Bypass Blocks", level: "A" },
  { id: "2.4.2", name: "Page Titled", level: "A" },
  { id: "2.4.3", name: "Focus Order", level: "A" },
  { id: "2.4.4", name: "Link Purpose (In Context)", level: "A" },
  { id: "2.4.5", name: "Multiple Ways", level: "AA" },
  { id: "2.4.6", name: "Headings and Labels", level: "AA" },
  { id: "2.4.7", name: "Focus Visible", level: "AA" },
  { id: "3.1.1", name: "Language of Page", level: "A" },
  { id: "3.1.2", name: "Language of Parts", level: "AA" },
  { id: "3.2.1", name: "On Focus", level: "A" },
  { id: "3.2.2", name: "On Input", level: "A" },
  { id: "3.2.3", name: "Consistent Navigation", level: "AA" },
  { id: "3.2.4", name: "Consistent Identification", level: "AA" },
  { id: "3.3.1", name: "Error Identification", level: "A" },
  { id: "3.3.2", name: "Labels or Instructions", level: "A" },
  { id: "3.3.3", name: "Error Suggestion", level: "AA" },
  { id: "3.3.4", name: "Error Prevention (Legal, Financial, Data)", level: "AA" },
  { id: "4.1.1", name: "Parsing", level: "A" },
  { id: "4.1.2", name: "Name, Role, Value", level: "A" },
];

export function getVpatTemplate(): VpatTemplate {
  const sections: VpatSection[] = WCAG20_A_AA.map((sc) => ({
    criteria: `${sc.id} ${sc.name}`,
    level: sc.level,
    conformance: "Not Applicable",
    remarks: "",
  }));

  return {
    title: "Voluntary Product Accessibility Template (VPAT) 2.5",
    standard: "WCAG 2.0",
    edition: "508/WCAG",
    sections,
  };
}

export function getVpatCriteriaIds(): string[] {
  return WCAG20_A_AA.map((sc) => sc.id);
}
