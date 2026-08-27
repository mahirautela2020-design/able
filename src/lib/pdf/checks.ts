import {
  walkStructTree,
  type PdfDocumentModel,
  type PdfPageModel,
  type PdfStructNode,
} from "./parse";

/**
 * Deterministic PDF accessibility checks.
 *
 * Every rule below is derived from a published, machine-checkable condition —
 * no LLM, no heuristic scoring, no invented criteria:
 *
 *   - **PDF/UA-1** (ISO 14289-1) as operationalised by the PDF Association's
 *     **Matterhorn Protocol 1.1** — 31 checkpoints / 136 failure conditions,
 *     ~89 of which software can decide alone. Each finding cites its checkpoint.
 *     https://pdfa.org/resource/matterhorn-protocol/
 *   - **W3C WCAG PDF Techniques** (PDF1–PDF23), which map a PDF construct to
 *     the success criterion it satisfies or fails.
 *     https://www.w3.org/WAI/WCAG22/Techniques/#pdf
 *
 * SEVERITY RULE (mirrors how axe-core is treated elsewhere in the pipeline):
 * `violation` is used only where the file's own declared structure proves the
 * failure — a missing `/Lang`, an untagged document, a `Figure` with no `/Alt`.
 * Everything requiring human judgement (is the alt text *meaningful*? is the
 * reading order *correct*?) is `needs_review`, and the un-automatable half of
 * Matterhorn is handed to the operator as the guided checklist instead.
 */

export type PdfSeverity = "violation" | "needs_review";

export interface PdfFinding {
  ruleId: string;
  /** WCAG success criterion, e.g. "1.1.1". */
  criterion: string;
  /** Matterhorn Protocol checkpoint number, e.g. "13" (empty when WCAG-only). */
  matterhorn: string;
  /** Relevant W3C PDF technique id, e.g. "PDF1" (empty when none applies). */
  technique: string;
  severity: PdfSeverity;
  source: "pdf-static";
  /** Where the evidence lives, e.g. "page 3 · <Figure>" or "document catalog". */
  element: string;
  message: string;
  /** How to fix it, in authoring-tool terms. */
  remediation: string;
  evidence: Record<string, unknown>;
}

interface FindingInput {
  ruleId: string;
  criterion: string;
  matterhorn?: string;
  technique?: string;
  severity: PdfSeverity;
  element: string;
  message: string;
  remediation: string;
  evidence?: Record<string, unknown>;
}

function finding(input: FindingInput): PdfFinding {
  return {
    ruleId: input.ruleId,
    criterion: input.criterion,
    matterhorn: input.matterhorn ?? "",
    technique: input.technique ?? "",
    severity: input.severity,
    source: "pdf-static",
    element: input.element,
    message: input.message,
    remediation: input.remediation,
    evidence: input.evidence ?? {},
  };
}

/** Heading roles carry their level in the tag name (H1..H6); `H` is unnumbered. */
const HEADING_RE = /^H([1-6])$/;

/** Link phrases that carry no purpose out of context (PDF13 / SC 2.4.4). */
const AMBIGUOUS_LINK_TEXT = [
  "click here",
  "read more",
  "learn more",
  "more info",
  "see more",
  "this link",
];

/** A page with meaningful ink but essentially no extractable text is a scan. */
const SCANNED_PAGE_TEXT_THRESHOLD = 10;

/** Below this page count a missing outline isn't worth flagging (PDF2). */
const BOOKMARK_PAGE_THRESHOLD = 10;

function collectRoles(pages: PdfPageModel[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    walkStructTree(page.structRoots, (node) => {
      counts.set(node.role, (counts.get(node.role) ?? 0) + 1);
    });
  }
  return counts;
}

/** ── Document-level checks ─────────────────────────────────────────────── */

function checkTagging(doc: PdfDocumentModel): PdfFinding[] {
  if (doc.tagged) return [];
  // Everything else in PDF/UA is defined in terms of the tag tree, so an
  // untagged file fails at the root: a screen reader gets no structure at all.
  return [
    finding({
      ruleId: "pdf-not-tagged",
      criterion: "1.3.1",
      matterhorn: "01",
      technique: "PDF17",
      severity: "violation",
      element: "document catalog · /MarkInfo",
      message:
        "The document is not tagged. Without a tag tree, assistive technology has no headings, lists, tables, or reading order to work with — it can only guess from visual layout.",
      remediation:
        "Re-export from the source application with tagging enabled (Word: 'Best for electronic distribution and accessibility'; InDesign: Export as Tagged PDF), or add tags in Acrobat Pro via Accessibility → Autotag Document, then correct them by hand.",
      evidence: { marked: false },
    }),
  ];
}

