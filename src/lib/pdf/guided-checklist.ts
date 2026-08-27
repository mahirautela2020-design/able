/**
 * Guided manual checklist for PDF accessibility.
 *
 * The Matterhorn Protocol's own numbers are the honest framing here: of its
 * 136 failure conditions, roughly 89 can be decided by software and ~47
 * require human judgement. `checks.ts` covers the machine-checkable side; this
 * file is the other half, stated as instructions rather than pretended results.
 *
 * Data only — no LLM, no fabricated outcomes. The UI renders these as steps
 * the operator performs, never as findings the tool produced.
 */

export interface PdfChecklistItem {
  id: string;
  instruction: string;
  /** WCAG success criterion this step verifies. */
  wcagSc: string;
  /** Matterhorn Protocol checkpoint, where one applies. */
  matterhorn?: string;
  /** Why software can't decide this one. */
  whyManual: string;
}

export const PDF_GUIDED_CHECKLIST: PdfChecklistItem[] = [
  {
    id: "alt-text-quality",
    instruction:
      "Read each image's alternate text with the image hidden. Confirm it conveys the image's purpose — not its filename, not \"image\", not a description of decoration.",
    wcagSc: "1.1.1",
    matterhorn: "13",
    whyManual:
      "Software can prove alt text is absent, but only a person can judge whether present alt text is accurate and useful.",
  },
  {
    id: "reading-order",
    instruction:
      "Step through the document with the Acrobat Order panel (or a screen reader). Confirm the tag order matches the intended reading order, especially around multi-column layouts, sidebars, and pull quotes.",
    wcagSc: "1.3.2",
    matterhorn: "09",
    whyManual:
      "The correct order is an authoring intent; the file only records one order, which may be confidently wrong.",
  },
  {
    id: "heading-hierarchy-meaning",
    instruction:
      "Check that the heading outline reflects the document's actual sections — that nothing is a heading only because it looked big, and no real section was left untagged.",
    wcagSc: "1.3.1",
    matterhorn: "14",
    whyManual: "Whether a line is a section heading is a semantic judgement, not a structural one.",
  },
  {
    id: "color-contrast",
    instruction:
      "Measure text and essential graphics against their backgrounds: 4.5:1 for body text, 3:1 for large text (18pt, or 14pt bold) and UI/graphical objects.",
    wcagSc: "1.4.3",
    matterhorn: "04",
    whyManual:
      "Contrast depends on rendered colour, overprint, transparency and colour management — not on anything the tag tree declares.",
  },
  {
    id: "color-not-sole-means",
    instruction:
      "Confirm no instruction, status, chart series, or required-field marker is distinguished by colour alone.",
    wcagSc: "1.4.1",
    matterhorn: "04",
    whyManual: "Requires understanding what the colour is being used to communicate.",
  },
  {
    id: "table-header-association",
    instruction:
      "For every table, verify each header cell's /Scope (or Headers/ID association) points at the right cells — especially in tables with merged or multi-level headers.",
    wcagSc: "1.3.1",
    matterhorn: "15",
    whyManual:
      "Software can see that headers exist; whether they are associated with the correct data cells depends on the table's meaning.",
  },
  {
    id: "artifact-vs-content",
    instruction:
      "Confirm running headers, footers, page numbers, watermarks and decorative rules are tagged as Artifacts, and that no real content was artifacted away.",
    wcagSc: "1.3.1",
    matterhorn: "01",
    whyManual:
      "Content marked as an Artifact is invisible to assistive technology; only a person can confirm nothing meaningful was hidden.",
  },
  {
    id: "language-of-parts",
    instruction:
      "Confirm passages in a different language from the document default carry their own /Lang entry.",
    wcagSc: "3.1.2",
    matterhorn: "11",
    whyManual: "Detecting which passages changed language requires reading them.",
  },
  {
    id: "ocr-accuracy",
    instruction:
      "If the document was OCR'd, proofread the recognised text against the page image. OCR errors are silent — they read aloud as confident nonsense.",
    wcagSc: "1.1.1",
    matterhorn: "08",
    whyManual: "Only comparison against the source page reveals a mis-recognised character.",
  },
  {
    id: "form-tab-order",
    instruction:
      "Tab through every form field. Confirm the order is logical, required fields are announced as required, and errors identify the field and how to fix it.",
    wcagSc: "3.3.1",
    matterhorn: "24",
    whyManual: "Requires interacting with the form, and judging whether the order makes sense.",
  },
  {
    id: "screen-reader-pass",
    instruction:
      "Read the whole document once with NVDA or VoiceOver. Listen for content announced twice, content skipped entirely, and lists or tables announced with the wrong counts.",
    wcagSc: "1.3.1",
    matterhorn: "01",
    whyManual:
      "The end-to-end experience is the actual requirement; every static check is a proxy for it.",
  },
  {
    id: "flicker-and-media",
    instruction:
      "Confirm the document contains nothing that flashes more than three times per second, and that any embedded audio or video has captions and a transcript.",
    wcagSc: "2.3.1",
    matterhorn: "03",
    whyManual: "Requires playing the embedded media.",
  },
];