function checkLanguage(doc: PdfDocumentModel): PdfFinding[] {
  if (doc.lang) return [];
  return [
    finding({
      ruleId: "pdf-no-document-language",
      criterion: "3.1.1",
      matterhorn: "11",
      technique: "PDF16",
      severity: "violation",
      element: "document catalog · /Lang",
      message:
        "No default language is declared for the document. Screen readers fall back to the user's system voice, so the text may be pronounced with the wrong language's phonetics.",
      remediation:
        "Set the document language — Acrobat Pro: File → Properties → Advanced → Reading Options → Language; Word: Review → Language → Set Proofing Language before export.",
      evidence: { lang: null },
    }),
  ];
}

function checkTitle(doc: PdfDocumentModel): PdfFinding[] {
  const findings: PdfFinding[] = [];
  if (!doc.title) {
    findings.push(
      finding({
        ruleId: "pdf-no-title",
        criterion: "2.4.2",
        matterhorn: "06",
        technique: "PDF18",
        severity: "violation",
        element: "document information dictionary · /Title",
        message:
          "The document has no title. Viewers and assistive technology fall back to the filename, which rarely describes the document.",
        remediation:
          "Acrobat Pro: File → Properties → Description → Title. Set a short phrase that describes the document, not the filename.",
        evidence: { title: null },
      })
    );
  } else if (!doc.displayDocTitle) {
    // A title that viewers never surface is, in practice, no title at all —
    // Matterhorn 06 requires ViewerPreferences/DisplayDocTitle to be true.
    findings.push(
      finding({
        ruleId: "pdf-title-not-displayed",
        criterion: "2.4.2",
        matterhorn: "06",
        technique: "PDF18",
        severity: "violation",
        element: "document catalog · /ViewerPreferences /DisplayDocTitle",
        message: `The document has a title ("${doc.title}") but /DisplayDocTitle is not set, so viewers show the filename in the window title instead.`,
        remediation:
          "Acrobat Pro: File → Properties → Initial View → Window Options → Show: Document Title.",
        evidence: { title: doc.title, displayDocTitle: false },
      })
    );
  }
  return findings;
}

function checkSecurity(doc: PdfDocumentModel): PdfFinding[] {
  if (doc.accessibilityExtractionAllowed) return [];
  return [
    finding({
      ruleId: "pdf-accessibility-extraction-blocked",
      criterion: "1.1.1",
      matterhorn: "26",
      severity: "violation",
      element: "document encryption dictionary · /P",
      message:
        "The document's security settings revoke content extraction for accessibility. Assistive technology is blocked from reading the text at all.",
      remediation:
        "Re-apply security with 'Enable text access for screen reader devices for the visually impaired' checked (Acrobat Pro: File → Properties → Security → Permissions).",
      evidence: { encrypted: true, accessibilityExtractionAllowed: false },
    }),
  ];
}

function checkXfa(doc: PdfDocumentModel): PdfFinding[] {
  if (!doc.hasXfa) return [];
  return [
    finding({
      ruleId: "pdf-xfa-form",
      criterion: "4.1.2",
      matterhorn: "25",
      severity: "violation",
      element: "AcroForm · /XFA",
      message:
        "The file uses an XFA form. XFA is not part of PDF 2.0, is unsupported by most viewers (including browsers and mobile readers), and is explicitly disallowed by PDF/UA.",
      remediation:
        "Rebuild the form as a standard AcroForm with tagged, tooltip-labelled fields, or provide an accessible HTML form as an alternative.",
      evidence: { hasXfa: true },
    }),
  ];
}

function checkBookmarks(doc: PdfDocumentModel): PdfFinding[] {
  if (doc.pageCount < BOOKMARK_PAGE_THRESHOLD || doc.outlineCount > 0) return [];
  return [
    finding({
      ruleId: "pdf-no-bookmarks",
      criterion: "2.4.5",
      technique: "PDF2",
      severity: "needs_review",
      element: "document catalog · /Outlines",
      message: `This ${doc.pageCount}-page document has no bookmarks. Long documents need a second way to reach a section besides scrolling page by page.`,
      remediation:
        "Generate bookmarks from the heading structure (Acrobat Pro: Bookmarks panel → Options → New Bookmarks from Structure).",
      evidence: { pageCount: doc.pageCount, outlineCount: 0 },
    }),
  ];
}

function checkPdfUaIdentifier(doc: PdfDocumentModel): PdfFinding[] {
  if (doc.pdfUaPart || !doc.tagged) return [];
  // Only meaningful for a tagged file — an untagged one already failed above,
  // and a missing claim is weaker evidence than a wrong one, hence review.
  return [
    finding({
      ruleId: "pdf-no-pdfua-identifier",
      criterion: "1.3.1",
      matterhorn: "06",
      severity: "needs_review",
      element: "XMP metadata · pdfuaid:part",
      message:
        "The document is tagged but carries no PDF/UA identifier in its XMP metadata, so it does not formally claim PDF/UA conformance. This does not by itself make the file inaccessible.",
      remediation:
        "If the file is intended to conform, add the PDF/UA identifier (pdfuaid:part) during export or with a PDF/UA-aware tool such as veraPDF or axesPDF.",
      evidence: { tagged: true, pdfUaPart: null },
    }),
  ];
}

/** ── Structure-tree checks ─────────────────────────────────────────────── */

function checkFigureAlt(doc: PdfDocumentModel): PdfFinding[] {
  const findings: PdfFinding[] = [];
  for (const page of doc.pages) {
    let index = 0;
    walkStructTree(page.structRoots, (node) => {
      if (node.role !== "Figure") return;
      index++;
      // `/ActualText` substitutes for the content itself and is an accepted
      // alternative to `/Alt` under Matterhorn 13-004.
      if (node.alt?.trim() || node.actualText?.trim()) return;
      findings.push(
        finding({
          ruleId: "pdf-figure-missing-alt",
          criterion: "1.1.1",
          matterhorn: "13",
          technique: "PDF1",
          severity: "violation",
          element: `page ${page.pageNumber} · <Figure> #${index}`,
          message:
            "A <Figure> element has neither /Alt nor /ActualText, so its content is announced as nothing at all.",
          remediation:
            "Add alternate text describing the image's purpose (Acrobat Pro: Tags panel → right-click the Figure tag → Properties → Alternate Text). If the image is purely decorative, re-tag it as an Artifact instead.",
          evidence: { pageNumber: page.pageNumber, role: "Figure", alt: null, actualText: null },
        })
      );
    });
  }
  return findings;
}

function checkHeadings(doc: PdfDocumentModel): PdfFinding[] {
  if (!doc.tagged) return [];
  const findings: PdfFinding[] = [];

  // Reading order is the tag order, so collect levels in document sequence.
  const levels: Array<{ level: number; pageNumber: number }> = [];
  for (const page of doc.pages) {
    walkStructTree(page.structRoots, (node) => {
      const match = HEADING_RE.exec(node.role);
      if (match) levels.push({ level: Number(match[1]), pageNumber: page.pageNumber });
    });
  }

  const hasText = doc.pages.some((p) => p.textLength > 0);
  if (levels.length === 0 && hasText) {
    findings.push(
      finding({
        ruleId: "pdf-no-headings",
        criterion: "1.3.1",
        matterhorn: "14",
        technique: "PDF9",
        severity: "needs_review",
        element: "structure tree",
        message:
          "The document is tagged but contains no heading tags (H1–H6). Readers who navigate by heading have no way to skim it. Confirm whether this document genuinely has no sections.",
        remediation:
          "Apply real heading styles in the source document before export — visually large text is not a heading unless it is tagged as one.",
        evidence: { headingCount: 0 },
      })
    );
    return findings;
  }

  for (let i = 1; i < levels.length; i++) {
    const previous = levels[i - 1];
    const current = levels[i];
    if (current.level > previous.level + 1) {
      findings.push(
        finding({
          ruleId: "pdf-heading-level-skipped",
          criterion: "1.3.1",
          matterhorn: "14",
          technique: "PDF9",
          severity: "needs_review",
          element: `page ${current.pageNumber} · <H${current.level}>`,
          message: `Heading levels jump from H${previous.level} to H${current.level}. A skipped level makes the outline ambiguous — readers can't tell whether a section was missed.`,
          remediation: `Use H${previous.level + 1} here, or add the intermediate heading the outline implies.`,
          evidence: { from: previous.level, to: current.level, pageNumber: current.pageNumber },
        })
      );
    }
  }

  return findings;
}

function checkTables(doc: PdfDocumentModel): PdfFinding[] {
  const findings: PdfFinding[] = [];
  for (const page of doc.pages) {
    let index = 0;
    walkStructTree(page.structRoots, (node) => {
      if (node.role !== "Table") return;
      index++;

      let headerCells = 0;
      let dataCells = 0;
      walkStructTree([node], (descendant) => {
        if (descendant.role === "TH") headerCells++;
        if (descendant.role === "TD") dataCells++;
      });

      if (dataCells > 0 && headerCells === 0) {
        findings.push(
          finding({
            ruleId: "pdf-table-no-header-cells",
            criterion: "1.3.1",
            matterhorn: "15",
            technique: "PDF6",
            severity: "violation",
            element: `page ${page.pageNumber} · <Table> #${index}`,
            message: `A table with ${dataCells} data cells has no <TH> header cells, so a screen reader cannot announce which row or column a value belongs to.`,
            remediation:
              "Tag the header row/column cells as <TH> and set their /Scope (Row or Column). Acrobat Pro: Accessibility → Reading Order → Table Editor.",
            evidence: { pageNumber: page.pageNumber, headerCells: 0, dataCells },
          })
        );
      }
    });
  }
  return findings;
}

function checkLists(doc: PdfDocumentModel): PdfFinding[] {
  const findings: PdfFinding[] = [];
  for (const page of doc.pages) {
    let index = 0;
    walkStructTree(page.structRoots, (node) => {
      if (node.role !== "L") return;
      index++;
      // PDF/UA (Matterhorn 16-003): the only permitted children of <L> are
      // <LI> (plus an optional <Caption>).
      const invalid = node.children
        .map((child: PdfStructNode) => child.role)
        .filter((role) => role !== "LI" && role !== "Caption");
      if (invalid.length === 0) return;
      findings.push(
        finding({
          ruleId: "pdf-list-structure-invalid",
          criterion: "1.3.1",
          matterhorn: "16",
          technique: "PDF21",
          severity: "violation",
          element: `page ${page.pageNumber} · <L> #${index}`,
          message: `A list contains ${invalid.length} child element(s) that are not <LI>: ${[...new Set(invalid)].join(", ")}. Screen readers announce list length and position from this structure, so it reports the wrong count.`,
          remediation:
            "Re-tag so every direct child of <L> is an <LI>, each containing <Lbl> (the bullet/number) and <LBody> (the item text).",
          evidence: { pageNumber: page.pageNumber, invalidChildRoles: [...new Set(invalid)] },
        })
      );
    });
  }
  return findings;
}

/** ── Annotation checks ─────────────────────────────────────────────────── */

function checkLinks(doc: PdfDocumentModel): PdfFinding[] {
  const findings: PdfFinding[] = [];
  for (const page of doc.pages) {
    const missing = page.linkAnnotations.filter((link) => !link.altText.trim());
    if (missing.length === 0) continue;
    // Kept as needs_review, not a violation: WCAG 2.4.4 also accepts purpose
    // conveyed by the link text itself, which we can't reliably associate with
    // an annotation rectangle. PDF/UA is stricter (Matterhorn 28).
    findings.push(
      finding({
        ruleId: "pdf-link-annotation-no-alt",
        criterion: "2.4.4",
        matterhorn: "28",
        technique: "PDF13",
        severity: "needs_review",
        element: `page ${page.pageNumber} · Link annotations`,
        message: `${missing.length} of ${page.linkAnnotations.length} link annotation(s) on this page have no /Contents alternate description. Check that the visible link text alone makes each destination clear.`,
        remediation:
          "Add an alternate description to each Link annotation (Acrobat Pro: right-click the link → Properties → Contents), or rewrite the visible link text so it states the destination.",
        evidence: {
          pageNumber: page.pageNumber,
          missing: missing.length,
          total: page.linkAnnotations.length,
          urls: missing.map((l) => l.url).filter(Boolean).slice(0, 10),
        },
      })
    );
  }
  return findings;
}

function checkFormFields(doc: PdfDocumentModel): PdfFinding[] {
  const findings: PdfFinding[] = [];
  for (const page of doc.pages) {
    // Push buttons take their name from their caption, so an absent tooltip
    // there isn't automatically a missing accessible name.
    const labelled = page.formFields.filter((f) => f.fieldType !== "Btn");
    const missing = labelled.filter((f) => !f.tooltip.trim());
    if (missing.length === 0) continue;
    findings.push(
      finding({
        ruleId: "pdf-form-field-no-label",
        criterion: "4.1.2",
        matterhorn: "28",
        technique: "PDF10",
        severity: "violation",
        element: `page ${page.pageNumber} · form fields`,
        message: `${missing.length} form field(s) have no /TU tooltip, so they are announced only by their internal field name (or as an unlabelled control). Visible text near a field is not connected to it.`,
        remediation:
          "Give every field a tooltip that repeats its visible label (Acrobat Pro: Prepare Form → double-click the field → General → Tooltip).",
        evidence: {
          pageNumber: page.pageNumber,
          missing: missing.length,
          fieldNames: missing.map((f) => f.fieldName).filter(Boolean).slice(0, 10),
        },
      })
    );
  }
  return findings;
}

/** ── Content checks ────────────────────────────────────────────────────── */

function checkScannedPages(doc: PdfDocumentModel): PdfFinding[] {
  const scanned = doc.pages.filter(
    (page) => page.hasRasterImage && page.textLength < SCANNED_PAGE_TEXT_THRESHOLD
  );
  if (scanned.length === 0) return [];
  return [
    finding({
      ruleId: "pdf-scanned-image-only",
      criterion: "1.1.1",
      matterhorn: "08",
      severity: "violation",
      element: `pages ${scanned.map((p) => p.pageNumber).slice(0, 10).join(", ")}`,
      message: `${scanned.length} page(s) contain images but essentially no extractable text — this is a scan, not a document. None of that content is available to a screen reader, and it cannot be searched, selected, or reflowed.`,
      remediation:
        "Run OCR over the document (Acrobat Pro: Scan & OCR → Recognize Text), then proofread the result — OCR errors become silent misreadings — and tag the recognised structure.",
      evidence: { scannedPages: scanned.map((p) => p.pageNumber), pageCount: doc.pageCount },
    }),
  ];
}

/** Scans extracted text for link phrases that carry no purpose out of context. */
export function findAmbiguousLinkPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return AMBIGUOUS_LINK_TEXT.filter((phrase) => lower.includes(phrase));
}

function checkAmbiguousLinkText(doc: PdfDocumentModel): PdfFinding[] {
  const findings: PdfFinding[] = [];
  for (const page of doc.pages) {
    // Only worth raising where the page actually has links — the same words
    // in running prose ("read more about this in chapter 4") aren't a defect.
    if (page.linkAnnotations.length === 0) continue;
    const phrases = findAmbiguousLinkPhrases(page.text);
    if (phrases.length === 0) continue;
    findings.push(
      finding({
        ruleId: "pdf-ambiguous-link-text",
        criterion: "2.4.4",
        technique: "PDF13",
        severity: "needs_review",
        element: `page ${page.pageNumber} · link text`,
        message: `This page has links and contains the phrase(s) ${phrases.map((p) => `"${p}"`).join(", ")}. If those phrases are the link text, the destination isn't clear to someone tabbing through links out of context.`,
        remediation:
          'Rewrite the link text to name its destination ("Download the 2026 fee schedule" rather than "click here"), or add an /Contents alternate description to the link annotation.',
        evidence: { pageNumber: page.pageNumber, phrases, linkCount: page.linkAnnotations.length },
      })
    );
  }
  return findings;
}

/**
 * Run every static check against a parsed document.
 *
 * Order is stable and severity-first so the report reads top-down: proven
 * failures before things a human still has to decide.
 */
export function runPdfChecks(doc: PdfDocumentModel): PdfFinding[] {
  const findings = [
    ...checkTagging(doc),
    ...checkSecurity(doc),
    ...checkXfa(doc),
    ...checkLanguage(doc),
    ...checkTitle(doc),
    ...checkScannedPages(doc),
    ...checkFigureAlt(doc),
    ...checkTables(doc),
    ...checkLists(doc),
    ...checkFormFields(doc),
    ...checkHeadings(doc),
    ...checkLinks(doc),
    ...checkAmbiguousLinkText(doc),
    ...checkBookmarks(doc),
    ...checkPdfUaIdentifier(doc),
  ];

  return findings.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "violation" ? -1 : 1;
  });
}

/** Roles present in the document — surfaced in the UI as a structure summary. */
export function summarizeStructure(doc: PdfDocumentModel): Record<string, number> {
  return Object.fromEntries([...collectRoles(doc.pages).entries()].sort());
}
